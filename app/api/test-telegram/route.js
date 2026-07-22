export const dynamic = 'force-dynamic'
import { requireAdmin } from '@/lib/auth'

// TEMPORAL: prueba de conexión de Telegram. Manda un mensaje de prueba al chat de
// ventas y devuelve la respuesta CRUDA de Telegram (para diagnosticar). Borrar
// después de verificar.
export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.TELEGRAM_CHAT_VENTAS || '-5103132453'
  if (!token) return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN no está definido en Vercel' })

  // 1) getMe: confirma que el token es válido y de qué bot es.
  let quienSoy = null
  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    quienSoy = await me.json()
  } catch (e) { quienSoy = { error: e.message } }

  // 2) sendMessage al chat de ventas.
  const texto =
    '🧪 *Prueba de conexión — CRM*\n' +
    'Si ves esto, los avisos de venta por Telegram ya funcionan. ✅'
  let envio = null, status = 0
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'Markdown' }),
    })
    status = res.status
    envio = await res.json()
  } catch (e) { envio = { error: e.message } }

  return Response.json({
    bot: quienSoy?.result?.username || quienSoy,
    chatUsado: chat,
    envioStatus: status,
    telegram: envio,
  })
}
