import test from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { firmaValida, tiendaPorDominio, secretoDeFirma } from '../lib/shopifyWebhook.js'

const SECRETO = 'secreto-de-prueba'
const CUERPO = '{"id":123,"financial_status":"paid"}'
const firmar = (cuerpo, secreto) => createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('base64')

test('una firma buena pasa', async () => {
  assert.ok(await firmaValida(CUERPO, firmar(CUERPO, SECRETO), SECRETO))
})

test('☠️ CONTROL NEGATIVO: firma inválida NO pasa', async () => {
  assert.ok(!await firmaValida(CUERPO, firmar(CUERPO, 'otro-secreto'), SECRETO))
  assert.ok(!await firmaValida(CUERPO, 'basura', SECRETO))
  assert.ok(!await firmaValida(CUERPO, '', SECRETO))
  assert.ok(!await firmaValida(CUERPO, null, SECRETO))
})

test('☠️ un cuerpo alterado invalida la firma', async () => {
  const firma = firmar(CUERPO, SECRETO)
  assert.ok(!await firmaValida(CUERPO.replace('paid', 'pending'), firma, SECRETO))
})

test('sin secreto NUNCA pasa, aunque la firma venga vacía', async () => {
  assert.ok(!await firmaValida(CUERPO, '', ''))
})

test('un dominio desconocido no resuelve a ninguna tienda', () => {
  assert.strictEqual(tiendaPorDominio('tienda-falsa.myshopify.com'), null)
  assert.strictEqual(tiendaPorDominio(''), null)
  assert.strictEqual(tiendaPorDominio(null), null)
})

test('secretoDeFirma: con SHOPIFY_MANDARINA_WEBHOOK_SECRET definido, manda ese y no el client secret', () => {
  const original = process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET
  try {
    process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET = 'secreto-del-panel'
    assert.strictEqual(secretoDeFirma({ id: 'MANDARINA', clientSecret: 'cs' }), 'secreto-del-panel')
  } finally {
    if (original === undefined) delete process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET
    else process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET = original
  }
})

test('secretoDeFirma: sin la variable propia, el client secret queda de respaldo', () => {
  const original = process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET
  try {
    delete process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET
    assert.strictEqual(secretoDeFirma({ id: 'MANDARINA', clientSecret: 'cs' }), 'cs')
  } finally {
    if (original === undefined) delete process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET
    else process.env.SHOPIFY_MANDARINA_WEBHOOK_SECRET = original
  }
})

test('☠️ secretoDeFirma: sin tienda da vacío, y un secreto vacío nunca deja pasar nada', async () => {
  assert.strictEqual(secretoDeFirma(null), '')
  assert.ok(!await firmaValida(CUERPO, firmar(CUERPO, SECRETO), ''))
})
