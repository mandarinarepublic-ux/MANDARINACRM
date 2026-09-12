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
