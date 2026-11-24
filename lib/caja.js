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
  // "12." o "12," (separador al final, a medio teclear) vale 12
  if (!/^\d+([.,]\d{0,2})?$/.test(s)) {
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

/**
 * Valores que se guardan en un cierre ARRANQUE: no hay período anterior, así que lo
 * esperado es lo contado y la diferencia es 0 (nunca pasa de la tolerancia).
 */
export function cuentaDeArranque({ contadoC, fondoFijoC }) {
  return {
    cobrosEfectivoC: 0,
    salidasC: 0,
    esperadoC: contadoC,
    diferenciaC: 0,
    estado: 'CUADRA',
    requiereMotivo: false,
    excedenteC: calcularArranque({ contadoC, fondoFijoC }).excedenteC,
  }
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

const MSG_DEPOSITO_SALIO = 'El depósito ya salió del cajón: confírmalo o márcalo «no cuadra» antes de reabrir'

/**
 * null si el cierre se puede reabrir según su sobre/depósito; si no, un error 409.
 * Un DEPÓSITO pendiente ya no está en el cajón: anularlo perdería esa plata.
 * Un SOBRE pendiente sí se anula (la plata vuelve al cajón antes de contar de nuevo).
 */
export function errorReabrirPorSalida(salida) {
  if (!salida) return null
  if (salida.confirmacion !== 'PENDIENTE') return conStatus('El sobre/depósito ya fue confirmado', 409)
  if (salida.tipo === 'DEPOSITO') return conStatus(MSG_DEPOSITO_SALIO, 409)
  return null
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

/**
 * Cuerpo del GET /api/caja para la responsable. Lista blanca de campos: nada del
 * período abierto (cobros, esperado) sale hasta que el conteo queda guardado.
 */
export function respuestaResponsable({ caja, necesitaArranque, pendienteCerrar, salidas, cierres, sinFoto }) {
  return {
    caja: { id: caja.id, nombre: caja.nombre, fondo_fijo: caja.fondo_fijo, tolerancia: caja.tolerancia },
    necesitaArranque: !!necesitaArranque,
    pendienteCerrar: pendienteCerrar || null,
    salidasDelDia: salidas || [],
    cierres: cierres || [],
    sinFoto: sinFoto || [],
  }
}

const MSG_CONTEO_ABIERTO = 'Ya hay un conteo guardado sin cerrar'
const conStatus = (mensaje, status) => Object.assign(new Error(mensaje), { status })

/** null si se puede guardar un conteo nuevo; si ya hay uno sin cerrar, un error 409. */
export function errorConteoAbierto(cierreAbierto) {
  return cierreAbierto ? conStatus(MSG_CONTEO_ABIERTO, 409) : null
}

/** Error de supabase al insertar un cierre → 409 si es el índice único (doble toque); si no, el error tal cual. */
export function errorDeInsercionCierre(err) {
  if (err?.code === '23505') return conStatus(MSG_CONTEO_ABIERTO, 409)
  return err instanceof Error ? err : new Error(err?.message || 'Error al guardar el cierre')
}

// ─── Validación del POST /api/caja/admin/accion ──────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const esIdPositivo = (v) => (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v.trim()))) && Number.isSafeInteger(Number(v)) && Number(v) > 0
const MAX_AJUSTE_C = 50000 // $500,00

/** body → { ok, accion, datos } o { ok:false, error } (mensajes para el 400). Montos en centavos. */
export function validarAccionAdmin(body) {
  const b = body && typeof body === 'object' ? body : {}
  const falla = (error) => ({ ok: false, error })
  const id = (campo, etiqueta) => (esIdPositivo(b[campo]) ? null : `${etiqueta} no es válido.`)
  switch (b.accion) {
    case 'confirmar-movimiento': {
      const e = id('movId', 'El movimiento')
      if (e) return falla(e)
      if (b.resultado !== 'OK' && b.resultado !== 'NO_CUADRA') return falla('El resultado no es válido (OK o NO_CUADRA).')
      const datos = { movId: Number(b.movId), resultado: b.resultado }
      if (b.resultado === 'NO_CUADRA') {
        const m = validarMonto(b.montoReal, { permitirCero: true })
        if (!m.ok) return falla(`Monto real: ${m.error}`)
        datos.montoRealC = m.centavos
      }
      return { ok: true, accion: b.accion, datos }
    }
    case 'verificar-transferencia': {
      if (typeof b.pagoId !== 'string' || !UUID.test(b.pagoId)) return falla('El pago no es válido.')
      if (b.resultado !== 'LLEGO' && b.resultado !== 'NO_LLEGO') return falla('El resultado no es válido (LLEGO o NO_LLEGO).')
      return { ok: true, accion: b.accion, datos: { pagoId: b.pagoId, resultado: b.resultado } }
    }
    case 'reabrir': {
      const e = id('cierreId', 'El cierre')
      if (e) return falla(e)
      return { ok: true, accion: b.accion, datos: { cierreId: Number(b.cierreId) } }
    }
    case 'reposicion': {
      const e = id('cajaId', 'La caja')
      if (e) return falla(e)
      const m = validarMonto(b.monto)
      if (!m.ok) return falla(m.error)
      const motivo = String(b.motivo ?? '').trim()
      if (motivo.length > 200) return falla('El motivo no puede pasar de 200 caracteres.')
      return { ok: true, accion: b.accion, datos: { cajaId: Number(b.cajaId), montoC: m.centavos, motivo: motivo || null } }
    }
    case 'ajustes': {
      const e = id('cajaId', 'La caja')
      if (e) return falla(e)
      const campos = [['fondo_fijo', 'El fondo fijo'], ['tolerancia', 'La tolerancia']]
      const datos = { cajaId: Number(b.cajaId) }
      for (const [campo, etiqueta] of campos) {
        const m = validarMonto(b[campo], { permitirCero: true })
        if (!m.ok) return falla(`${etiqueta}: ${m.error}`)
        if (m.centavos > MAX_AJUSTE_C) return falla(`${etiqueta} debe estar entre $0 y $500.`)
        datos[campo + 'C'] = m.centavos
      }
      return { ok: true, accion: b.accion, datos }
    }
    default:
      return falla('Acción no reconocida')
  }
}

/** Solo URLs https para enlaces hechos con datos guardados (evita `javascript:`). */
export function urlSegura(u) {
  return typeof u === 'string' && /^https:\/\//i.test(u.trim()) ? u.trim() : null
}
