// /api/caja/cierre — guardar el conteo (POST) y firmarlo con su excedente (PATCH).
import {
  errorConteoAbierto, aCentavos, validarMonto, calcularCierre, calcularArranque, validarSalidaExcedente,
} from '@/lib/caja'
import {
  cierreAbierto, periodoAbierto, crearCierreContado, cerrarCierre,
} from '@/lib/db/caja'
import { contextoResponsable, errorRuta, esHttps } from '@/lib/cajaRuta'

export const dynamic = 'force-dynamic'

const bad = (error, status = 400) => Response.json({ error }, { status })

export async function POST(req) {
  try {
    const ctx = await contextoResponsable()
    if (!ctx.ok) return ctx.res
    const { caja, usuario } = ctx
    const body = await req.json().catch(() => ({}))

    const m = validarMonto(body?.contado, { permitirCero: true })
    if (!m.ok) return bad(m.error)
    const contadoC = m.centavos

    const yaAbierto = errorConteoAbierto(await cierreAbierto(caja.id))
    if (yaAbierto) throw yaAbierto

    const fondoFijoC = aCentavos(caja.fondo_fijo)
    const toleranciaC = aCentavos(caja.tolerancia)
    const tipo = caja.inicio ? 'NORMAL' : 'ARRANQUE'
    const { aperturaC, cobros, salidas } = await periodoAbierto(caja)
    const calc = calcularCierre({
      aperturaC, cobrosC: cobros.map((c) => aCentavos(c.monto)), salidasC: salidas.map((s) => aCentavos(s.monto)),
      contadoC, fondoFijoC, toleranciaC,
    })
    const cierre = await crearCierreContado({ caja, tipo, aperturaC, cobros, salidas, contadoC, calc, usuario })
    return Response.json({ cierre, calc })
  } catch (e) {
    return errorRuta('POST /api/caja/cierre', e)
  }
}

export async function PATCH(req) {
  try {
    const ctx = await contextoResponsable()
    if (!ctx.ok) return ctx.res
    const { caja, usuario } = ctx
    const body = await req.json().catch(() => ({}))

    const abierto = await cierreAbierto(caja.id)
    if (!abierto || String(abierto.id) !== String(body?.cierreId)) return bad('Cierre no encontrado', 404)

    // Se recalcula en el servidor con lo guardado: el cliente no decide si hace falta motivo.
    const fondoFijoC = aCentavos(caja.fondo_fijo)
    const toleranciaC = aCentavos(caja.tolerancia)
    const contadoC = aCentavos(abierto.contado)
    const requiereMotivo = abierto.tipo === 'NORMAL' && Math.abs(aCentavos(abierto.diferencia)) > toleranciaC
    const motivo = String(body?.motivo ?? '').trim().slice(0, 200)
    if (requiereMotivo && !motivo) return bad('Escribe el motivo de la diferencia.')

    const excedenteC = abierto.tipo === 'ARRANQUE'
      ? calcularArranque({ contadoC, fondoFijoC }).excedenteC
      : Math.max(0, contadoC - fondoFijoC)

    let salida = null
    if (body?.salida) {
      const s = body.salida
      if (s.tipo !== 'SOBRE' && s.tipo !== 'DEPOSITO') return bad('Destino del excedente no válido')
      const mm = validarMonto(s.monto, { permitirCero: true })
      if (!mm.ok) return bad(mm.error)
      const err = validarSalidaExcedente({ montoC: mm.centavos, excedenteC })
      if (err) return bad(err)
      const fotoUrl = s.fotoUrl || null
      if (fotoUrl && !esHttps(fotoUrl)) return bad('La foto no es válida.')
      if (mm.centavos > 0) salida = { tipo: s.tipo, montoC: mm.centavos, fotoUrl }
    }
    const cierre = await cerrarCierre(abierto.id, { cajaId: caja.id, motivo: motivo || null, salida, usuario })
    return Response.json({ cierre })
  } catch (e) {
    return errorRuta('PATCH /api/caja/cierre', e)
  }
}
