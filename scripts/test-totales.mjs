/**
 * Pruebas de los montos del pedido (lib/totalesPedido.js).
 * Ejecutar:  node scripts/test-totales.mjs
 *
 * Lo que rompía en producción: el editor del ADMIN cambiaba precio o cantidad de
 * una prenda y solo se reescribía la fila del ÍTEM; el PEDIDO se quedaba con el
 * MONTO_TOTAL viejo. La pantalla del editor sumaba en vivo desde los ítems (se
 * veía bien), pero el historial, el tablero, las ventas del mes, el saldo por
 * cobrar y los PDF mostraban el importe anterior.
 *
 * Casos reales encontrados en la base al arreglarlo:
 *   MAN-JAC-5021  total 19.99  prendas 39.98  (se agregó una prenda, total viejo)
 *   MAN-MWA-5219  total 30.00  prendas 35.00  (cobrado 35, total decía 30)
 *   MAN-JAC-5009  total 15.00  prendas 0      (pedido sin prendas: NO tocar)
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'test-totales-'))
async function cargar(rel) {
  const destino = join(dir, rel.replace(/\//g, '_') + '.mjs')
  writeFileSync(destino, readFileSync(new URL(rel, import.meta.url), 'utf8'))
  return import(pathToFileURL(destino).href)
}

const { calcularTotales, calcEstadoPago, centavos } = await cargar('../lib/totalesPedido.js')

let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` - ${detalle}` : ''}`) }
}

const item = (subtotal) => ({ SUBTOTAL: String(subtotal) })
const pago = (monto) => ({ MONTO: String(monto) })

console.log('\n== suma de prendas ==')
{
  const t = calcularTotales([item(19.99), item(19.99)], [])
  check('dos prendas suman', t.montoTotal === 39.98, String(t.montoTotal))

  // El caso MAN-JAC-5021: el pedido decía 19.99 y las prendas ya eran 39.98.
  check('el total sale de las prendas, no del valor guardado', t.montoTotal !== 19.99)

  check('sin pagos, todo pendiente', t.montoPendiente === 39.98 && t.estadoPago === 'PENDIENTE', t.estadoPago)
  check('una sola prenda', calcularTotales([item(15)], []).montoTotal === 15)
  check('subtotales con basura cuentan 0', calcularTotales([item('x'), item(10)], []).montoTotal === 10)
  check('subtotal ausente cuenta 0', calcularTotales([{}, item(10)], []).montoTotal === 10)
}

console.log('\n== pagos, saldo y estado ==')
{
  const parcial = calcularTotales([item(100)], [pago(30)])
  check('abono parcial', parcial.montoAbonado === 30 && parcial.montoPendiente === 70, JSON.stringify(parcial))
  check('estado ABONO', parcial.estadoPago === 'ABONO', parcial.estadoPago)

  const completo = calcularTotales([item(100)], [pago(60), pago(40)])
  check('varios pagos suman', completo.montoAbonado === 100)
  check('estado PAGADO al cubrir el total', completo.estadoPago === 'PAGADO')
  check('pendiente 0 al pagar todo', completo.montoPendiente === 0)

  // El caso MAN-MWA-5219: cobrado 35 sobre un total que decía 30.
  const sobrepago = calcularTotales([item(35)], [pago(35)])
  check('total corregido a lo que suman las prendas', sobrepago.montoTotal === 35)
  check('queda PAGADO, no en deuda', sobrepago.estadoPago === 'PAGADO' && sobrepago.montoPendiente === 0)

  // Un abono mayor al total (envío cobrado junto) no debe dar saldo negativo:
  // los tableros restaban ese negativo del "por cobrar".
  const exceso = calcularTotales([item(50)], [pago(65)])
  check('sobrepago NO deja pendiente negativo', exceso.montoPendiente === 0, String(exceso.montoPendiente))
}

console.log('\n== pedido sin prendas: no se toca ==')
{
  // MAN-JAC-5009 y MAN-JAC-5020: cero ítems pero con total y pagos reales.
  check('sin prendas devuelve null', calcularTotales([], [pago(15)]) === null)
  check('null también sin pagos', calcularTotales([], []) === null)
  check('undefined no revienta', calcularTotales(undefined, undefined) === null)
  // Es la señal de "no escribas nada": poner 0 borraría plata ya registrada.
}

console.log('\n== centavos: nada de colas de coma flotante ==')
{
  const t = calcularTotales([item(0.1), item(0.2)], [])
  check('0.1 + 0.2 = 0.30', t.montoTotal === 0.3, String(t.montoTotal))

  const p = calcularTotales([item(10.1)], [pago(3.3)])
  check('pendiente redondeado a centavos', p.montoPendiente === 6.8, String(p.montoPendiente))
  check('centavos() redondea', centavos(0.30000000000000004) === 0.3)

  // Muchas prendas con decimales no deben derivar.
  const muchos = calcularTotales(Array.from({ length: 30 }, () => item(3.33)), [])
  check('30 prendas de 3.33 = 99.90', muchos.montoTotal === 99.9, String(muchos.montoTotal))
}

console.log('\n== calcEstadoPago ==')
{
  check('nada abonado = PENDIENTE', calcEstadoPago(0, 100) === 'PENDIENTE')
  check('algo abonado = ABONO', calcEstadoPago(1, 100) === 'ABONO')
  check('justo = PAGADO', calcEstadoPago(100, 100) === 'PAGADO')
  check('de más = PAGADO', calcEstadoPago(120, 100) === 'PAGADO')
  check('total 0 = PAGADO', calcEstadoPago(0, 0) === 'PAGADO')
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)
