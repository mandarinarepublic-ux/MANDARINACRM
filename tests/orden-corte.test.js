// El orden de la cola de Corte.
//
// La pantalla ordenaba FIFO por fecha de pedido y punto: no se podía invertir ni
// mirar por fecha prometida, que es la que aprieta en el taller. Las dos NO dan
// el mismo orden — el 5578 entró antes que el 5579 y vence cinco días después.
import test from 'node:test'
import assert from 'node:assert'
import { comparadorCorte, ORDENES, ORDEN_POR_DEFECTO } from '../lib/orden-corte.js'

// Casos reales de la bandeja del 19-ago-2026.
const P5578 = { PEDIDO_ID: 'MAN-AND-5578', FECHA_PEDIDO: '2026-08-08', FECHA_ENTREGA_PROMETIDA: '2026-08-13' }
const P5579 = { PEDIDO_ID: 'MAN-AND-5579', FECHA_PEDIDO: '2026-08-09', FECHA_ENTREGA_PROMETIDA: '2026-08-18' }
const P5359 = { PEDIDO_ID: 'IND-YAW-5359', FECHA_PEDIDO: '2026-07-20', FECHA_ENTREGA_PROMETIDA: '2026-07-24' }
const orden = (lista, modo) => [...lista].sort(comparadorCorte(modo)).map(p => p.PEDIDO_ID)

test('ANTIGUO deja lo que lleva mas esperando arriba', () => {
  assert.deepStrictEqual(orden([P5579, P5359, P5578], 'ANTIGUO'),
    ['IND-YAW-5359', 'MAN-AND-5578', 'MAN-AND-5579'])
})

test('NUEVO es exactamente el reverso', () => {
  assert.deepStrictEqual(orden([P5359, P5578, P5579], 'NUEVO'),
    ['MAN-AND-5579', 'MAN-AND-5578', 'IND-YAW-5359'])
})

test('ENTREGA NO da el mismo orden que ANTIGUO: por eso existe', () => {
  // Con estos dos coincide; el caso que lo separa es el de abajo.
  const porEntrega = orden([P5578, P5579], 'ENTREGA')
  assert.deepStrictEqual(porEntrega, ['MAN-AND-5578', 'MAN-AND-5579'])

  // Un pedido que entro DESPUES pero vence ANTES tiene que subir.
  const tarde = { PEDIDO_ID: 'MAN-XXX-9999', FECHA_PEDIDO: '2026-08-15', FECHA_ENTREGA_PROMETIDA: '2026-08-10' }
  assert.deepStrictEqual(orden([P5578, tarde], 'ANTIGUO'), ['MAN-AND-5578', 'MAN-XXX-9999'])
  assert.deepStrictEqual(orden([P5578, tarde], 'ENTREGA'), ['MAN-XXX-9999', 'MAN-AND-5578'],
    'lo que vence antes va primero aunque haya entrado despues')
})

test('un pedido SIN fecha va al FINAL, nunca al principio', () => {
  // Con `new Date(0)` se colaba arriba disfrazado del mas urgente de todos, y en
  // una bandeja de taller eso manda a cortar lo que no toca.
  const sinFecha = { PEDIDO_ID: 'MAN-SIN-0001', FECHA_PEDIDO: '', FECHA_ENTREGA_PROMETIDA: null }
  for (const modo of ['ANTIGUO', 'NUEVO', 'ENTREGA']) {
    const r = orden([sinFecha, P5359, P5579], modo)
    assert.strictEqual(r[r.length - 1], 'MAN-SIN-0001', `en ${modo} el sin fecha debe quedar al final`)
  }
})

test('sin fecha prometida no se cuela arriba en ENTREGA', () => {
  // Caso propio de este CRM: el pedido existe y tiene fecha de entrada, pero
  // nadie le prometio entrega. No es urgente: es que no se sabe.
  const sinPrometida = { PEDIDO_ID: 'MAN-NOP-0002', FECHA_PEDIDO: '2026-07-01', FECHA_ENTREGA_PROMETIDA: '' }
  assert.deepStrictEqual(orden([sinPrometida, P5578], 'ENTREGA'),
    ['MAN-AND-5578', 'MAN-NOP-0002'])
})

test('el orden es estable: mismo dia desempata por numero de pedido', () => {
  const a = { PEDIDO_ID: 'MAN-AAA-0001', FECHA_PEDIDO: '2026-08-10', FECHA_ENTREGA_PROMETIDA: '2026-08-15' }
  const b = { PEDIDO_ID: 'MAN-BBB-0002', FECHA_PEDIDO: '2026-08-10', FECHA_ENTREGA_PROMETIDA: '2026-08-15' }
  assert.deepStrictEqual(orden([b, a], 'ANTIGUO'), ['MAN-AAA-0001', 'MAN-BBB-0002'])
  assert.deepStrictEqual(orden([a, b], 'NUEVO'), ['MAN-BBB-0002', 'MAN-AAA-0001'])
})

test('un modo desconocido no rompe la bandeja: cae en FIFO', () => {
  // Si manana alguien guarda el orden y llega un valor viejo, la cola tiene que
  // seguir pintandose, no quedarse en blanco.
  assert.deepStrictEqual(orden([P5579, P5359], 'LO_QUE_SEA'), ['IND-YAW-5359', 'MAN-AND-5579'])
  assert.strictEqual(ORDEN_POR_DEFECTO, 'ANTIGUO', 'el defecto es el comportamiento de siempre')
  assert.deepStrictEqual(Object.keys(ORDENES), ['ANTIGUO', 'NUEVO', 'ENTREGA'])
})
