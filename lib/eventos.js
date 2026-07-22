// lib/eventos.js
// Registro central de eventos del sistema (errores y éxitos clave de las
// integraciones externas: Meta CAPI, Dátil, Supabase, webhooks) en la tabla
// crm.eventos_sistema, más una alerta opcional a Telegram cuando es 'error'.
//
// Principio: registrar un evento NUNCA debe romper la operación que lo generó.
// Todo va envuelto en try/catch y es fire-and-forget.

import { getSupabase } from './supabase'

/**
 * Registra un evento. No lanza nunca.
 * @param {object} e
 * @param {'meta'|'datil'|'supabase'|'webhook'|'otro'} e.fuente
 * @param {'error'|'aviso'|'ok'} [e.nivel='error']
 * @param {string} e.mensaje
 * @param {string} [e.pedidoId]
 * @param {object} [e.detalle]  - contexto extra (se guarda como jsonb)
 */
export async function registrarEvento({ fuente, nivel = 'error', mensaje, pedidoId, detalle } = {}) {
  try {
    await getSupabase().from('eventos_sistema').insert({
      fuente,
      nivel,
      mensaje: String(mensaje || '').slice(0, 1000),
      pedido_id: pedidoId || null,
      detalle: detalle || null,
    })
  } catch (e) {
    // Si ni siquiera se puede escribir el log (Supabase caído), al menos queda
    // en los logs de Vercel. No se propaga.
    console.error('registrarEvento falló:', e?.message || e)
  }

  // Alerta solo para errores, para no inundar el chat con los 'ok'.
  if (nivel === 'error') {
    alertarTelegram({ fuente, mensaje, pedidoId }).catch(() => {})
  }
}

/**
 * Manda un mensaje al chat de alertas por Telegram (bot API, gratis).
 * Gateado por env: si no está configurado, no hace nada.
 *   TELEGRAM_ALERT_BOT_TOKEN  - token del bot (@BotFather)
 *   TELEGRAM_ALERT_CHAT_ID    - id del chat/grupo donde avisar
 */
async function alertarTelegram({ fuente, mensaje, pedidoId }) {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID
  if (!token || !chatId) return

  const icono = { meta: '📊', datil: '🧾', supabase: '🗄️', webhook: '🔗', otro: '⚠️' }[fuente] || '⚠️'
  const texto =
    `${icono} *Error en el CRM* (${fuente})\n` +
    (pedidoId ? `Pedido: \`${pedidoId}\`\n` : '') +
    `${mensaje}`

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'Markdown' }),
  })
}
