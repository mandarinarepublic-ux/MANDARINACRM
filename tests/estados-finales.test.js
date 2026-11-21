// Confirmar antes de cerrar o cancelar un pedido, y dejar a la vista unos segundos
// la prenda recién marcada ✅ Listo para poder deshacer el toque.
//
// ⚠️ Import RELATIVO, no `@/`: ver la nota en tests/areas-usuario.test.js.
import test from 'node:test'
import assert from 'node:assert'
import { pideConfirmacion, visibleEnTodos, ESTADOS_FINALES } from '../lib/estados-finales.js'

test('los estados que sacan el pedido de las bandejas piden confirmación', () => {
  for (const e of ESTADOS_FINALES) assert.strictEqual(pideConfirmacion('EN_FABRICA', e), true, e)
})

test('mover entre estados de trabajo NO pide confirmación', () => {
  assert.strictEqual(pideConfirmacion('EN_FABRICA', 'DESPACHO'), false)
  assert.strictEqual(pideConfirmacion('DESPACHO', 'EN_FABRICA'), false)
})

test('elegir el mismo estado o nada no pide confirmación', () => {
  assert.strictEqual(pideConfirmacion('CANCELADO', 'CANCELADO'), false)
  assert.strictEqual(pideConfirmacion('EN_FABRICA', ''), false)
})

test('«Todos» esconde lo LISTO, salvo lo recién marcado', () => {
  assert.strictEqual(visibleEnTodos('EN_PROCESO'), true)
  assert.strictEqual(visibleEnTodos('LISTO'), false)
  assert.strictEqual(visibleEnTodos('LISTO', { recienListo: true }), true)
})

test('con búsqueda se ve todo, como antes', () => {
  assert.strictEqual(visibleEnTodos('LISTO', { busqueda: 'MAN-1' }), true)
})
