// POST /api/caja/admin/accion — acciones del admin sobre la caja (confirmar, verificar, reabrir, reposición, ajustes).
import { requireAdmin } from '@/lib/auth'
import { validarAccionAdmin, aDolares } from '@/lib/caja'
import {
  cajaPorId, confirmarMovimiento, verificarTransferencia, reabrirCierre, crearMovimiento, actualizarCaja,
} from '@/lib/db/caja'
import { errorRuta } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
    const admin = { id: auth.usuario.USUARIO_ID, nombre: auth.usuario.NOMBRE }

    const body = await req.json().catch(() => ({}))
    const v = validarAccionAdmin(body)
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 })
    const d = v.datos

    switch (v.accion) {
      case 'confirmar-movimiento':
        return Response.json({ ok: true, movimiento: await confirmarMovimiento(d.movId, { resultado: d.resultado, montoRealC: d.montoRealC, admin }) })
      case 'verificar-transferencia':
        return Response.json({ ok: true, verificacion: await verificarTransferencia(d.pagoId, { resultado: d.resultado, admin }) })
      case 'reabrir':
        return Response.json({ ok: true, cierre: await reabrirCierre(d.cierreId, admin) })
      case 'reposicion': {
        if (!(await cajaPorId(d.cajaId))) return Response.json({ error: 'Caja no encontrada' }, { status: 404 })
        const movimiento = await crearMovimiento({ cajaId: d.cajaId, tipo: 'REPOSICION', montoC: d.montoC, motivo: d.motivo, usuario: admin })
        return Response.json({ ok: true, movimiento })
      }
      case 'ajustes': {
        const caja = await actualizarCaja(d.cajaId, { fondo_fijo: aDolares(d.fondo_fijoC), tolerancia: aDolares(d.toleranciaC) })
        return Response.json({ ok: true, caja })
      }
    }
  } catch (e) {
    return errorRuta('POST /api/caja/admin/accion', e)
  }
}
