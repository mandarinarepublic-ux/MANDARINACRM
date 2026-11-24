// GET /api/caja — lo que ve la responsable de la caja. Arqueo a ciegas: el cuerpo
// sale SOLO por respuestaResponsable (lista blanca), sin cobros ni esperado del período abierto.
import { respuestaResponsable } from '@/lib/caja'
import { cierreAbierto, listarCierres, movimientosSinCierre } from '@/lib/db/caja'
import { contextoResponsable, errorRuta } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const ctx = await contextoResponsable()
    if (!ctx.ok) return ctx.res
    const { caja } = ctx
    const [pendienteCerrar, salidas, cierres] = await Promise.all([
      cierreAbierto(caja.id),
      movimientosSinCierre(caja.id, 'SALIDA'),
      listarCierres(caja.id, { limite: 14 }),
    ])
    const sinFoto = cierres.map((c) => c.salida).filter((s) => s?.tipo === 'DEPOSITO' && !s.foto_url)
    return Response.json(respuestaResponsable({
      caja, necesitaArranque: !caja.inicio && !pendienteCerrar, pendienteCerrar, salidas, cierres, sinFoto,
    }))
  } catch (e) {
    return errorRuta('GET /api/caja', e)
  }
}
