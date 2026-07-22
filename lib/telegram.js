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
const CHAT_VENTAS_DEFAULT = '-5103132453'

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
