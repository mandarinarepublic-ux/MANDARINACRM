// Compras de la tienda web y la ficha del cliente (12-nov-2026): la tienda es
// pública, cualquiera puede escribir la cédula de otro. Solo se actualiza la
// ficha si el celular coincide; si no, la ficha queda intacta y el pedido avisa.
import test from 'node:test'
import assert from 'node:assert'
import { decidirClienteWeb, mismoCelular } from '../lib/clienteTiendaWeb.js'

const ficha = { CLIENTE_ID: 'c1', NOMBRE: 'Ana Pérez', CELULAR: '0991234567', EMAIL: 'ana@x.com', CIUDAD: 'Quito', DIRECCION: 'Av. 1' }

test('celular: compara los últimos 9 dígitos (09…, +593 9…, 593 9…)', () => {
  assert.ok(mismoCelular('0991234567', '+593991234567'))
  assert.ok(mismoCelular('593 99 123 4567', '0991234567'))
  assert.ok(!mismoCelular('0991234567', '0997654321'))
  assert.ok(!mismoCelular('', '0991234567'))
})

test('no existe la cédula → se crea', () => {
  assert.deepStrictEqual(decidirClienteWeb(null, { nombre: 'Ana' }), { accion: 'crear', nota: '' })
})

test('mismo celular → misma persona, pero igual NO se pisa: solo se llena lo vacío', () => {
  const d = decidirClienteWeb({ ...ficha, EMAIL: '' }, { nombre: 'Ana P.', celular: '+593991234567', email: 'nuevo@x.com' })
  assert.strictEqual(d.accion, 'completar')
  assert.deepStrictEqual(d.campos, { email: 'nuevo@x.com' }) // el nombre de la ficha se queda
  assert.match(d.nota, /no coinciden/) // "Ana P." ≠ "Ana Pérez" → el vendedor lo ve
})

test('todo coincide → nada que escribir, sin nota', () => {
  const d = decidirClienteWeb(ficha, { nombre: 'ana  PÉREZ', celular: '0991234567', email: 'ANA@x.com' })
  assert.deepStrictEqual(d, { accion: 'conservar', nota: '' })
})

// ☠️ Revisiones de seguridad (12-nov): el CELULAR nunca se escribe desde la tienda.
// Si se llenaba en una ficha sin celular, una 2.ª compra "coincidía" y pisaba todo.
test('ficha sin celular → NO se escribe nada (no hay cómo probar que es el dueño)', () => {
  const sinCel = { ...ficha, CELULAR: '', EMAIL: '' }
  const d = decidirClienteWeb(sinCel, { nombre: 'Intruso', celular: '0991234567', email: 'i@x.com', ciudad: 'Loja', direccion: 'Otra' })
  assert.strictEqual(d.accion, 'conservar')
  assert.match(d.nota, /no coinciden con la ficha/)
})

test('otro celular y la ficha tiene vacíos → tampoco se llenan', () => {
  const d = decidirClienteWeb({ ...ficha, EMAIL: '' }, { nombre: 'Carlos', celular: '0987654321', email: 'c@y.com' })
  assert.strictEqual(d.accion, 'conservar')
})

test('☠️ ataque en dos compras: la ficha sigue sin celular y nada se pisa', () => {
  const sinCel = { ...ficha, CELULAR: '' }
  const primera = decidirClienteWeb(sinCel, { nombre: 'Intruso', celular: '0980000000' })
  assert.ok(!('celular' in (primera.campos || {})))
  // la ficha quedó igual (sin celular): la segunda compra tampoco pisa nada
  const segunda = decidirClienteWeb(sinCel, { nombre: 'Intruso', celular: '0980000000', email: 'x@x.com', direccion: 'Otra' })
  assert.deepStrictEqual(segunda.campos || {}, {})
  assert.match(segunda.nota, /no coinciden/)
})

test('OTRO celular → la ficha NO se toca y el pedido lleva los datos del comprador', () => {
  const d = decidirClienteWeb(ficha, { nombre: 'Carlos Mora', celular: '0987654321', email: 'carlos@y.com', ciudad: 'Guayaquil', direccion: 'Calle 9' })
  assert.strictEqual(d.accion, 'conservar')
  assert.match(d.nota, /no coinciden con la ficha/)
  assert.match(d.nota, /Carlos Mora/)
  assert.match(d.nota, /0987654321/)
  assert.match(d.nota, /carlos@y\.com/)
})

test('compra sin celular y la ficha sí tiene → se conserva (no se puede comprobar)', () => {
  const d = decidirClienteWeb(ficha, { nombre: 'Alguien', celular: '' })
  assert.strictEqual(d.accion, 'conservar')
})

test('☠️ la ruta de pedidos usa la regla cuando vende la TIENDA WEB', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
  assert.match(src, /decidirClienteWeb\(existente, datosCliente\)/)
  assert.match(src, /esTiendaWeb = !!idTiendaWeb && String\(vendedorId\) === idTiendaWeb/)
  // la nota viaja en el pedido
  assert.ok(src.includes("[notasVendedor, notaCliente].filter(Boolean).join('\\n')"))
})
