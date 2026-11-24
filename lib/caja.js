// Reglas puras de la caja de la tienda. Sin base de datos: todo son cuentas.
// Los montos viajan en CENTAVOS ENTEROS (nunca decimales) para que 0,1 + 0,2
// no ensucie el cuadre; en la base van como numeric(10,2).

import { normalizarDecimal } from './decimal.js'

/** Dólares (número o texto, "35.98") → centavos enteros. */
export function aCentavos(valor) {
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Centavos enteros → dólares con 2 decimales. */
export function aDolares(centavos) {
  return Math.round(Number(centavos) || 0) / 100
}

/** Texto escrito a mano ("55,98" o "55.98") → centavos, o un error en español. */
export function validarMonto(texto, { permitirCero = false } = {}) {
  const s = String(texto ?? '').trim()
  if (!s) return { ok: false, error: 'Escribe un monto.' }
  if (!/^\d+([.,]\d{1,2})?$/.test(s)) {
    return { ok: false, error: 'El monto no es válido: usa solo números, con máximo 2 decimales (ej. 55,98).' }
  }
  const centavos = aCentavos(normalizarDecimal(s))
  if (centavos === 0 && !permitirCero) return { ok: false, error: 'El monto debe ser mayor a cero.' }
  return { ok: true, centavos }
}

const suma = (xs) => (xs || []).reduce((a, b) => a + (Number(b) || 0), 0)

/** Arqueo: lo contado contra lo que debería haber. */
export function calcularCierre({ aperturaC, cobrosC, salidasC, contadoC, fondoFijoC, toleranciaC }) {
  const cobrosEfectivoC = suma(cobrosC)
  const salidasTotalC = suma(salidasC)
  const esperadoC = aperturaC + cobrosEfectivoC - salidasTotalC
  const diferenciaC = contadoC - esperadoC
  const estado = diferenciaC === 0 ? 'CUADRA' : Math.abs(diferenciaC) > toleranciaC ? 'FUERA' : 'DENTRO'
  return {
    cobrosEfectivoC,
    salidasC: salidasTotalC,
    esperadoC,
    diferenciaC,
    estado,
    requiereMotivo: estado === 'FUERA',
    excedenteC: Math.max(0, contadoC - fondoFijoC),
  }
}

/** Primer conteo de una caja nueva: lo que pasa del fondo fijo se puede sacar. */
export function calcularArranque({ contadoC, fondoFijoC }) {
  return { excedenteC: Math.max(0, contadoC - fondoFijoC) }
}

const dinero = (c) => `$${(Math.abs(c) / 100).toFixed(2).replace('.', ',')}`

/** null si la salida es válida; si no, el mensaje. */
export function validarSalidaExcedente({ montoC, excedenteC }) {
  if (!Number.isFinite(montoC) || montoC < 0) return 'El monto de la salida no es válido.'
  if (montoC > excedenteC) {
    return excedenteC <= 0
      ? 'No hay excedente para sacar: lo contado no pasa del fondo fijo.'
      : `Solo puedes sacar hasta ${dinero(excedenteC)} (lo que pasa del fondo fijo).`
  }
  return null
}

/** Con qué abre la caja el siguiente período. */
export function aperturaSiguiente({ contadoC, salidaC, reposicionesC }) {
  return contadoC - (salidaC || 0) + suma(reposicionesC)
}

/** Cobros en efectivo de la responsable, desde el inicio, que no estén ya en un cierre. */
export function seleccionarCobros(pagos, { responsableId, inicioIso, yaEnCierre }) {
  const inicio = new Date(inicioIso).getTime()
  return (pagos || []).filter((p) =>
    p.tipo === 'EFECTIVO' &&
    p.estado === 'PAGADO' &&
    p.vendedor_id === responsableId &&
    new Date(p.fecha).getTime() >= inicio &&
    !(yaEnCierre && yaEnCierre.has(p.pago_id)))
}

/** Pagos de un cierre firmado que después se borraron o se alteraron. */
export function pagosCambiados(snapshot, actuales) {
  const cambios = []
  for (const s of snapshot || []) {
    const a = actuales.get(s.pago_id)
    if (!a) cambios.push({ pago_id: s.pago_id, motivo: 'BORRADO' })
    else if (a.tipo !== 'EFECTIVO' || a.estado !== 'PAGADO') cambios.push({ pago_id: s.pago_id, motivo: 'YA_NO_EFECTIVO' })
    else if (aCentavos(a.monto) !== aCentavos(s.monto)) cambios.push({ pago_id: s.pago_id, motivo: 'MONTO' })
  }
  return cambios
}

export function textoDiferencia(diferenciaC) {
  if (!diferenciaC) return 'Cuadra'
  return diferenciaC < 0 ? `Falta ${dinero(diferenciaC)}` : `Sobra ${dinero(diferenciaC)}`
}
