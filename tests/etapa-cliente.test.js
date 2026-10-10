// tests/etapa-cliente.test.js
//
// En qué etapa ve el CLIENTE su pedido en mandarinaec.com/pedido. La regla está
// en docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md.
import test from 'node:test'
import assert from 'node:assert'
import { calcularEtapa, ETAPAS_CLIENTE, HORAS_HASTA_ENTREGADO } from '../lib/etapaCliente.js'
import { formatDiaMes } from '../lib/parseFecha.js'

const AHORA = new Date('2026-10-09T17:00:00Z') // 12:00 en Ecuador
const pedido = (extra = {}) => ({
  pedido_id: 'MAN-JAC-6308', estado_pedido: 'EN_FABRICA',
  fecha_pedido: '2026-10-03T15:00:00Z', fecha_actualizacion: '2026-10-03T15:00:00Z',
  fecha_impresion_produccion: null, ...extra,
})
const item = (extra = {}) => ({ area: 'ESTAMPADO', subestado: 'SOLICITADO', subestado_corte: null, eliminado: false, ...extra })
const log = (campo, despues, fecha) => ({ campo, despues, fecha })
const calc = (p, items = [item()], logs = [], ahora = AHORA) => calcularEtapa({ pedido: p, items, logs, ahora })

test('los nombres de las 5 etapas son los acordados con Rodrigo', () => {
  assert.deepEqual(ETAPAS_CLIENTE.map(e => e.nombre), ['Recibido', 'Diseño', 'Producción', 'Tránsito', 'Entregado'])
  assert.equal(HORAS_HASTA_ENTREGADO, 24)
})

test('recién creado: Recibido, con la fecha de CREACION', () => {
  const r = calc(pedido(), [item()], [log('CREACION', '', '2026-10-03T15:00:00Z')])
  assert.equal(r.etapa, 0)
  assert.equal(r.fechas[0], '2026-10-03T15:00:00.000Z')
  assert.deepEqual(r.fechas.slice(1), [null, null, null, null])
  assert.equal(r.cancelado, false)
})

test('sin bitácora, la fecha de Recibido sale de fecha_pedido', () => {
  assert.equal(calc(pedido()).fechas[0], '2026-10-03T15:00:00.000Z')
})

test('impreso para producción: Diseño', () => {
  const r = calc(pedido(), [item()], [log('IMPRESION_PRODUCCION', '2026-10-04', '2026-10-04T14:00:00Z')])
  assert.equal(r.etapa, 1)
  assert.equal(r.fechas[1], '2026-10-04T14:00:00.000Z')
})

test('impreso sin línea en la bitácora: vale la columna fecha_impresion_produccion', () => {
  assert.equal(calc(pedido({ fecha_impresion_produccion: '2026-10-04T14:00:00Z' })).etapa, 1)
})

test('arte enviado al cliente para aprobar sigue en Diseño', () => {
  const r = calc(pedido({ fecha_impresion_produccion: '2026-10-04T14:00:00Z' }), [item({ subestado: 'ENVIADO_APROBACION' })])
  assert.equal(r.etapa, 1)
})

test('cortado: Producción, con la fecha del primer corte', () => {
  const r = calc(pedido(), [item({ subestado_corte: 'CORTADO' })], [
    log('CORTE HOODIE PREMIUM', 'CORTADO', '2026-10-06T16:00:00Z'),
    log('CORTE PEDIDO', 'CORTADO', '2026-10-05T16:00:00Z'),
  ])
  assert.equal(r.etapa, 2)
  assert.equal(r.fechas[2], '2026-10-05T16:00:00.000Z')
})

test('nunca retrocede: un área que vuelve a ENVIADO_APROBACION sigue en Producción si la bitácora ya registró trabajo', () => {
  const r = calc(pedido({ fecha_impresion_produccion: '2026-10-04T14:00:00Z' }), [item({ subestado: 'ENVIADO_APROBACION' })], [
    log('SUBESTADO ESTAMPADO', 'EN_PROCESO', '2026-10-05T16:00:00Z'),
  ])
  assert.equal(r.etapa, 2)
  assert.equal(r.fechas[2], '2026-10-05T16:00:00.000Z')
})

