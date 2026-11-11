export const dynamic = 'force-dynamic'

import { usuarioDeSesion } from '@/lib/auth'
import { reporteListos } from '@/lib/db/reporteAreas'
import { hoyEcuador, isoMasDias } from '@/lib/parseFecha'

// Lo que bordado / sublimación / estampado marcaron LISTO, por día. Solo ADMIN.
export async function GET(req) {
  const s = await usuarioDeSesion()
  if (!s.ok) return Response.json({ error: s.error }, { status: s.status })
  if (String(s.usuario.ROL || '').toUpperCase() !== 'ADMIN') {
    return Response.json({ error: 'Solo ADMIN' }, { status: 403 })
  }
  try {
    const n = parseInt(new URL(req.url).searchParams.get('dias') || '14', 10) || 14
    const d = Math.min(Math.max(n, 1), 90)
    const desde = isoMasDias(hoyEcuador(), -(d - 1))
    const eventos = await reporteListos(`${desde}T00:00:00-05:00`)
    return Response.json({ desde, eventos })
  } catch (e) {
    console.error('GET /api/reporte-areas:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
