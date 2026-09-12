// lib/shopifyProducto.js
// Arma lo que se le manda a productSet y verifica lo que Shopify devolvio.
//
// ☠️ Existe aparte de lib/shopify.js a proposito: ese archivo alimenta el sync,
// o sea el catalogo del CRM y de los DOS inbox. Es camino de lectura y funciona.
// La escritura es logica nueva y vive aislada para no poder tumbarlo.
//
// Todo lo de aqui es PURO: sin red, sin process.env. Por eso se puede probar.
import { TALLAS } from './cotizacion.js'

/** Nombre de la opcion de Shopify. El cliente lo ve en la ficha. */
export const OPCION_TALLA = 'Talla'

/** Lo que se usa cuando el producto no tiene tallas (una gorra, un llavero). */
export const TALLA_UNICA = 'Única'

/** Dinero de Shopify: siempre string con dos decimales. */
function dinero(valor, campo) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`El ${campo} tiene que ser un número mayor que cero (llegó ${JSON.stringify(valor)})`)
  }
  return n.toFixed(2)
}

export function construirProductSetInput(datos) {
  const {
    id, titulo, handle, descripcionHtml, seoTitulo, seoDescripcion, tags,
    tipoProducto, vendor, categoriaId, tallas, precio, precioTachado, fotos, status,
  } = datos || {}

  const precioStr = dinero(precio, 'precio')

  // Un tachado MENOR que el precio no es un descuento, es un error de dedo:
  // se ignora en vez de publicar un "descuento" que sube el precio.
  let tachadoStr
  if (precioTachado !== undefined && precioTachado !== null && precioTachado !== '') {
    const t = dinero(precioTachado, 'precio tachado')
    if (Number(t) > Number(precioStr)) tachadoStr = t
  }

  // Se ordenan por el orden del CRM (XS -> XXXL), no por como llegaron del
  // navegador: el cliente ve las tallas en ese orden en la ficha.
  const elegidas = TALLAS.filter((t) => (tallas || []).includes(t))
  const valores = elegidas.length ? elegidas : [TALLA_UNICA]

  const archivos = (fotos || []).map((f, i) => {
    if (!String(f?.alt || '').trim()) {
      throw new Error(`La foto ${i + 1} no tiene alt text, y el alt es la mitad del SEO de imágenes`)
    }
    return { originalSource: f.url, alt: f.alt.trim(), contentType: 'IMAGE' }
  })

  const input = {
    title: titulo,
    handle,
    descriptionHtml: descripcionHtml,
    seo: { title: seoTitulo, description: seoDescripcion },
    productType: tipoProducto,
    vendor,
    tags: tags || [],
    status: status || 'DRAFT',
    productOptions: [{ name: OPCION_TALLA, values: valores.map((name) => ({ name })) }],
    variants: valores.map((name) => ({
      optionValues: [{ optionName: OPCION_TALLA, name }],
      price: precioStr,
      ...(tachadoStr ? { compareAtPrice: tachadoStr } : {}),
      // Sin seguimiento a proposito: con seguimiento y stock 0, Shopify BLOQUEA
      // la compra y el producto queda publicado pero no vendible.
      inventoryItem: { tracked: false },
    })),
    files: archivos,
  }

  if (categoriaId) input.category = categoriaId
  if (id) input.id = id
  return input
}

/**
 * Comprueba que el producto que Shopify DEVOLVIO sea el que se pidió.
 *
 * ☠️ Esto existe porque `userErrors: []` no prueba nada. Verificado el
 * 10-sep-2026: productCreate respondio sin errores habiendo dejado 1 variante
 * de 5, a 0.00 y sin categoria. Mientras esta funcion no diga ok, el producto
 * se queda en BORRADOR y no lo ve ningun cliente.
 *
 * Devuelve TODOS los fallos, no el primero: si hay tres cosas mal, quien lo
 * arregla quiere verlas de una vez y no descubrirlas de a una.
 */
export function verificarProducto(producto, esperado) {
  const fallos = []
  const p = producto || {}
  const tallasPedidas = esperado?.tallas?.length ? esperado.tallas.length : 1
  const fotosPedidas = Number(esperado?.fotos) || 0

  const variantes = p.variants?.nodes || []
  if (variantes.length !== tallasPedidas) {
    fallos.push(`Se pidieron ${tallasPedidas} variantes y Shopify dejó ${variantes.length}`)
  }
  const enCero = variantes.filter((v) => !(Number(v?.price) > 0))
  if (enCero.length) {
    fallos.push(`${enCero.length} variante(s) quedaron sin precio (0.00): ${enCero.map((v) => v.title).join(', ')}`)
  }

  if (!p.category?.id) fallos.push('El producto quedó sin categoría, así no sirve para el feed de anuncios')

  if (!String(p.seo?.title || '').trim()) fallos.push('El producto quedó sin título SEO')
  if (!String(p.seo?.description || '').trim()) fallos.push('El producto quedó sin descripción SEO')

  const medios = p.media?.nodes || []
  const faltanMedios = medios.length < fotosPedidas
  if (medios.length !== fotosPedidas) {
    fallos.push(`Se subieron ${fotosPedidas} fotos y Shopify dejó ${medios.length}`)
  }
  // Shopify descarga y procesa la imagen DESPUES de responder: contar no alcanza.
  //
  // ☠️ Se exige READY, no "distinto de FAILED". `MediaImage.status` es NON_NULL
  // en el esquema, asi que un status ausente significa que algo anda mal — y esta
  // funcion tiene que fallar CERRADA: ante la duda, no se publica.
  // La ESPERA de que el procesamiento termine no es problema de aqui: esta
  // funcion es pura. La resuelve la ruta de publicar, releyendo con reintentos.
  const rotas = medios.filter((m) => m?.status !== 'READY')
  if (rotas.length) fallos.push(`${rotas.length} imagen(es) todavía no están listas (estado ${rotas.map((m) => m?.status || 'desconocido').join(', ')})`)
  const sinAlt = medios.filter((m) => !String(m?.alt || '').trim())
  if (sinAlt.length) fallos.push(`${sinAlt.length} imagen(es) quedaron sin alt text`)

  // ¿Vale la pena volver a preguntarle a Shopify? Solo si lo que falta se puede
  // arreglar SOLO con el tiempo: que todavia este materializando o procesando la
  // media. FAILED es terminal y un alt vacio no se llena solo, asi que ninguno
  // de los dos cuenta como "en proceso" — reintentar ahi es regalar segundos.
  //
  // ⚠️ Se calcula con los ESTADOS, NUNCA leyendo el texto de los fallos. Atar un
  // reintento a la redaccion de un mensaje es atarlo a algo que cambia: basta que
  // alguien reescriba un aviso para que el reintento deje de dispararse, en
  // silencio y justo en el caso para el que existe.
  const enProceso = medios.filter((m) => m?.status === 'UPLOADED' || m?.status === 'PROCESSING')
  const fotosEnProceso = enProceso.length > 0 || faltanMedios

  return { ok: fallos.length === 0, fallos, fotosEnProceso }
}
