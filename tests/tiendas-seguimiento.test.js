import test from 'node:test'
import assert from 'node:assert'
import { tiendaSeguimiento, TIENDAS_SEGUIMIENTO } from '../lib/tiendasSeguimiento.js'
import { ORIGENES_TIENDA, ORIGENES_TIENDA_IND } from '../lib/origenes.js'

test('lo desconocido o vacío es Mandarina', () => {
  for (const v of [undefined, null, '', 'yaw', 'MANDARINA', {}]) {
    assert.equal(tiendaSeguimiento(v).tiendaId, 'MANDARINA')
  }
})

test('IND busca SOLO pedidos de INDSTORE y escribe al 3326', () => {
  const t = tiendaSeguimiento('IND')
  assert.equal(t.tiendaId, 'INDSTORE')
  assert.equal(t.wa, '593999953326')
  assert.deepEqual([...t.origenes], [...ORIGENES_TIENDA_IND])
  assert.notEqual(t.promoClave, TIENDAS_SEGUIMIENTO.mandarina.promoClave)
})

test('Mandarina queda como estaba', () => {
  const t = tiendaSeguimiento('mandarina')
  assert.equal(t.wa, '593983745757')
  assert.equal(t.promoClave, 'promo_mandarina')
  assert.deepEqual([...t.origenes], [...ORIGENES_TIENDA])
})

test('cada tienda vuelve a una web https y su ejemplo termina en número', () => {
  for (const t of Object.values(TIENDAS_SEGUIMIENTO)) {
    assert.match(t.web, /^https:\/\//)
    assert.match(t.ejemplo, /-\d+$/)
  }
})
