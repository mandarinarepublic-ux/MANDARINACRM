import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeAbrirPedido } from '../lib/tiendasUsuario.js'

// Usuarios como los devuelve getUsuarioById (TIENDAS en CSV, ACCESOS arreglo).
const jackeline = { ROL: 'VENDEDOR', NOMBRE: 'JACKELINE BARRETO', USUARIO_ID: 'u-jac', TIENDAS: 'MANDARINA,INDSTORE', ACCESOS: ['VER_TODAS_LAS_VENTAS', 'CAJA'] }
const grace = { ROL: 'VENDEDOR', NOMBRE: 'GRACE VEGA', USUARIO_ID: 'u-gra', TIENDAS: 'MANDARINA', ACCESOS: ['INBOX_MANDARINA'] }
const clever = { ROL: 'VENDEDOR', NOMBRE: 'Clever ', USUARIO_ID: 'u-cle', TIENDAS: 'INDSTORE,MANDARINA', ACCESOS: [] }

test('con VER_TODAS_LAS_VENTAS abre pedidos de otros vendedores de sus tiendas', () => {
  assert.equal(puedeAbrirPedido(jackeline, { vendedorId: 'GRACE VEGA', tiendaId: 'MANDARINA' }), true)
  assert.equal(puedeAbrirPedido(jackeline, { vendedorId: 'MAJO', tiendaId: 'INDSTORE' }), true)
})

test('el permiso no abre YAW si no tiene esa tienda', () => {
  assert.equal(puedeAbrirPedido(jackeline, { vendedorId: 'YAW', tiendaId: 'YAW' }), false)
})

test('un vendedor sin el permiso sigue abriendo solo los suyos', () => {
  assert.equal(puedeAbrirPedido(grace, { vendedorId: 'GRACE VEGA', tiendaId: 'MANDARINA' }), true)
  assert.equal(puedeAbrirPedido(grace, { vendedorId: 'u-gra', tiendaId: 'MANDARINA' }), true)
  assert.equal(puedeAbrirPedido(grace, { vendedorId: 'JACKELINE BARRETO', tiendaId: 'MANDARINA' }), false)
  assert.equal(puedeAbrirPedido(grace, { vendedorId: '', tiendaId: 'MANDARINA' }), false)
})

test('el nombre con espacio al final sigue contando como suyo', () => {
  assert.equal(puedeAbrirPedido(clever, { vendedorId: 'Clever ', tiendaId: 'INDSTORE' }), true)
})

test('los demás roles no se restringen aquí', () => {
  assert.equal(puedeAbrirPedido({ ROL: 'ADMIN' }, { vendedorId: 'X', tiendaId: 'YAW' }), true)
  assert.equal(puedeAbrirPedido({ ROL: 'DESPACHO' }, { vendedorId: 'X', tiendaId: 'MANDARINA' }), true)
})
