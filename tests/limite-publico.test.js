// Tope de envíos al recuadro de pago público (12-nov-2026): la parte sin red.
import test from 'node:test'
import assert from 'node:assert'
import { TOPES, ipDe, ventanaDe, claveDe, excede } from '../lib/limitePublico.js'

const req = (h) => ({ headers: new Map(Object.entries(h)) })

test('ip: x-real-ip primero, luego el primer x-forwarded-for, si no "sin-ip"', () => {
  assert.strictEqual(ipDe(req({ 'x-real-ip': '181.1.1.1', 'x-forwarded-for': '9.9.9.9' })), '181.1.1.1')
  assert.strictEqual(ipDe(req({ 'x-forwarded-for': ' 190.2.2.2 , 10.0.0.1' })), '190.2.2.2')
  assert.strictEqual(ipDe(req({})), 'sin-ip')
})

test('ventana: redondea hacia abajo al bloque de N minutos', () => {
  const t = Date.parse('2026-11-12T10:17:45Z')
  assert.strictEqual(ventanaDe(t, 10), '2026-11-12T10:10:00.000Z')
  assert.strictEqual(ventanaDe(t, 60), '2026-11-12T10:00:00.000Z')
})

test('clave: la IP nunca va en claro y cada acción cuenta aparte', () => {
  const a = claveDe('ip', '181.1.1.1', 'cotizar')
  assert.ok(!a.includes('181.1.1.1'))
  assert.notStrictEqual(a, claveDe('ip', '181.1.1.1', 'comprobante'))
  assert.notStrictEqual(a, claveDe('ip', '181.1.1.2', 'cotizar'))
  assert.strictEqual(a, claveDe('ip', '181.1.1.1', 'cotizar'))
})

test('topes: estado no se limita (la pantalla lo consulta en bucle); el resto sí', () => {
  assert.strictEqual(TOPES.estado, undefined)
  for (const acc of ['iniciar', 'cotizar', 'transferencia', 'intento', 'comprobante']) {
    assert.ok(TOPES[acc]?.ip > 0, acc)
  }
  // generosos por IP: en Ecuador muchos celulares salen por la misma IP (CGNAT)
  assert.ok(TOPES.cotizar.ip >= 40)
  // el comprobante sube una foto y crea un pedido: es el más corto
  assert.ok(TOPES.comprobante.ip < TOPES.cotizar.ip)
})

test('excede: pasa justo hasta el tope', () => {
  assert.strictEqual(excede(12, 12), false)
  assert.strictEqual(excede(13, 12), true)
  assert.strictEqual(excede(null, 12), false) // contador caído → deja pasar
})
