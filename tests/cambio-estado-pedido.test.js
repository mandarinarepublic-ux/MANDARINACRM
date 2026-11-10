// Combo de estado del pedido en Producción (lib/cambioEstadoPedido.js).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { planCambio, estadoComun } from '../lib/cambioEstadoPedido.js'

const sinArea = () => null
const estampa = (it) => (String(it.AREA).includes('ESTAMPADO') ? 'ESTAMPADO' : null)

test('prendas simples: un PATCH por prenda que cambia', () => {
  const items = [
    { ITEM_ID: 'a', AREA: 'ESTAMPADO', SUBESTADO: 'SOLICITADO' },
    { ITEM_ID: 'b', AREA: 'BORDADO', SUBESTADO: 'LISTO' },
  ]
  const { llamadas } = planCambio(items, 'LISTO', true, sinArea)
  assert.deepStrictEqual(llamadas, [{ itemId: 'a', body: { SUBESTADO: 'LISTO' } }])
})

test('☠️ multi-área: el de ESTAMPADO solo mueve su parte', () => {
  const items = [{ ITEM_ID: 'm', AREA: 'ESTAMPADO + BORDADO', SUBESTADO: 'ESTAMPADO:SOLICITADO|BORDADO:SOLICITADO' }]
  const { llamadas, resultado } = planCambio(items, 'LISTO', false, estampa)
  assert.deepStrictEqual(llamadas, [{ itemId: 'm', body: { SUBESTADO: 'LISTO', AREA_ROL: 'ESTAMPADO' } }])
  assert.strictEqual(resultado.m, 'ESTAMPADO:LISTO|BORDADO:SOLICITADO')
})

test('multi-área: ADMIN mueve todas las áreas', () => {
  const items = [{ ITEM_ID: 'm', AREA: 'ESTAMPADO + BORDADO', SUBESTADO: 'ESTAMPADO:LISTO|BORDADO:SOLICITADO' }]
  const { llamadas } = planCambio(items, 'LISTO', true, sinArea)
  assert.deepStrictEqual(llamadas, [{ itemId: 'm', body: { SUBESTADO: 'LISTO', AREA_ROL: 'BORDADO' } }])
})

test('no toca entregado en tienda ni eliminado', () => {
  const items = [
    { ITEM_ID: 't', AREA: 'ENTREGA EN TIENDA', SUBESTADO: 'ENTREGADO_TIENDA' },
    { ITEM_ID: 'e', AREA: 'ESTAMPADO', SUBESTADO: 'ELIMINADO' },
  ]
  assert.strictEqual(planCambio(items, 'LISTO', true, sinArea).llamadas.length, 0)
})

test('estadoComun: igual en todas → ese; distintos → vacío', () => {
  assert.strictEqual(estadoComun([{ AREA: 'ESTAMPADO', SUBESTADO: 'LISTO' }, { AREA: 'BORDADO', SUBESTADO: 'LISTO' }], true, sinArea), 'LISTO')
  assert.strictEqual(estadoComun([{ AREA: 'ESTAMPADO', SUBESTADO: 'LISTO' }, { AREA: 'BORDADO', SUBESTADO: 'SOLICITADO' }], true, sinArea), '')
  assert.strictEqual(estadoComun([{ AREA: 'ESTAMPADO + BORDADO', SUBESTADO: 'ESTAMPADO:LISTO|BORDADO:SOLICITADO' }], false, estampa), 'LISTO')
})

test('Producción tiene el combo al lado del PDF', () => {
  const src = readFileSync(new URL('../app/dashboard/produccion/page.js', import.meta.url), 'utf8')
  assert.ok(/planCambio\(/.test(src))
  assert.ok(src.indexOf('<ComboEstadoPedido') > -1 && src.indexOf('<ComboEstadoPedido') < src.indexOf('title="Ver hoja de confección PDF"'))
})
