// GET /api/caja/admin — todo lo que ve el admin de la caja: por confirmar, cierres, avisos y el período abierto.
import { requireAdmin } from '@/lib/auth'
import { aCentavos, pagosCambiados } from '@/lib/caja'
import {
  listarCajas, cajaPorId, porConfirmar, transferenciasNoLlegaron, listarCierres, snapshotYActuales, periodoAbierto,
} from '@/lib/db/caja'
import { errorRuta } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

const sumaC = (xs) => xs.reduce((a, x) => a + aCentavos(x.monto), 0)

export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const cajas = await listarCajas()
    const crudo = new URL(req.url).searchParams.get('cajaId')
    let caja
    if (crudo != null && crudo !== '') {
      if (!/^\d+$/.test(crudo) || Number(crudo) <= 0) return Response.json({ error: 'Caja no encontrada' }, { status: 404 })
      caja = await cajaPorId(Number(crudo))
      if (!caja) return Response.json({ error: 'Caja no encontrada' }, { status: 404 })
    } else {
      caja = cajas.find((c) => c.activa) || cajas[0] || null
    }
    if (!caja) {
      return Response.json({
        cajas, caja: null, porConfirmar: { movimientos: [], transferencias: [] }, noLlegaron: [],
        cierres: [], avisos: [], abierto: { cobrosC: 0, salidasC: 0, aperturaC: 0 },
      })
    }

    const toleranciaC = aCentavos(caja.tolerancia)
    const [pend, noLlegaron, cierresRaw, { snapshot, actuales }, periodo] = await Promise.all([
      porConfirmar(caja), transferenciasNoLlegaron(caja), listarCierres(caja.id, { limite: 60 }),
      snapshotYActuales(caja.id, { limite: 60 }), periodoAbierto(caja),
    ])
    const cierres = cierresRaw.map((c) => ({
      ...c, fueraTolerancia: c.tipo === 'NORMAL' && Math.abs(aCentavos(c.diferencia)) > toleranciaC,
    }))

    const cierreDe = new Map(snapshot.map((s) => [s.pago_id, s.cierre_id]))
    const porId = new Map(cierresRaw.map((c) => [c.id, c]))
    const avisos = pagosCambiados(snapshot, actuales).map((a) => {
      const cierre = porId.get(cierreDe.get(a.pago_id))
      return {
        ...a,
        pedido_id: cierre?.pagos.find((p) => p.pago_id === a.pago_id)?.pedido_id ?? null,
        cierre_id: cierreDe.get(a.pago_id) ?? null,
        fecha: cierre?.contado_en ?? null,
      }
    })

    return Response.json({
      cajas, caja, porConfirmar: pend, noLlegaron, cierres, avisos,
      abierto: { cobrosC: sumaC(periodo.cobros), salidasC: sumaC(periodo.salidas), aperturaC: periodo.aperturaC },
    })
  } catch (e) {
    return errorRuta('GET /api/caja/admin', e)
  }
}
