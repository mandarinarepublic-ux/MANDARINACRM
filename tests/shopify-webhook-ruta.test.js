import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const ruta = readFileSync(new URL('../app/api/shopify/pedidos/route.js', import.meta.url), 'utf8')

test('☠️ lee el cuerpo CRUDO antes de parsear, o la firma nunca cuadra', () => {
  assert.ok(/await\s+req\.text\(\)/.test(ruta), 'tiene que usar req.text(), no req.json()')
  assert.ok(!/await\s+req\.json\(\)/.test(ruta), 'req.json() rompe la verificación del HMAC')
})

test('☠️ MIRA res.ok en la llamada a /api/pedidos — la lección de LINKPAGO', () => {
  assert.ok(/res\.ok|\.ok\b/.test(ruta), 'un 401 no lanza: sin res.ok el fallo se descarta solo')
})

test('☠️ si la creación falla, avisa por Telegram', () => {
  assert.ok(/notificarPedidoWebFallido/.test(ruta), 'un pedido que no entra tiene que hacer ruido')
})

test('los avisos se ESPERAN, no van fire-and-forget', () => {
  assert.ok(/await\s+notificarPedidoWebSinPagar/.test(ruta), 'en serverless un aviso sin await se pierde')
  assert.ok(/await\s+notificarPedidoWebFallido/.test(ruta))
})

test('le contesta 200 a Shopify aunque algo falle, o borra la suscripción', () => {
  assert.ok(/status:\s*200|Response\.json\(\s*\{\s*ok/.test(ruta))
})
