import { sincronizarPasarelas } from '@/lib/sincronizarPagos'
import { rangoEcuador, hoyEcuador } from '@/lib/reportePagos'
import { registrarEvento } from '@/lib/eventos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Sincronización automática del REPORTE DE PAGOS (19-nov-2026) ─────────────
// Dos veces al día (vercel.json, 8:20 y 20:20 de Ecuador). Hace lo mismo que el
// botón Sincronizar de /dashboard/reporte-pagos sobre los últimos 3 días: así los
// pagos de dLocal y Payphone entran aunque nadie abra la pantalla.
// ☠️ La consulta por lotes de Payphone tiene 5 llamadas por día: lib/sincronizarPagos
// ya la limita a una cada 5 h (compartido con la pantalla), así que esto no la agota.

function autorizado(req) {
  const secreto = String(process.env.CRON_SECRET || '').replace(/[^\x21-\x7E]/g, '')
  if (!secreto) return process.env.VERCEL_ENV !== 'production'
  const cabecera = req.headers.get('authorization') || ''
  return cabecera === `Bearer ${secreto}`
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  const hasta = hoyEcuador()
  const desde = new Date(Date.parse(`${hasta}T12:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10)
  const rango = rangoEcuador(desde, hasta)
  if (!rango) return Response.json({ ok: false, error: 'rango inválido' }, { status: 500 })
  const r = await sincronizarPasarelas({ desde, hasta, origen: 'cron' })
  if (r.avisos.length) {
    await registrarEvento({
      fuente: 'otro', nivel: 'aviso', mensaje: `Reporte de pagos (cron): ${r.avisos.join(' · ').slice(0, 300)}`,
      detalle: { ruta: '/api/cron/pagos', desde, hasta, payphone: r.payphone, dlocal: r.dlocal },
    })
  }
  return Response.json({ ok: true, desde, hasta, ...r })
}
