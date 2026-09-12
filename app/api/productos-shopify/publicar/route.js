export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { requireAdmin } from '@/lib/auth'
import { shopifyGraphQLPorTienda, getTiendasConfig } from '@/lib/shopify'
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

// ☠️ Para cambiar SOLO el estado se usa productUpdate, NUNCA productSet.
// productSet es declarativo: en los campos de lista (variantes, opciones,
// metafields) BORRA lo que no venga en el input. Un productSet con solo
// {id, status} puede dejar el producto ACTIVO y sin una sola variante.
const ACTIVAR = `
mutation ActivarProducto($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { ${CAMPOS} }
    userErrors { field message }
  }
}`

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

    // ☠️ Desde aqui el producto YA EXISTE en Shopify (tiene id). Si algo revienta
    // -incluido un corte de red durante la RELECTURA de abajo- y la excepcion
    // sube al catch de afuera, el usuario ve un 500 generico SIN productoId ni
    // enlace, cree que no se publico nada, reintenta, y como el reintento no
    // manda `id` Shopify CREA UN PRODUCTO DUPLICADO dejando huerfano el primero.
    // Por eso el try arranca AQUI -antes empezaba un paso tarde, dejando el
    // bucle de relectura FUERA de la guardia- y este bloque SIEMPRE deja llegar
    // la respuesta final con el id: un fallo aqui se cuenta, no se convierte en
    // "no pasó nada".
    let ok = false
    let fallos = []
    let activado = false
    let urlTienda = null
    try {
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

      // ⚠️ Se reintenta segun `fotosEnProceso`, que verificarProducto calcula con
      // los ESTADOS de la media — nunca leyendo el texto de los fallos.
      const INTENTOS = 6
      for (let intento = 0; intento < INTENTOS; intento++) {
        const leido = await shopifyGraphQLPorTienda(tienda, LEER, { id: producto.id })
        let enProceso
        ;({ ok, fallos, fotosEnProceso: enProceso } = verificarProducto(leido?.product, esperado))
        if (ok || !enProceso) break                        // listo, o roto por otra cosa
        if (intento < INTENTOS - 1) await espera(2000)     // hasta ~10 s de procesado
      }

      // 3) Solo si esta sano, se activa Y se publica al canal Tienda Online.
      //    `soloBorrador` es el boton Despublicar: se salta este paso entero.
      if (ok && !body.soloBorrador) {
        const act = await shopifyGraphQLPorTienda(tienda, ACTIVAR, {
          product: { id: producto.id, status: 'ACTIVE' },
        })
        const errAct = act?.productUpdate?.userErrors || []
        activado = act?.productUpdate?.product?.status === 'ACTIVE'
        if (!activado) {
          fallos.push(errAct.length
            ? `Shopify no pudo activar el producto: ${errAct.map((e) => e.message).join(' · ')}`
            : 'Shopify no pudo activar el producto')
        }

        // ☠️ ACTIVE no basta: hay que publicarlo al canal o nadie lo ve en la web.
        if (activado) {
          const canales = await shopifyGraphQLPorTienda(tienda, CANALES)
          const online = (canales?.publications?.nodes || [])
            .find((c) => /online store|tienda online/i.test(c.name || ''))

          if (!online) {
            // Distinto de "el canal lo rechazo": aqui ni se intento.
            fallos.push('No se encontró el canal Tienda Online en esta tienda de Shopify')
          } else {
            const pub = await shopifyGraphQLPorTienda(tienda, PUBLICAR_CANAL, {
              id: producto.id, input: [{ publicationId: online.id }],
            })
            const errPub = pub?.publishablePublish?.userErrors || []
            urlTienda = pub?.publishablePublish?.publishable?.onlineStoreUrl || null
            if (!urlTienda) {
              fallos.push(errPub.length
                ? `El canal Tienda Online rechazó la publicación: ${errPub.map((e) => e.message).join(' · ')}`
                : 'El producto está activo pero no quedó visible en la tienda online')
            }
          }
        }
      }
    } catch (e) {
      const m = String(e.message || e)
      // ⚠️ Con los permisos de hoy (solo read_inventory, write_products) este
      // paso falla SIEMPRE: publishablePublish exige write_publications y la
      // consulta de canales exige read_publications. Sin este aviso especifico
      // se manda a diagnosticar el problema donde no esta.
      fallos.push(/403|ACCESS_DENIED/i.test(m)
        ? `El producto se creó y quedó activo, pero falta permiso para publicarlo al canal. La app de Shopify necesita read_publications y write_publications. Detalle: ${m}`
        : `El producto se creó, pero falló al verificarlo, activarlo o publicarlo: ${m}`)
    }

    // La prueba de que se ve es la URL real, no que ninguna mutation fallara.
    // Solo aplica si de verdad se intento activar (si `soloBorrador`, `ok` ya
    // trae lo que dijo verificarProducto y no hay nada que corregir aqui).
    if (ok && !body.soloBorrador && !urlTienda) ok = false

    // 4) Refrescar el catalogo para que aparezca en los DOS inbox. Si falla, el
    //    producto SIGUE publicado: son dos estados distintos y se informan aparte.
    // ⚠️ Con TIMEOUT a proposito. El sync pagina las DOS tiendas de Shopify, lee
    // la hoja de Google y escribe en Sheets + Supabase: no es barato. Para cuando
    // se lo llama, esta ruta ya gastó el productSet, hasta ~10 s de reintentos y
    // tres mutaciones más. Si el total pasa de `maxDuration = 60`, el runtime
    // corta la funcion y el usuario ve un fallo de PUBLICACION por un producto
    // que sí quedó publicado y activo — justo lo que este bloque promete evitar.
    // Un catch no salva de que te maten la funcion; un timeout sí.
    let sync = 'ok'
    try {
      const r = await fetch(new URL('/api/shopify/sync', req.url), {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) sync = 'falló'
    } catch { sync = 'falló' }

    // El handle de la tienda sale de la config real (`xxx.myshopify.com`), NUNCA
    // del id interno del CRM (MANDARINA/INDSTORE): son cosas distintas y armar
    // el enlace desde el id daba siempre 404.
    const store = getTiendasConfig().find((t) => t.id === tienda)?.store || ''
    const handleTienda = store.replace(/\.myshopify\.com$/, '')
    const numerico = String(producto.id).split('/').pop()
    const urlAdmin = handleTienda
      ? `https://admin.shopify.com/store/${handleTienda}/products/${numerico}`
      : null

    return Response.json({
      ok, activado, fallos, sync, urlTienda,
      productoId: producto.id,
      handle: producto.handle,
      urlAdmin,
    })
  } catch (e) {
    const msg = String(e.message || e)
    // ⚠️ El token se cachea ~24 h en memoria (lib/shopify.js). Tras cambiar los
    // permisos en Shopify, una instancia tibia sigue con el token VIEJO.
    // Anclado a `HTTP 403` (el formato que lanza lib/shopify.js) y no a `403` a
    // secas: el mensaje trae hasta 200 caracteres del cuerpo de Shopify, y un
    // "403" incrustado en un id daria el aviso del token cacheado por error —
    // mandando a diagnosticar mal justo lo que este aviso quiere evitar.
    if (/HTTP 403/.test(msg)) {
      return Response.json({
        error: 'Shopify rechazó la escritura (403). Puede ser el token cacheado de hasta 24 h: espera un momento y vuelve a intentar. Si sigue, revisa que la app tenga write_products.',
      }, { status: 403 })
    }
    console.error('publicar error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
