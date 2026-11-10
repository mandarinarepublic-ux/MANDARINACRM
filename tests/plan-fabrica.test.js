// Plan de fábrica: columnas, técnica, semáforo y la lista de HOY (lib/planFabrica.js).
import test from 'node:test'
import assert from 'node:assert'
import { columnaDe, tecnicaDe, semaforo, resumenPedido, armarTablero, moverEnPlan, limpiarPlan } from '../lib/planFabrica.js'

const it = (o) => ({ CANTIDAD: '1', AREA: 'ESTAMPADO', SUBESTADO: 'SOLICITADO', SUBESTADO_CORTE: '', ...o })
const ped = (id, items, extra = {}) => ({ PEDIDO_ID: id, ESTADO_PEDIDO: 'EN_FABRICA', FECHA_ENTREGA_PROMETIDA: '2026-11-10', items, ...extra })

test('sin cortar → CORTE; cortado → DISEÑO; DESPACHO → CONFECCIÓN', () => {
  assert.strictEqual(columnaDe(ped('a', [it({})])), 'CORTE')
  assert.strictEqual(columnaDe(ped('b', [it({ SUBESTADO_CORTE: 'CORTADO' })])), 'DISENO')
  assert.strictEqual(columnaDe(ped('c', [it({ SUBESTADO: 'LISTO' })], { ESTADO_PEDIDO: 'DESPACHO' })), 'CONFECCION')
})

test('☠️ "esperando prenda" sin cortar va a CORTE: el diseño espera la tela', () => {
  assert.strictEqual(columnaDe(ped('a', [it({ SUBESTADO: 'ESPERANDO_PRENDA' })])), 'CORTE')
})

test('una prenda lista sin marca de corte no deja el pedido en CORTE', () => {
  const p = ped('a', [it({ SUBESTADO: 'LISTO' }), it({ SUBESTADO_CORTE: 'CORTADO', AREA: 'BORDADO' })])
  assert.strictEqual(columnaDe(p), 'DISENO')
})

test('entrega en tienda no cuenta como trabajo de fábrica', () => {
  const p = ped('a', [it({ AREA: 'ENTREGA EN TIENDA', SUBESTADO: 'ENTREGADO_TIENDA' }), it({ SUBESTADO_CORTE: 'CORTADO' })])
  assert.strictEqual(columnaDe(p), 'DISENO')
})

test('técnica: la de lo que falta; dos → VARIAS; sin área base → SIN_DISENO', () => {
  assert.strictEqual(tecnicaDe(ped('a', [it({ AREA: 'BORDADO' })])), 'BORDADO')
  assert.strictEqual(tecnicaDe(ped('a', [it({ AREA: 'ESTAMPADO + BORDADO', SUBESTADO: 'ESTAMPADO:LISTO|BORDADO:SOLICITADO' })])), 'BORDADO')
  assert.strictEqual(tecnicaDe(ped('a', [it({ AREA: 'ESTAMPADO' }), it({ AREA: 'SUBLIMACION' })])), 'VARIAS')
  assert.strictEqual(tecnicaDe(ped('a', [it({ AREA: 'PRODUCTO SIN DISEÑO' })])), 'SIN_DISENO')
})

test('semáforo', () => {
  assert.strictEqual(semaforo(-3).color, 'negro')
  assert.strictEqual(semaforo(0).color, 'rojo')
  assert.strictEqual(semaforo(1).color, 'naranja')
  assert.strictEqual(semaforo(3).color, 'amarillo')
  assert.strictEqual(semaforo(9).color, 'verde')
  assert.strictEqual(semaforo(null).color, 'gris')
})

test('resumen cuenta unidades y separa esperando prenda de aprobación', () => {
  const r = resumenPedido(ped('a', [
    it({ CANTIDAD: '3', SUBESTADO: 'ESPERANDO_PRENDA' }),
    it({ SUBESTADO: 'ENVIADO_APROBACION', SUBESTADO_CORTE: 'CORTADO' }),
    it({ SUBESTADO: 'LISTO' }),
  ]))
  assert.strictEqual(r.total, 5)
  assert.strictEqual(r.esperando, 3)
  assert.strictEqual(r.aprobacion, 1)
  assert.strictEqual(r.listas, 1)
  assert.strictEqual(r.sinCortar, 3)
})

test('armarTablero: urgente primero, lo de HOY no se repite, lo cerrado sale como "salió"', () => {
  const dias = { '2026-11-01': -8, '2026-11-12': 3 }
  const pedidos = [
    ped('MAN-1', [it({})], { FECHA_ENTREGA_PROMETIDA: '2026-11-12' }),
    ped('MAN-2', [it({})], { FECHA_ENTREGA_PROMETIDA: '2026-11-01' }),
    ped('MAN-3', [it({})]),
  ]
  const t = armarTablero(pedidos, ['MAN-3', 'MAN-9'], (f) => dias[f] ?? 1)
  assert.deepStrictEqual(t.columnas.CORTE.map((x) => x.id), ['MAN-2', 'MAN-1'])
  assert.deepStrictEqual(t.hoy.map((x) => x.id), ['MAN-3', 'MAN-9'])
  assert.strictEqual(t.hoy[1].salio, true)
})

test('moverEnPlan: agrega, reordena y no duplica', () => {
  assert.deepStrictEqual(moverEnPlan(['a', 'b'], 'c'), ['a', 'b', 'c'])
  assert.deepStrictEqual(moverEnPlan(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'])
  assert.deepStrictEqual(moverEnPlan(['a', 'b'], 'a'), ['b', 'a'])
  assert.deepStrictEqual(moverEnPlan(['a', 'b'], 'a', 'a'), ['a', 'b'])
})

test('limpiarPlan: sin repetidos ni basura', () => {
  assert.deepStrictEqual(limpiarPlan(['a', 'a', '', null, ' b ']), ['a', 'b'])
  assert.strictEqual(limpiarPlan('x'), null)
})
