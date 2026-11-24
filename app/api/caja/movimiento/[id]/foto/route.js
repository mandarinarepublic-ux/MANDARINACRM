// POST /api/caja/movimiento/[id]/foto — foto de la papeleta, después del cierre.
// ponerFotoMovimiento filtra por la caja de quien llama (no se pone foto a movimientos ajenos).
import { ponerFotoMovimiento } from '@/lib/db/caja'
import { contextoResponsable, errorRuta, esHttps } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

export async function POST(req, { params }) {
  try {
    const ctx = await contextoResponsable()
    if (!ctx.ok) return ctx.res
    const body = await req.json().catch(() => ({}))
    if (!esHttps(body?.fotoUrl)) return Response.json({ error: 'La foto no es válida.' }, { status: 400 })
    const movimiento = await ponerFotoMovimiento(params.id, body.fotoUrl, ctx.usuario.id)
    return Response.json({ movimiento })
  } catch (e) {
    return errorRuta('POST /api/caja/movimiento/[id]/foto', e)
  }
}
