// lib/eventos.js
// Registro central de eventos del sistema (errores y éxitos clave de las
// integraciones externas: Meta CAPI, Dátil, Supabase, webhooks) en la tabla
// crm.eventos_sistema, más una alerta opcional a Telegram cuando es 'error'.
//
// Principio: registrar un evento NUNCA debe romper la operación que lo generó.
// Todo va envuelto en try/catch y es fire-and-forget.

import { getSupabase } from './supabase'
import { enviarTelegram, CHAT_VENTAS_DEFAULT } from './telegram'

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
  // TELEGRAM_CHAT_ERRORES nunca se configuró, así que este aviso llevaba meses
  // saliendo por el `return` sin que nadie se enterara: los 24 errores del CAPI
  // de IND de julio se descubrieron mirando la tabla a mano.
  //
  // Ahora cae en el chat de ventas, que es el que el equipo sí mira, con un
  // texto que no se puede confundir con un pedido. Si algún día se quiere un
  // grupo aparte, basta con poner TELEGRAM_CHAT_ERRORES y esto lo respeta.
  const chatId = process.env.TELEGRAM_CHAT_ERRORES
              || process.env.TELEGRAM_CHAT_VENTAS
              || CHAT_VENTAS_DEFAULT
  if (!chatId) return

  const icono = { meta: '📊', datil: '🧾', supabase: '🗄️', webhook: '🔗', otro: '⚠️' }[fuente] || '⚠️'
  const texto =
    `🚨 *ALERTA — no es una venta*\n` +
    `Falló algo en el CRM ${icono} (${fuente})\n\n` +
    (pedidoId ? `Pedido: \`${pedidoId}\`\n` : '') +
    `${mensaje}`
  await enviarTelegram(chatId, texto)
}
