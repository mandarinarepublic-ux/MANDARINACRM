// tests/borrador-pedido.test.js — El Pedido Nuevo no se pierde al refrescar
// (en el celular, bajar con el dedo recarga la página).

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  armarBorrador, borradorVigente, hayTrabajo, llaveBorrador, resumenBorrador,
  haceCuanto, VIGENCIA_MS,
} from '../lib/borradorPedido.js'

const AHORA = Date.UTC(2026, 9, 7, 20, 0, 0)

const estado = {
  tienda: 'MANDARINA', clienteId: 'CLI-1',
  cliente: { nombre: 'MARÍA PÉREZ', cedula: '0912345678', celular: '0987654321', email: '', ciudad: 'GYE', direccion: 'x' },
  tipoId: 'CEDULA', emitirFactura: true, usarMapa: false,
  items: [
    { productoNombre: 'HOODIE PREMIUM', precioUnit: '35', cantidad: 2, fotoPecho: 'https://res.cloudinary.com/x.jpg' },
    { productoNombre: 'CAMISETA', precioUnit: '15', cantidad: 1 },
  ],
  pagos: [{ tipo: 'TRANSFERENCIA', monto: '40', fotoComprobante: 'data:image/jpeg;base64,' + 'A'.repeat(5000) }],
  fechaEntrega: '2026-10-12', notasVendedor: 'urgente', step: 3,
}

test('lo precargado NO cuenta como trabajo; lo escrito sí', () => {
  assert.equal(hayTrabajo({ cliente: { nombre: 'Juan', celular: '0987654321' }, items: [], pagos: [{ monto: '' }] }), false,
    'nombre y celular llegan solos desde el inbox')
  assert.equal(hayTrabajo({ cliente: {}, items: [{}] }), true)
  assert.equal(hayTrabajo({ cliente: { cedula: '09' } }), true)
  assert.equal(hayTrabajo({ cliente: {}, pagos: [{ monto: '5' }] }), true)
  assert.equal(hayTrabajo(null), false)
})

test('el comprobante en base64 NO se guarda (puede pesar más que todo localStorage)', () => {
  const b = armarBorrador(estado, AHORA)
  assert.equal(b.sinComprobante, true)
  assert.equal(b.datos.pagos[0].fotoComprobante, undefined)
  assert.equal(b.datos.pagos[0].monto, '40', 'el resto del pago sí')
  assert.equal(b.datos.items[0].fotoPecho, 'https://res.cloudinary.com/x.jpg', 'las fotos subidas (URLs) sí')
  assert.ok(JSON.stringify(b).length < 2000)
})

test('un comprobante ya subido (URL) sí se conserva', () => {
  const b = armarBorrador({ ...estado, pagos: [{ monto: '5', fotoComprobante: 'https://x/y.jpg' }] }, AHORA)
  assert.equal(b.sinComprobante, false)
  assert.equal(b.datos.pagos[0].fotoComprobante, 'https://x/y.jpg')
})

test('ida y vuelta: lo guardado se puede recuperar', () => {
  const b = borradorVigente(JSON.stringify(armarBorrador(estado, AHORA)), AHORA + 5 * 60000)
  assert.ok(b)
  assert.equal(b.datos.items.length, 2)
  assert.equal(b.datos.step, 3)
  assert.equal(b.datos.fechaEntrega, '2026-10-12')
})

test('no se ofrece un borrador vencido, roto, de otra versión o vacío', () => {
  const t = JSON.stringify(armarBorrador(estado, AHORA))
  assert.equal(borradorVigente(t, AHORA + VIGENCIA_MS + 1), null, 'vencido')
  assert.equal(borradorVigente('{roto', AHORA), null)
  assert.equal(borradorVigente(null, AHORA), null)
  assert.equal(borradorVigente(JSON.stringify({ ...JSON.parse(t), v: 99 }), AHORA), null)
  const vacio = JSON.stringify(armarBorrador({ cliente: { nombre: 'X' }, items: [], pagos: [] }, AHORA))
  assert.equal(borradorVigente(vacio, AHORA), null, 'sin trabajo no hay nada que preguntar')
})

test('en el inbox cada cliente tiene su borrador', () => {
  assert.equal(llaveBorrador('u1'), 'mp_borrador_pedido:u1')
  assert.notEqual(llaveBorrador('u1', { embed: true, celular: '0987654321' }), llaveBorrador('u1', { embed: true, celular: '0999999999' }))
  assert.notEqual(llaveBorrador('u1', { embed: true, celular: '0987654321' }), llaveBorrador('u1'))
})

test('el resumen permite reconocer el pedido', () => {
  assert.equal(resumenBorrador(armarBorrador(estado, AHORA)), 'MARÍA PÉREZ · 2 prendas · $85.00')
  assert.equal(haceCuanto(AHORA - 5 * 60000, AHORA), 'hace 5 min')
  assert.equal(haceCuanto(AHORA - 3 * 3600000, AHORA), 'hace 3 h')
})

test('la pantalla: guarda, pregunta, bloquea el gesto de refrescar y limpia al crear', () => {
  const page = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.ok(/armarBorrador\(/.test(page), 'guarda mientras se llena')
  assert.ok(/borradorVigente\(/.test(page), 'lee el borrador al entrar')
  assert.ok(/Deseas volver a llenar el pedido/.test(page), 'la pregunta que pidió Rodrigo')
  assert.ok(/overscrollBehaviorY\s*=\s*'contain'/.test(page), 'bloquea el bajar-para-refrescar')
  assert.ok(/beforeunload/.test(page), 'aviso del navegador si igual se intenta salir')
  // Al crear el pedido el borrador se borra ANTES de navegar.
  const crear = page.slice(page.indexOf("fetch('/api/pedidos'"))
  assert.ok(crear.indexOf('borrarBorrador()') > -1 && crear.indexOf('borrarBorrador()') < crear.indexOf('router.push'),
    'si no se borra, el pedido ya creado se volvería a ofrecer y saldría DOS veces')
})
