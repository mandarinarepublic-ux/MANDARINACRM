export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { requireAdmin } from '@/lib/auth'
import { shopifyGraphQLPorTienda } from '@/lib/shopify'
import { construirProductSetInput, verificarProducto } from '@/lib/shopifyProducto'

// Publica el producto en Shopify — SOLO ADMIN.
//
// ☠️ Nace en BORRADOR, se VUELVE A LEER de Shopify, y solo si todo cuadra pasa
// a ACTIVO. Verificado el 10-sep-2026: productCreate devolvio userErrors: [] con
// 1 variante de 5 a 0.00 y sin categoria. Un 200 no prueba nada. Con este orden
// nunca existe un instante en que un producto a medio armar este comprable.

const CAMPOS = `
  id handle status onlineStoreUrl
  seo { title description }
  category { id }
  variants(first: 20) { nodes { id title price } }
  media(first: 20) { nodes { alt status } }`

const SET = `
mutation FijarProducto($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product { ${CAMPOS} }
    userErrors { field message code }
  }
}`

const LEER = `query LeerProducto($id: ID!) { product(id: $id) { ${CAMPOS} } }`

// ☠️ Poner el producto en ACTIVE **no** lo hace visible en la web. Lo dice la
// documentacion del propio esquema: "Products with an active status aren't
// automatically published to sales channels, such as the online store".
// Sin este paso el producto queda activo y comprable por API, pero NINGUN
// cliente lo ve en mandarinaec.com. Hay que publicarlo al canal a mano.
const CANALES = `query Canales { publications(first: 20) { nodes { id name } } }`

const PUBLICAR_CANAL = `
mutation PublicarEnCanal($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    publishable { ... on Product { id onlineStoreUrl } }
    userErrors { field message }
  }
}`

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({}))
    const tienda = body.tienda || 'MANDARINA'

    // 1) Crear (o actualizar, si ya hay id de un intento anterior) en BORRADOR.
    const input = construirProductSetInput({ ...body, status: 'DRAFT' })
    const creado = await shopifyGraphQLPorTienda(tienda, SET, { input })
    const errores = creado?.productSet?.userErrors || []
    if (errores.length) {
      return Response.json({ error: errores.map((e) => e.message).join(' · ') }, { status: 400 })
    }
    const producto = creado?.productSet?.product
    if (!producto?.id) return Response.json({ error: 'Shopify no devolvió el producto' }, { status: 502 })

    // 2) Releer de Shopify y verificar. NO se confia en la respuesta de arriba.
    //
    // ☠️ Shopify procesa las imagenes de forma ASINCRONA: "images might not be
    // immediately available after upload". Recien creado el producto, las fotos
    // estan en UPLOADED o PROCESSING, no en READY — verificar una sola vez
    // dejaria en borrador casi toda publicacion legitima. Por eso se reintenta
    // mientras lo UNICO que falta sea que las fotos terminen de procesarse.
    const esperado = {
      tallas: body.tallas || [],
      fotos: (body.fotos || []).length,
    }
    const espera = (ms) => new Promise((r) => setTimeout(r, ms))
    const soloFaltanFotos = (f) => f.length > 0 && f.every((x) => /imagen/i.test(x))

    let ok = false
    let fallos = []
    for (let intento = 0; intento < 6; intento++) {
      const leido = await shopifyGraphQLPorTienda(tienda, LEER, { id: producto.id })
      ;({ ok, fallos } = verificarProducto(leido?.product, esperado))
      if (ok || !soloFaltanFotos(fallos)) break   // listo, o roto por otra cosa
      await espera(2000)                          // hasta ~12 s de procesado
    }

    // 3) Solo si esta sano, se activa Y se publica al canal Tienda Online.
    //    `soloBorrador` es el boton Despublicar: se salta este paso entero.
    let activado = false
    let urlTienda = null
    if (ok && !body.soloBorrador) {
      const act = await shopifyGraphQLPorTienda(tienda, SET, {
        input: { id: producto.id, status: 'ACTIVE' },
      })
      activado = act?.productSet?.product?.status === 'ACTIVE'

      // ☠️ ACTIVE no basta: hay que publicarlo al canal o nadie lo ve en la web.
      const canales = await shopifyGraphQLPorTienda(tienda, CANALES)
      const online = (canales?.publications?.nodes || [])
        .find((c) => /online store|tienda online/i.test(c.name || ''))
      if (online) {
        const pub = await shopifyGraphQLPorTienda(tienda, PUBLICAR_CANAL, {
          id: producto.id, input: [{ publicationId: online.id }],
        })
        urlTienda = pub?.publishablePublish?.publishable?.onlineStoreUrl || null
      }
      // Si no hay URL publica, el producto NO se ve aunque diga ACTIVO.
      if (!urlTienda) {
        ok = false
        fallos.push('El producto está activo pero no quedó visible en la tienda online')
      }
    }

    // 4) Refrescar el catalogo para que aparezca en los DOS inbox. Si falla, el
    //    producto SIGUE publicado: son dos estados distintos y se informan aparte.
    let sync = 'ok'
    try {
      const r = await fetch(new URL('/api/shopify/sync', req.url), {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
      })
      if (!r.ok) sync = 'falló'
    } catch { sync = 'falló' }

    const numerico = String(producto.id).split('/').pop()
    return Response.json({
      ok, activado, fallos, sync, urlTienda,
      productoId: producto.id,
      handle: producto.handle,
      urlAdmin: `https://admin.shopify.com/store/${tienda.toLowerCase()}/products/${numerico}`,
    })
  } catch (e) {
    const msg = String(e.message || e)
    // ⚠️ El token se cachea ~24 h en memoria (lib/shopify.js). Tras cambiar los
    // permisos en Shopify, una instancia tibia sigue con el token VIEJO.
    if (/403/.test(msg)) {
      return Response.json({
        error: 'Shopify rechazó la escritura (403). Puede ser el token cacheado de hasta 24 h: espera un momento y vuelve a intentar. Si sigue, revisa que la app tenga write_products.',
      }, { status: 403 })
    }
    console.error('publicar error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
