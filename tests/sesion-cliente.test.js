// El navegador se pone al día con la base: permisos nuevos y versión nueva.
import test from 'node:test'
import assert from 'node:assert/strict'
import { usuarioParaCliente, refrescarUsuario, hayVersionNueva } from '../lib/sesionCliente.js'
import { getNavItems } from '../lib/menu.js'

const DE_LA_BASE = {
  USUARIO_ID: 'uuid-007', NOMBRE: 'JACKELINE BARRETO', CODIGO: 'JACK', EMAIL: 'j@x.com',
  ROL: 'VENDEDOR', AREAS: '', TIENDAS: 'MANDARINA,INDSTORE',
  ACCESOS: ['VER_TODAS_LAS_VENTAS', 'CAJA'], ACTIVO: 'TRUE', PASSWORD_HASH: undefined,
}
// Lo que quedó guardado al entrar, ANTES de que le dieran CAJA.
const GUARDADO = {
  id: 'uuid-007', nombre: 'JACKELINE BARRETO', codigo: 'JACK', email: 'j@x.com',
  rol: 'VENDEDOR', areas: [], tiendas: ['MANDARINA', 'INDSTORE'], accesos: ['VER_TODAS_LAS_VENTAS'],
}

test('usuarioParaCliente: misma forma que el login, sin contraseña', () => {
  const u = usuarioParaCliente(DE_LA_BASE)
  assert.deepEqual(u, { ...GUARDADO, accesos: ['VER_TODAS_LAS_VENTAS', 'CAJA'] })
  assert.ok(!('PASSWORD_HASH' in u) && !('password_hash' in u))
  assert.equal(usuarioParaCliente(null), null)
})

test('el permiso CAJA nuevo llega al menú sin volver a entrar', () => {
  const labels = (u) => getNavItems(u).map((n) => n.label)
  assert.ok(!labels(GUARDADO).includes('Caja'))
  const nuevo = refrescarUsuario(GUARDADO, usuarioParaCliente(DE_LA_BASE))
  assert.ok(nuevo)
  assert.ok(labels(nuevo).includes('Caja'))
})

test('refrescarUsuario: null si nada cambió, y conserva campos que no conoce', () => {
  const al = { ...GUARDADO, accesos: ['VER_TODAS_LAS_VENTAS', 'CAJA'], extra: 'x' }
  assert.equal(refrescarUsuario(al, usuarioParaCliente(DE_LA_BASE)), null)
  const cambiado = refrescarUsuario({ ...GUARDADO, extra: 'x' }, usuarioParaCliente(DE_LA_BASE))
  assert.equal(cambiado.extra, 'x')
})

test('refrescarUsuario: también quita un permiso que se le sacó', () => {
  const conCaja = { ...GUARDADO, accesos: ['VER_TODAS_LAS_VENTAS', 'CAJA'] }
  const sinCaja = usuarioParaCliente({ ...DE_LA_BASE, ACCESOS: ['VER_TODAS_LAS_VENTAS'] })
  assert.deepEqual(refrescarUsuario(conCaja, sinCaja).accesos, ['VER_TODAS_LAS_VENTAS'])
})

test('refrescarUsuario: nunca pisa una sesión con OTRA persona ni con basura', () => {
  assert.equal(refrescarUsuario(GUARDADO, { ...usuarioParaCliente(DE_LA_BASE), id: 'uuid-001' }), null)
  assert.equal(refrescarUsuario(GUARDADO, null), null)
  assert.equal(refrescarUsuario(GUARDADO, {}), null)
  assert.equal(refrescarUsuario(null, usuarioParaCliente(DE_LA_BASE)), null)
})

test('hayVersionNueva: solo si los dos lados se conocen y son distintos', () => {
  assert.equal(hayVersionNueva('abc', 'def'), true)
  assert.equal(hayVersionNueva('abc', 'abc'), false)
  assert.equal(hayVersionNueva('', 'def'), false)   // en local no hay build
  assert.equal(hayVersionNueva('abc', ''), false)   // la consulta falló
  assert.equal(hayVersionNueva(undefined, undefined), false)
})
