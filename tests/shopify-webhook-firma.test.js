import test from 'node:test'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'
import { firmaValida, tiendaPorDominio } from '../lib/shopifyWebhook.js'

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
