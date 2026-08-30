// lib/telegram.js
// Notificaciones por Telegram (bot API — gratis). Un solo bot para todo el CRM,
// con distintos chats según el tipo de aviso.
//
// Config (Vercel):
//   TELEGRAM_BOT_TOKEN     - token del bot (@BotFather). El bot debe estar DENTRO
//                            del grupo/chat al que se quiere avisar.
//   TELEGRAM_CHAT_VENTAS   - chat donde llegan las ventas (default: el que se venía
//                            usando en Make).
//   TELEGRAM_CHAT_ERRORES  - chat de alertas de error del tablero de sistema.
//
// Nada de esto rompe la operación: si no hay token, o si falla el envío, se ignora.

// Chat de ventas que venía usándose en Make. Se puede sobreescribir por env.
// Se exporta porque las alertas de error también caen acá cuando no hay un chat
// propio configurado (ver lib/eventos.js).
export const CHAT_VENTAS_DEFAULT = '-5103132453'

/** Envía un mensaje a un chat. No lanza nunca. Devuelve true si se mandó. */
export async function enviarTelegram(chatId, texto, { markdown = true } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId || !texto) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        ...(markdown ? { parse_mode: 'Markdown' } : {}),
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('Telegram sendMessage falló:', res.status, body.slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('Telegram error:', e?.message || e)
    return false
  }
}

const EMOJI_TIENDA = { MANDARINA: '🍊', INDSTORE: '🏪', YAW: '🟣' }

/**
 * Avisa por Telegram que un vendedor hizo una venta. Fire-and-forget.
 * @param {object} v { pedidoId, tiendaId, vendedor, cliente, monto, prendas }
 */
export async function notificarVenta(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  const emoji = EMOJI_TIENDA[v.tiendaId] || '🛍️'
  const texto =
    `🛒 *Nueva venta* ${emoji}\n` +
    `Pedido: \`${v.pedidoId}\`\n` +
    `Vendedor: *${v.vendedor || '—'}*\n` +
    `Cliente: ${v.cliente || '—'}\n` +
    `Monto: *$${Number(v.monto || 0).toFixed(2)}*` +
    (v.prendas ? `  ·  ${v.prendas} prenda(s)` : '')
  return enviarTelegram(chat, texto)
}

/** Texto aparte de la función que envía, para poder probarlo sin red. */
export function textoPedidoWebSinPagar({ tiendaId, nombre, celular, monto, prendas, urlShopify }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🕐 *Pedido web SIN PAGAR* ${emoji}\n` +
    `Cliente: *${nombre || '—'}*\n` +
    `Celular: \`${celular || '—'}\`\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}* · ${prendas || 0} prenda(s)\n` +
    `Llegó al checkout y no pagó. Escríbele.\n${urlShopify || ''}`
  )
}

export function textoPedidoWebFallido({ tiendaId, orderName, motivo }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🚨 *Pedido web NO entró al CRM* ${emoji}\n` +
    `Shopify: *${orderName || '—'}*\n` +
    `Motivo: \`${motivo || 'desconocido'}\`\n` +
    `Hay que cargarlo a mano.`
  )
}

export async function notificarPedidoWebSinPagar(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebSinPagar(v))
}

export async function notificarPedidoWebFallido(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebFallido(v))
}

/**
 * Aviso PROPIO del webhook cuando un pedido web se crea con éxito.
 *
 * `/api/pedidos` ya manda `notificarVenta()` en cada alta, pero sin `await`
 * (fire-and-forget): en serverless la función se congela apenas responde y
 * ese mensaje se puede perder — justo el problema que este proyecto vino a
 * resolver. El webhook manda este ADEMÁS, con `await`, antes de responder.
 * Sí, puede llegar un mensaje doble por la misma venta: un aviso de más es
 * infinitamente mejor que una venta de la que nadie se entera.
 */
export function textoPedidoWebCreado({ tiendaId, pedidoId, cliente, monto, prendas }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🛒 *Venta web* ${emoji}\n` +
    `Pedido: \`${pedidoId || '—'}\`\n` +
    `Cliente: ${cliente || '—'}\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}* · ${prendas || 0} prenda(s)\n` +
    `Entró solo desde la tienda web. Falta completarle la cédula.`
  )
}

export async function notificarPedidoWebCreado(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebCreado(v))
}
