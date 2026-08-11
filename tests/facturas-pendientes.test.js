import test from 'node:test'
import assert from 'node:assert'
import { facturasPendientes } from '../lib/facturas-pendientes.js'

// El 28-jul se apagó el escenario de Make que emitía las facturas, dando por
// hecho que el CRM tomaba la posta. No la tomó: el interruptor DATIL_DIRECTO
// nunca se puso. Pasaron 13 días y ~40 pedidos sin factura sin que nadie se
// enterara, porque en el tablero de ERRORES la fila de Dátil estaba EN BLANCO
// — y un blanco se ve igual que "todo bien".
//
// Este detector existe para que el silencio deje de parecer salud: no espera a
// que algo lance un error, sino que cuenta los pedidos que PIDIERON factura y
// no la tienen.

const CORTE = '2026-08-11T00:00:00-05:00'   // desde cuándo se vigila
const AHORA = new Date('2026-08-12T10:00:00-05:00')

function pedido(over = {}) {
  return {
    pedido_id: 'MAN-AND-9000',
    fecha_pedido: '2026-08-11T09:00:00-05:00',
    factura_solicitada: true,
    factura_id: null,
    ...over,
  }
}

test('un pedido que pidió factura y no la tiene sale como pendiente', () => {
  const r = facturasPendientes([pedido()], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 1)
  assert.equal(r.pedidos[0].pedido_id, 'MAN-AND-9000')
})

test('NO pedir factura no es un error: se ignora por completo', () => {
  // Regla de Rodrigo: "en algunos casos quiero factura y en otros no, y eso no
  // debe ser considerado como error". Es una decisión, no una falla.
  const r = facturasPendientes([pedido({ factura_solicitada: false })], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 0)
})

test('un pedido que YA tiene su factura no cuenta', () => {
  const r = facturasPendientes([pedido({ factura_id: 'e68717b65f72461e858a8d07b90d53c5' })], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 0)
})

test('los atrasados de antes del corte no se cuentan', () => {
  // Rodrigo: "ya solo quiero que funcione desde hoy hacia delante". Los ~40 de
  // julio quedan quietos; si se contaran, el tablero viviría en rojo por algo
  // que se decidió no tocar, y un rojo permanente se vuelve invisible.
  const r = facturasPendientes([pedido({ fecha_pedido: '2026-07-30T09:00:00-05:00' })], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 0)
})

test('un pedido recién creado tiene un rato de gracia antes de contarse', () => {
  // La factura se emite segundos después de crear el pedido. Sin gracia, cada
  // pedido nuevo aparecería como pendiente durante ese instante.
  const reciente = pedido({ fecha_pedido: '2026-08-12T09:55:00-05:00' })
  const r = facturasPendientes([reciente], { desde: CORTE, ahora: AHORA, graciaMinutos: 30 })
  assert.equal(r.total, 0)
})

test('pasada la gracia, el mismo pedido sí se cuenta', () => {
  const viejo = pedido({ fecha_pedido: '2026-08-12T09:00:00-05:00' })
  const r = facturasPendientes([viejo], { desde: CORTE, ahora: AHORA, graciaMinutos: 30 })
  assert.equal(r.total, 1)
})

test('una cadena vacía en factura_id cuenta como sin factura', () => {
  // Sheets devuelve '' donde Postgres devuelve null. El detector no puede
  // depender de cuál de los dos respondió.
  const r = facturasPendientes([pedido({ factura_id: '' })], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 1)
})

test('devuelve el más viejo primero, para saber desde cuándo se rompió', () => {
  const pedidos = [
    pedido({ pedido_id: 'B', fecha_pedido: '2026-08-12T08:00:00-05:00' }),
    pedido({ pedido_id: 'A', fecha_pedido: '2026-08-11T08:00:00-05:00' }),
  ]
  const r = facturasPendientes(pedidos, { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 2)
  assert.equal(r.pedidos[0].pedido_id, 'A')
  assert.equal(r.desde, '2026-08-11T08:00:00-05:00')
})

test('sin pendientes no hay fecha de quiebre', () => {
  const r = facturasPendientes([], { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 0)
  assert.equal(r.desde, null)
})

test('una lista nula no revienta', () => {
  const r = facturasPendientes(null, { desde: CORTE, ahora: AHORA })
  assert.equal(r.total, 0)
})
