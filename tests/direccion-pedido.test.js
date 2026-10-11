import test from 'node:test'
import assert from 'node:assert/strict'
import { direccionSinCiudad, lineasDeTexto } from '../lib/direccionPedido.js'

test('quita la línea CIUDAD de borradores viejos', () => {
  assert.equal(direccionSinCiudad('CIUDAD: Quito\nCalle principal: Amazonas'), 'Calle principal: Amazonas')
})
test('texto sin línea CIUDAD queda igual y conserva saltos', () => {
  assert.equal(direccionSinCiudad('Calle A\n\nRef: parque'), 'Calle A\n\nRef: parque')
})
test('lineasDeTexto parte por saltos', () => {
  assert.deepEqual(lineasDeTexto('a\r\n\nb'), ['a', '', 'b'])
})
