// lib/editarPago.js — Corregir un abono ya registrado. SIN dependencias (ni base,
// ni red): así se prueba sola. La ruta es app/api/pagos/[id]/route.js.
//
// Solo ADMIN (lo exige la ruta con requireAdmin). Se puede cambiar el TIPO, el
// MONTO y las NOTAS, o borrar el pago entero (un abono duplicado). La fecha, el
// comprobante y quién lo registró NO se tocan: son el rastro de lo que pasó.
//
// ☠️ Todo cambio deja en la bitácora del pedido el ANTES y el DESPUÉS completos:
// borrar un pago no tiene papelera, así que la bitácora es lo único que queda
// para reconstruirlo.

export const TIPOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'LINK_PAGO']

/**
 * Valida lo que llega del navegador y devuelve SOLO las columnas que cambian.
 *
 * @param {object} actual  el pago en la base: { tipo, monto, notas }
 * @param {object} body    lo pedido: { tipo?, monto?, notas? }
 * @returns {{ok:true, cambios:object} | {ok:false, error:string}}
 *   `cambios` puede venir vacío: no es un error, simplemente no hay nada que hacer.
 */
export function validarEdicionPago(actual, body = {}) {
  const cambios = {}

  if (body.tipo !== undefined) {
    const tipo = String(body.tipo || '').trim().toUpperCase()
    if (!TIPOS_PAGO.includes(tipo)) return { ok: false, error: `Tipo de pago no válido: ${body.tipo}` }
    if (tipo !== actual?.tipo) cambios.tipo = tipo
  }

  if (body.monto !== undefined) {
    const monto = Math.round(parseFloat(body.monto) * 100) / 100
    if (!Number.isFinite(monto) || monto <= 0) {
      return { ok: false, error: 'El monto tiene que ser mayor a 0. Si el pago sobra, elimínalo.' }
    }
    if (monto !== Number(actual?.monto)) cambios.monto = monto
  }

  if (body.notas !== undefined) {
    const notas = String(body.notas ?? '').trim()
    if (notas !== String(actual?.notas ?? '').trim()) cambios.notas = notas || null
  }

  return { ok: true, cambios }
}

const dinero = (n) => `$${(Number(n) || 0).toFixed(2)}`

/** Una línea legible de un pago, para la bitácora. */
export function describirPago(p) {
  if (!p) return ''
  const fecha = p.fecha ? ` · ${String(p.fecha).slice(0, 10)}` : ''
  const notas = p.notas ? ` · ${p.notas}` : ''
  return `${p.tipo || 'PAGO'} ${dinero(p.monto)}${fecha}${notas}`
}
