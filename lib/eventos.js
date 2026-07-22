// lib/eventos.js
// Registro central de eventos del sistema (errores y éxitos clave de las
// integraciones externas: Meta CAPI, Dátil, Supabase, webhooks) en la tabla
// crm.eventos_sistema, más una alerta opcional a Telegram cuando es 'error'.
//
// Principio: registrar un evento NUNCA debe romper la operación que lo generó.
// Todo va envuelto en try/catch y es fire-and-forget.

import { getSupabase } from './supabase'
import { enviarTelegram } from './telegram'

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
 * Manda la alerta de error al chat de errores por Telegram (mismo bot que las
 * ventas, ver lib/telegram.js). Gateado por env TELEGRAM_CHAT_ERRORES; si no está,
 * no avisa (el evento igual queda guardado en la tabla).
 */
async function alertarTelegram({ fuente, mensaje, pedidoId }) {
  const chatId = process.env.TELEGRAM_CHAT_ERRORES
  if (!chatId) return

  const icono = { meta: '📊', datil: '🧾', supabase: '🗄️', webhook: '🔗', otro: '⚠️' }[fuente] || '⚠️'
  const texto =
    `${icono} *Error en el CRM* (${fuente})\n` +
    (pedidoId ? `Pedido: \`${pedidoId}\`\n` : '') +
    `${mensaje}`
  await enviarTelegram(chatId, texto)
}
