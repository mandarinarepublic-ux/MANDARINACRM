// Traduce un pedido de Shopify al payload que ya usa Nueva Venta.
// PURO a propósito: sin red y sin base, para poder probarlo con node --test.

/** Deja el celular en 10 dígitos (0XXXXXXXXX). Vacío si no hay nada usable.
 * Solo se aceptan estas tres formas:
 * - 10 dígitos que empiezan en 0
 * - 12 dígitos que empiezan en 593 (formato internacional Ecuador)
 * - 9 dígitos (se antepone el 0)
 * Cualquier otra longitud devuelve cadena vacía (no fabrica números).
 */
export function normalizarCelular(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10 && d.startsWith('0')) return d
  if (d.length === 12 && d.startsWith('593')) return '0' + d.slice(3)
  if (d.length === 9) return '0' + d
  return '' // rechaza cualquier otra longitud, no fabrica
}

/**
 * Shopify no pide cédula. Se guarda el celular con prefijo para que
 * `inferirTipo()` lo lea como PASAPORTE — un celular pelado son 10 dígitos y
 * caería como CÉDULA, que es justo lo contrario.
 *
 * @param {string} celular
 * @param {string|number} respaldo  id del pedido de Shopify, para cuando no hay
 *   celular usable. Sin esto, dos clientes sin teléfono compartirían la misma
 *   cédula `PENDIENTE-` y `upsertClienteByCedula` los fusionaría en una ficha.
 *
 * GUION MEDIO: la validación es /^[A-Za-z0-9-]{3,20}$/ y un `_` la reprueba.
 */
export function identificacionPendiente(celular, respaldo = '') {
  const cel = normalizarCelular(celular)
  if (cel) return `PENDIENTE-${cel}`
  const r = String(respaldo || '').replace(/\D/g, '').slice(-8)
  return r ? `WEB-${r}` : `WEB-SIN-DATOS`
}

const esNombreTalla = (n) => /talla|size|tama/i.test(String(n || ''))
const esNombreColor = (n) => /color|colour/i.test(String(n || ''))
/** Formas de talla del catálogo: XS..4XL y números (tallas de niño). */
const PARECE_TALLA = /^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|\d{1,2})$/i

/**
 * El catálogo tiene productos `Talla, Color` y otros `Color, Talla`, así que
 * NUNCA se resuelve por posición.
 *
 * ⚠️ Un `line_item` de webhook trae `variant_title` y NO trae los nombres de
 * las opciones — esos viven en el producto. Por eso hay dos caminos: si los
 * nombres llegan (desde el catálogo) mandan ellos; si no, se reconoce la talla
 * por su forma y lo que sobra es el color.
 */
export function tallaYColor(variantTitle, opciones = []) {
  const bruto = String(variantTitle || '').trim()
  if (!bruto || /^default title$/i.test(bruto)) return { talla: '', color: '' }
  const partes = bruto.split('/').map(s => s.trim()).filter(Boolean)

  if (opciones.length) {
    let talla = '', color = ''
    partes.forEach((valor, i) => {
      const nombre = opciones[i]?.name
      if (esNombreColor(nombre)) color = valor
      else if (esNombreTalla(nombre)) talla = valor
      else if (!talla) talla = valor
    })
    return { talla, color }
  }

  const iTalla = partes.findIndex(p => PARECE_TALLA.test(p))
  if (iTalla === -1) return { talla: partes[0] || '', color: partes[1] || '' }
  return { talla: partes[iTalla], color: partes.filter((_, i) => i !== iTalla)[0] || '' }
}

export function estaPagado(order) {
  return String(order?.financial_status || '').toLowerCase() === 'paid'
}

export const AREA_WEB = 'PRODUCTO SIN DISEÑO'

/**
 * @param {object} order  pedido crudo del webhook de Shopify
 * @param {string} tiendaId  MANDARINA | INDSTORE
 * @param {object} fotos  { [variantId]: url } — la foto del producto
 */
export function mapearPedido(order, tiendaId, fotos = {}) {
  const env = order.shipping_address || {}
  const celular = normalizarCelular(env.phone || order.customer?.phone || order.phone)

  const items = (order.line_items || []).map((li) => {
    // sin nombres de opción: el webhook no los manda (ver tallaYColor)
    const { talla, color } = tallaYColor(li.variant_title)
    return {
      productoNombre: li.title || '',
      talla, color,
      cantidad: parseInt(li.quantity || 1, 10),
      precioUnit: parseFloat(li.price || 0),
      area: AREA_WEB,
      esPersonalizado: false,
      shopifyVariantId: String(li.variant_id || ''),
      imagenShopify: fotos[li.variant_id] || fotos[String(li.variant_id)] || '',
    }
  })

  const total = items.reduce((s, i) => s + i.precioUnit * i.cantidad, 0)

  return {
    tiendaId,
    cliente: {
      nombre: env.name || order.customer?.first_name || 'Cliente web',
      cedula: identificacionPendiente(celular, order.id),
      celular,
      email: order.email || order.customer?.email || '',
      ciudad: env.city || '',
      direccion: [env.address1, env.city].filter(Boolean).join(', '),
    },
    items,
    // Pagado = abonado completo. El estado de pago lo calcula /api/pedidos.
    //
    // ☠️ `/api/pedidos` (app/api/pedidos/route.js) lee `pago.tipo`, no `metodo`,
    // y `createPago` ni siquiera desestructura `metodo` ni `fecha` — se
    // descartan en silencio. TRANSFERENCIA (no una etiqueta nueva): los tipos
    // reales en la base son solo EFECTIVO/TRANSFERENCIA/LINK_PAGO, están FIJOS
    // en los selectores de editar-pedido y del detalle del pedido (un valor
    // nuevo no aparecería ahí), y LINK_PAGO deja el pago en PENDIENTE — estos
    // ya están cobrados. TRANSFERENCIA da estado PAGADO y es lo más honesto:
    // "entró plata por vía electrónica". La verdad completa queda en `notas`.
    pagos: [{
      tipo: 'TRANSFERENCIA',
      monto: total,
      notas: `Cobrado en la tienda web (Shopify ${order.name || order.id})`,
    }],
    emitirFactura: false, // decisión de Rodrigo: estos NO se facturan en Dátil
    direccionTexto: [env.address1, env.city].filter(Boolean).join(', '),
    notasVendedor: `Pedido web ${order.name || ''} (Shopify ${order.id})`.trim(),
  }
}
