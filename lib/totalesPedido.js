// lib/totalesPedido.js — Aritmética de los montos de un pedido. SIN dependencias
// (ni base, ni red): así se puede probar sola. La parte que lee y escribe está en
// lib/db/totales.js.

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Redondeo a centavos: evita pendientes tipo 0.30000000000000004. */
export const centavos = (n) => Math.round(n * 100) / 100

/** Estado de pago a partir de los montos (misma regla que recalcPago). */
export function calcEstadoPago(totalAbonado, montoTotal) {
  if (totalAbonado >= montoTotal) return 'PAGADO'
  if (totalAbonado > 0) return 'ABONO'
  return 'PENDIENTE'
}

/**
 * Totales de un pedido a partir de sus prendas VIVAS y sus pagos.
 *
 * @param {Array} items  prendas ya filtradas (sin eliminadas), con SUBTOTAL
 * @param {Array} pagos  pagos del pedido, con MONTO
 * @returns {null | {montoTotal:number, montoAbonado:number, montoPendiente:number, estadoPago:string}}
 *   null cuando el pedido se quedó SIN prendas: en ese caso no se toca nada (ver
 *   lib/db/totales.js), porque poner el total en 0 borraría plata ya registrada.
 */
export function calcularTotales(items = [], pagos = []) {
  if (!Array.isArray(items) || items.length === 0) return null

  const montoTotal = centavos(items.reduce((s, i) => s + num(i?.SUBTOTAL), 0))
  const montoAbonado = centavos((pagos || []).reduce((s, p) => s + num(p?.MONTO), 0))
  // Nunca negativo: un sobrepago (p. ej. el envío cobrado dentro del abono) no
  // debe restar del "por cobrar" de los tableros.
  const montoPendiente = centavos(Math.max(0, montoTotal - montoAbonado))

  return { montoTotal, montoAbonado, montoPendiente, estadoPago: calcEstadoPago(montoAbonado, montoTotal) }
}
