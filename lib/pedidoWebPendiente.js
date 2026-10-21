// Pedido web SIN PAGAR → aviso interno en el inbox de la tienda.
// PURO a propósito: sin red y sin base, para poder probarlo con node --test.
// La escritura en el inbox vive en lib/inbox-supabase.js (avisarPedidoEnInbox).

import { tallaYColor } from './shopifyPedido.js'

// La dirección del aviso en inbox.mensajes. NO es ENTRANTE ni SALIENTE a
// propósito:
// - ENTRANTE abriría una ventana de 24 h falsa (el inbox dejaría escribir texto
//   libre y Meta lo rechazaría con 131047, sin mostrar el botón de plantilla).
// - SALIENTE lo contaría como mensaje nuestro (estadísticas, "Tú:", ticks).
// Todas las vistas y funciones de la base comparan con `= 'ENTRANTE'` o
// `= 'SALIENTE'`, así que un tercer valor queda fuera de las dos cuentas.
export const DIRECCION_INTERNO = 'INTERNO'
export const TIPO_PEDIDO_WEB = 'pedido_web'

// El número por el que se crea el chat cuando el cliente nunca nos escribió.
// Son los principales de cada inbox (lib/canales.js de cada repo).
export const CANAL_POR_DEFECTO = {
  MANDI: '1024077200794372', // +593 98 374 5757
  IND: '1153686904504422',   // +593 99 995 3326
}

// Los nombres que manda Shopify, en cristiano. Lo desconocido pasa tal cual:
// mejor un nombre en inglés que un pago sin nombre.
const PASARELAS = {
  'bank deposit': 'Depósito / transferencia bancaria',
  'dlocal go offline payments': 'dLocal en efectivo (se confirma solo al pagar)',
  'dlocal go credit cards': 'Tarjeta (dLocal)',
  'cash on delivery (cod)': 'Contra entrega',
  manual: 'Manual',
}

export function nombrePasarela(order) {
  const nombres = order?.payment_gateway_names?.length
    ? order.payment_gateway_names
    : [order?.gateway].filter(Boolean)
  if (!nombres.length) return 'Sin indicar'
  return nombres.map((n) => PASARELAS[String(n).trim().toLowerCase()] || String(n)).join(' · ')
}

/** 0XXXXXXXXX (lo que da normalizarCelular) → 593XXXXXXXXX, como guarda el inbox. */
export function telefonoInbox(celular10) {
  const d = String(celular10 || '').replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('0')) return '593' + d.slice(1)
  if (d.length === 12 && d.startsWith('593')) return d
  return ''
}

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`

/** El texto que ve el vendedor en el chat. */
export function textoAvisoPedidoWeb(order) {
  const lineas = (order?.line_items || []).map((li) => {
    const { talla, color } = tallaYColor(li.variant_title)
    const detalle = [li.title || 'Producto', talla, color].filter(Boolean).join(' · ')
    const cant = parseInt(li.quantity || 1, 10)
    return `• ${detalle} · x${cant} — ${dinero(parseFloat(li.price || 0) * cant)}`
  })
  const env = order?.shipping_address || {}
  const ciudad = [env.city, env.province].filter(Boolean).join(', ')

  return [
    `🛒 PEDIDO WEB ${order?.name || ''} — PAGO PENDIENTE`.replace(/\s+—/, ' —'),
    '',
    ...(lineas.length ? lineas : ['• (sin productos en el pedido)']),
    '',
    `Total: ${dinero(order?.total_price)}`,
    `Pago: ${nombrePasarela(order)}`,
    ...(ciudad ? [`Envío: ${ciudad}`] : []),
    '',
    '⚠️ Comunícate con el cliente: realizó una compra pero tiene pendiente el pago.',
    'Cuando pague, cárgalo con Pedido manual: NO entra solo al CRM.',
  ].join('\n')
}

/** wa_message_id del aviso: estable por pedido → un reintento de Shopify no lo duplica. */
export const idAvisoPedidoWeb = (orderId) => `pedido_web_${orderId}`
