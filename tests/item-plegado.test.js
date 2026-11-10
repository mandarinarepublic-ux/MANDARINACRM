// Prenda recién agregada: plegada si está completa (ver lib/itemPlegado.js).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { nacePlegado, nuevoUid } from '../lib/itemPlegado.js'

const completa = { productoNombre: 'Camiseta', talla: 'M', cantidad: 1, precioUnit: 15 }

test('una prenda completa nace plegada (deja ver el resumen)', () => {
  assert.strictEqual(nacePlegado(completa), true)
  assert.strictEqual(nacePlegado({ ...completa, cantidad: '2', precioUnit: '12.5' }), true)
  assert.strictEqual(nacePlegado({ ...completa, precioUnit: 0 }), true, 'regalo a $0 sigue siendo completa')
})

test('☠️ la copia de DUPLICAR nace abierta: hay que llenarle talla y precio', () => {
  assert.strictEqual(nacePlegado({ ...completa, talla: '', precioUnit: '', cantidad: 0 }), false)
})

test('si falta cualquier cosa, nace abierta', () => {
  assert.strictEqual(nacePlegado({ ...completa, talla: '  ' }), false)
  assert.strictEqual(nacePlegado({ ...completa, precioUnit: '' }), false)
  assert.strictEqual(nacePlegado({ ...completa, precioUnit: undefined }), false)
  assert.strictEqual(nacePlegado({ ...completa, cantidad: 0 }), false)
  assert.strictEqual(nacePlegado(null), false)
})

test('los ids son distintos', () => {
  assert.notStrictEqual(nuevoUid(), nuevoUid())
})

test('ItemProducto usa la regla, no un abierto fijo', () => {
  const src = readFileSync(new URL('../components/pedido/ItemProducto.js', import.meta.url), 'utf8')
  assert.ok(/useState\(\(\) => !nacePlegado\(item\)\)/.test(src))
  assert.ok(!/useState\(true\)/.test(src.split('\n').find(l => l.includes('expanded')) || ''))
})

test('el pedido nuevo no usa el índice como key de las prendas', () => {
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.ok(!/<ItemProducto key=\{idx\}/.test(src))
})
