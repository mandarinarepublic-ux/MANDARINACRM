import test from 'node:test'
import assert from 'node:assert'
import { fetchFotosDeVariantes } from '../lib/shopify.js'

// ☠️ El webhook de pedidos de Shopify NO manda line_items[].image (verificado
// con un pedido real el 30-ago-2026): sin esta función, la prenda entra sin
// foto — y el dueño pidió explícitamente que eso nunca pase.

test('sin variantes no llama a la red: devuelve {} de una', async () => {
  const fotos = await fetchFotosDeVariantes({ id: 'MANDARINA', store: 'x.myshopify.com' }, [])
  assert.deepStrictEqual(fotos, {})
})

test('con undefined en vez de arreglo, también devuelve {} sin llamar a la red', async () => {
  const fotos = await fetchFotosDeVariantes({ id: 'MANDARINA', store: 'x.myshopify.com' }, undefined)
  assert.deepStrictEqual(fotos, {})
})

test('con puros ids vacíos/falsy, tampoco llama a la red', async () => {
  const fotos = await fetchFotosDeVariantes({ id: 'MANDARINA', store: 'x.myshopify.com' }, [null, undefined, ''])
  assert.deepStrictEqual(fotos, {})
})

test('sin tienda (null) y sin variantes, devuelve {} sin explotar', async () => {
  const fotos = await fetchFotosDeVariantes(null, [])
  assert.deepStrictEqual(fotos, {})
})
