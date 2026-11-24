// POST /api/caja/movimiento — la responsable registra una SALIDA de efectivo del día.
import { validarMonto } from '@/lib/caja'
import { crearMovimiento } from '@/lib/db/caja'
import { contextoResponsable, errorRuta, esHttps } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const ctx = await contextoResponsable()
    if (!ctx.ok) return ctx.res
    const body = await req.json().catch(() => ({}))
    const m = validarMonto(body?.monto)
    if (!m.ok) return Response.json({ error: m.error }, { status: 400 })
    const motivo = String(body?.motivo ?? '').trim()
    if (motivo.length < 3 || motivo.length > 200) {
      return Response.json({ error: 'Cuéntanos en qué se gastó (entre 3 y 200 letras).' }, { status: 400 })
    }
    const fotoUrl = body?.fotoUrl || null
    if (fotoUrl && !esHttps(fotoUrl)) return Response.json({ error: 'La foto no es válida.' }, { status: 400 })
    const movimiento = await crearMovimiento({
      cajaId: ctx.caja.id, tipo: 'SALIDA', montoC: m.centavos, motivo, fotoUrl, usuario: ctx.usuario,
    })
    return Response.json({ movimiento })
  } catch (e) {
    return errorRuta('POST /api/caja/movimiento', e)
  }
}
