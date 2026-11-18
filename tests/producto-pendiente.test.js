// tests/producto-pendiente.test.js — el 2.º producto no se pierde al dar
// "Siguiente" sin tocar "+ Agregar al pedido" (17-nov-2026).

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  faltantesShopify, faltantesPersonalizado, personalizadoTocado, resolverPendientes,
} from '../lib/productoPendiente.js'

const COMPLETO = { color: 'Negro', talla: 'M', area: 'SUBLIMACION', detalle: 'logo pecho', cantidad: 2, precio: 25 }

test('Shopify completo no tiene faltantes', () => {
  assert.deepStrictEqual(faltantesShopify(COMPLETO), [])
})

test('Shopify sin talla ni precio dice exactamente eso', () => {
  assert.deepStrictEqual(faltantesShopify({ ...COMPLETO, talla: '', precio: 0 }), ['Talla', 'Precio'])
})

test('Personalizado: cantidad y precio vienen como texto vacío del input', () => {
  const f = faltantesPersonalizado({ nombre: 'HOODIE', ...COMPLETO, cantidad: '', precio: '' })
  assert.deepStrictEqual(f, ['Cantidad', 'Precio'])
})

test('Personalizado vacío NO cuenta como tocado (el form de YAW siempre está abierto)', () => {
  assert.strictEqual(personalizadoTocado({ nombre: '', color: '', talla: '', area: '', detalle: '', cantidad: '', precio: '' }, {}), false)
  assert.strictEqual(personalizadoTocado({ nombre: '', color: 'Rojo' }, {}), true)
  assert.strictEqual(personalizadoTocado({}, { fotoPecho: 'https://x/y.jpg' }), true)
})

test('completo → se agrega; vacío → se ignora', () => {
  const item = { productoNombre: 'CAMISETA' }
  const r = resolverPendientes([
    { item, faltan: [], tocado: true },
    { item: { productoNombre: '' }, faltan: ['Nombre'], tocado: false },
    null,
  ])
  assert.strictEqual(r.error, null)
  assert.deepStrictEqual(r.agregar, [item])
})

test('a medias → NO agrega nada y dice qué falta', () => {
  const r = resolverPendientes([
    { item: { productoNombre: 'CAMISETA' }, faltan: [], tocado: true },
    { item: { productoNombre: 'HOODIE' }, faltan: ['Talla'], tocado: true },
  ])
  assert.deepStrictEqual(r.agregar, [])
  assert.match(r.error, /HOODIE/)
  assert.match(r.error, /Talla/)
})

test('sin formularios abiertos no pasa nada', () => {
  assert.deepStrictEqual(resolverPendientes([]), { agregar: [], error: null })
  assert.deepStrictEqual(resolverPendientes(undefined), { agregar: [], error: null })
})

// El cableado: si alguien quita esto, el bug vuelve sin que falle nada más.
test('el pedido nuevo resuelve los pendientes al salir del paso 2', () => {
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.match(src, /resolverPendientes\(/)
  assert.match(src, /onPendiente=\{reportarPendiente\}/)
})
