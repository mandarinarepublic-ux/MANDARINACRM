// Precio con punto o coma para los centavos.
// ⚠️ Import RELATIVO, no `@/`: ver la nota en tests/areas-usuario.test.js.
import test from 'node:test'
import assert from 'node:assert'
import { limpiarDecimal, normalizarDecimal, leerDecimal } from '../lib/decimal.js'

test('acepta coma y punto como separador de centavos', () => {
  assert.strictEqual(leerDecimal('12,50'), 12.5)
  assert.strictEqual(leerDecimal('12.50'), 12.5)
  assert.strictEqual(normalizarDecimal('12,5'), '12.5')
})

test('a medio escribir no se pierde el separador', () => {
  assert.strictEqual(limpiarDecimal('12,'), '12,')
  assert.strictEqual(limpiarDecimal('12.'), '12.')
  assert.strictEqual(leerDecimal('12,'), 12)
})

test('un solo separador y máximo 2 decimales', () => {
  assert.strictEqual(limpiarDecimal('12,5,0'), '12,50')
  assert.strictEqual(limpiarDecimal('1.2.3'), '1.23')
  assert.strictEqual(limpiarDecimal('9.999'), '9.99')
})

test('quita letras, espacios y el signo $', () => {
  assert.strictEqual(limpiarDecimal('$ 25 ,00'), '25,00')
  assert.strictEqual(leerDecimal(''), 0)
  assert.strictEqual(leerDecimal('abc'), 0)
})
