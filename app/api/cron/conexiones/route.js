export const dynamic = 'force-dynamic'
import { getSupabase } from '@/lib/supabase'
import { enviarTelegram, CHAT_VENTAS_DEFAULT } from '@/lib/telegram'
import { estadoEfectivo, textoAlertaConexiones, resumen } from '@/lib/conexiones'

// Corre 20 min después de la rutina de Claude (vercel.json: 7:20 y 15:20 Ecuador)
// y avisa por Telegram de toda luz que no esté en verde.
//
// ⚠️ Va aparte de la rutina A PROPÓSITO: si la rutina se muere, ella no puede
// avisar que se murió. Este cron sí — ve su fila vencida y la manda en rojo.

function autorizado(req) {
  const secreto = String(process.env.CRON_SECRET || '').replace(/[^\x21-\x7E]/g, '')
  if (!secreto) return process.env.VERCEL_ENV !== 'production'
  const cabecera = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return cabecera === `Bearer ${secreto}` || url.searchParams.get('secret') === secreto
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  try {
    const { data, error } = await getSupabase().from('conexiones_estado').select('*')
    if (error) throw error

    const ahora = Date.now()
    const filas = (data || []).map(f => estadoEfectivo(f, ahora))
    // Sin ninguna fila la rutina nunca escribió: eso también es para avisar.
    if (!filas.length) filas.push({ servicio: 'claude_rutina', nombre: 'Claude (rutina de revisión)', estado: 'rojo', detalle: 'El tablero está vacío: la rutina nunca escribió.' })

    const baseUrl = process.env.CRM_URL_PUBLICA || 'https://crm.apps.mandarinaec.com'
    const texto = textoAlertaConexiones(filas, { baseUrl })
    const chat = process.env.TELEGRAM_CHAT_ERRORES || process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
    // ⚠️ Se mira el resultado: un aviso que no se sabe si salió no es un aviso.
    const avisado = texto ? await enviarTelegram(chat, texto) : null
    if (texto && !avisado) console.error('[cron/conexiones] NO se pudo avisar por Telegram:', texto.slice(0, 200))

    return Response.json({ ok: true, resumen: resumen(filas), avisado })
  } catch (e) {
    console.error('[cron/conexiones]', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