test('un área trabajando (multi-área) también es Producción', () => {
  assert.equal(calc(pedido(), [item({ area: 'ESTAMPADO + BORDADO', subestado: 'ESTAMPADO:SOLICITADO|BORDADO:EN_PROCESO' })]).etapa, 2)
})

test('ENTREGADO_TIENDA (prenda de stock) no cuenta como trabajo del taller', () => {
  assert.equal(calc(pedido(), [item({ area: 'ENTREGA EN TIENDA', subestado: 'ENTREGADO_TIENDA' })]).etapa, 0)
})

test('en DESPACHO (la fábrica terminó, se empaca) sigue en Producción', () => {
  assert.equal(calc(pedido({ estado_pedido: 'DESPACHO' })).etapa, 2)
})

test('COMPLETADO: Tránsito, con la fecha del paso a COMPLETADO', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO' }), [item({ subestado: 'LISTO' })], [
    log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T01:00:00Z'),
  ])
  assert.equal(r.etapa, 3)
  assert.equal(r.fechas[3], '2026-10-09T01:00:00.000Z')
})

test('Entregado: a las 23 h de COMPLETADO todavía no, a las 25 h sí', () => {
  const p = pedido({ estado_pedido: 'COMPLETADO' })
  const logs = [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-08T17:00:00Z')]
  assert.equal(calc(p, [item()], logs, new Date('2026-10-09T16:00:00Z')).etapa, 3)
  const r = calc(p, [item()], logs, new Date('2026-10-09T18:00:00Z'))
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[4], '2026-10-09T17:00:00.000Z')
})

test('marcado ENTREGADO a mano: Entregado de una', () => {
  const r = calc(pedido({ estado_pedido: 'ENTREGADO' }), [item()], [log('ESTADO_PEDIDO', 'ENTREGADO', '2026-10-09T15:00:00Z')])
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[4], '2026-10-09T15:00:00.000Z')
})

test('pedido viejo COMPLETADO sin bitácora: cae a fecha_actualizacion y llega a Entregado', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO', fecha_actualizacion: '2026-07-01T15:00:00Z' }), [item()], [])
  assert.equal(r.etapa, 4)
  assert.equal(r.fechas[3], '2026-07-01T15:00:00.000Z')
})

test('nunca retrocede: si ya está en Tránsito, las etapas de antes cuentan como hechas aunque falte su dato', () => {
  const r = calc(pedido({ estado_pedido: 'COMPLETADO' }), [item()], [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T10:00:00Z')])
  assert.equal(r.etapa, 3)
  assert.equal(r.fechas[1], null, 'sin dato de impresión no se inventa una fecha')
})

test('cancelado: sin etapa', () => {
  const r = calc(pedido({ estado_pedido: 'CANCELADO' }))
  assert.equal(r.cancelado, true)
  assert.equal(r.etapa, null)
})

test('sin prendas vivas no avanza solo', () => {
  const r = calc(pedido(), [item({ eliminado: true, subestado_corte: 'CORTADO' })], [])
  assert.equal(r.etapa, 0)
})

test('las fechas de etapas que aún no llegan no se muestran', () => {
  const r = calc(pedido(), [item()], [log('ESTADO_PEDIDO', 'COMPLETADO', '2026-10-09T10:00:00Z')])
  assert.equal(r.etapa, 0, 'EN_FABRICA manda sobre una línea vieja de la bitácora')
  assert.equal(r.fechas[3], null)
})

test('formatDiaMes: día y mes en hora de Ecuador', () => {
  assert.equal(formatDiaMes('2026-10-04T03:00:00Z'), '03 Oct', 'las 22:00 del 3 en Ecuador')
  assert.equal(formatDiaMes(null), '')
})
