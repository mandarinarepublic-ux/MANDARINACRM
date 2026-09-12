// tests/shopify-auth-borrada.test.js
//
// 🔒 /api/shopify/auth era un endpoint de diagnostico de UN SOLO USO que
// imprimia en HTML un token de Admin con write_products. No lo llamaba nadie,
// pero se lo mostraba a cualquiera de los ~14 usuarios del CRM, incluido un
// VENDEDOR. Esta prueba existe para que no vuelva.
import test from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { shopifyGraphQLPorTienda } from '../lib/shopify.js'

test('🔒 la ruta que imprimia un token de Admin no existe', () => {
  const ruta = new URL('../app/api/shopify/auth/route.js', import.meta.url)
  assert.equal(existsSync(ruta), false, 'volvio la ruta que reparte tokens')
})

test('se puede hablar con Shopify por id de tienda', () => {
  assert.equal(typeof shopifyGraphQLPorTienda, 'function')
})

test('una tienda que no existe falla con un mensaje que se entiende', async () => {
  await assert.rejects(
    () => shopifyGraphQLPorTienda('YAW', 'query { shop { name } }'),
    /YAW/,
    'el error tiene que nombrar la tienda')
})
