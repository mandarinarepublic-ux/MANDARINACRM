// La plata en pantalla se escribe igual en todo el CRM: la referencia es el
// Reporte de pagos (es-EC: punto de miles, coma decimal, "$" delante).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatoUSD } from '../lib/dinero.js'

test('por defecto, dos decimales con separador de miles es-EC', () => {
  assert.equal(formatoUSD(1234.5), '$1.234,50')
  assert.equal(formatoUSD(0), '$0,00')
})

test('sin decimales para tarjetas: lo que Inicio mostraba, pero con miles', () => {
  assert.equal(formatoUSD(3768.51, { decimales: 0 }), '$3.769')
  assert.equal(formatoUSD(999, { decimales: 0 }), '$999')
  assert.equal(formatoUSD(1250000, { decimales: 0 }), '$1.250.000')
})

test('lo que no es número se escribe $0, como en la referencia', () => {
  for (const basura of [null, undefined, '', 'abc', NaN]) {
    assert.equal(formatoUSD(basura, { decimales: 0 }), '$0')
  }
  assert.equal(formatoUSD('45.2'), '$45,20', 'un texto numérico sí se lee')
})

test('coincide con el `money` del Reporte de pagos (la referencia)', () => {
  // Misma fórmula que app/dashboard/reporte-pagos/page.js; si allá cambia,
  // esta prueba avisa de que las dos pantallas se desincronizaron.
  const ref = readFileSync(new URL('../app/dashboard/reporte-pagos/page.js', import.meta.url), 'utf8')
  assert.ok(/toLocaleString\('es-EC', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)/.test(ref),
    'la referencia cambió de formato: revisar lib/dinero.js')
  const money = (n) => `$${(Number(n) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  for (const n of [0, 1, 12.345, 1234.5, 98765.4321, -15]) assert.equal(formatoUSD(n), money(n))
})

test('Inicio ya no escribe plata con toFixed a mano', () => {
  const inicio = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  assert.ok(!/`\$\$\{[^}]*toFixed/.test(inicio), 'quedó un `$${x.toFixed()}` sin miles')
  assert.ok(/formatoUSD\(/.test(inicio))
})
