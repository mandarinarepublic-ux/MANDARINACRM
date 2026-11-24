// Validación de las acciones del admin de la caja (POST /api/caja/admin/accion).
import test from 'node:test'
import assert from 'node:assert/strict'
import { validarAccionAdmin } from '../lib/caja.js'

const PAGO = '3f2b8c1e-5a4d-4e6f-9a0b-1c2d3e4f5a6b'
const err = (b) => { const r = validarAccionAdmin(b); assert.equal(r.ok, false); return r.error }

test('acción desconocida o cuerpo vacío', () => {
  assert.equal(err({ accion: 'borrar-todo' }), 'Acción no reconocida')
  assert.equal(err(null), 'Acción no reconocida')
  assert.equal(err(undefined), 'Acción no reconocida')
})

test('confirmar-movimiento: OK y NO_CUADRA', () => {
  assert.deepEqual(validarAccionAdmin({ accion: 'confirmar-movimiento', movId: '7', resultado: 'OK' }),
    { ok: true, accion: 'confirmar-movimiento', datos: { movId: 7, resultado: 'OK' } })
  assert.deepEqual(validarAccionAdmin({ accion: 'confirmar-movimiento', movId: 7, resultado: 'NO_CUADRA', montoReal: '55,98' }).datos,
    { movId: 7, resultado: 'NO_CUADRA', montoRealC: 5598 })
  assert.equal(validarAccionAdmin({ accion: 'confirmar-movimiento', movId: 7, resultado: 'NO_CUADRA', montoReal: '0' }).datos.montoRealC, 0)
})

test('confirmar-movimiento: errores', () => {
  assert.match(err({ accion: 'confirmar-movimiento', movId: 0, resultado: 'OK' }), /movimiento/i)
  assert.match(err({ accion: 'confirmar-movimiento', movId: 'abc', resultado: 'OK' }), /movimiento/i)
  assert.match(err({ accion: 'confirmar-movimiento', movId: 1.5, resultado: 'OK' }), /movimiento/i)
  assert.match(err({ accion: 'confirmar-movimiento', movId: 7, resultado: 'TAL VEZ' }), /resultado/i)
  assert.match(err({ accion: 'confirmar-movimiento', movId: 7, resultado: 'NO_CUADRA' }), /Monto real/)
  assert.match(err({ accion: 'confirmar-movimiento', movId: 7, resultado: 'NO_CUADRA', montoReal: '-3' }), /Monto real/)
})

test('verificar-transferencia', () => {
  assert.deepEqual(validarAccionAdmin({ accion: 'verificar-transferencia', pagoId: PAGO, resultado: 'NO_LLEGO' }).datos,
    { pagoId: PAGO, resultado: 'NO_LLEGO' })
  assert.match(err({ accion: 'verificar-transferencia', pagoId: '12', resultado: 'LLEGO' }), /pago/i)
  assert.match(err({ accion: 'verificar-transferencia', pagoId: PAGO, resultado: 'OK' }), /resultado/i)
})

test('reabrir', () => {
  assert.deepEqual(validarAccionAdmin({ accion: 'reabrir', cierreId: '12' }).datos, { cierreId: 12 })
  assert.match(err({ accion: 'reabrir', cierreId: -1 }), /cierre/i)
  assert.match(err({ accion: 'reabrir' }), /cierre/i)
})

test('reposicion', () => {
  assert.deepEqual(validarAccionAdmin({ accion: 'reposicion', cajaId: 1, monto: '20,50', motivo: ' cambio ' }).datos,
    { cajaId: 1, montoC: 2050, motivo: 'cambio' })
  assert.equal(validarAccionAdmin({ accion: 'reposicion', cajaId: 1, monto: '5' }).datos.motivo, null)
  assert.match(err({ accion: 'reposicion', cajaId: 1, monto: '0' }), /mayor a cero/)
  assert.match(err({ accion: 'reposicion', cajaId: 1, monto: 'abc' }), /monto/i)
  assert.match(err({ accion: 'reposicion', cajaId: 0, monto: '5' }), /caja/i)
  assert.match(err({ accion: 'reposicion', cajaId: 1, monto: '5', motivo: 'x'.repeat(201) }), /200/)
})

test('ajustes: entre 0 y 500', () => {
  assert.deepEqual(validarAccionAdmin({ accion: 'ajustes', cajaId: 2, fondo_fijo: '20', tolerancia: '5,50' }).datos,
    { cajaId: 2, fondo_fijoC: 2000, toleranciaC: 550 })
  assert.deepEqual(validarAccionAdmin({ accion: 'ajustes', cajaId: 2, fondo_fijo: '0', tolerancia: '500' }).datos,
    { cajaId: 2, fondo_fijoC: 0, toleranciaC: 50000 })
  assert.match(err({ accion: 'ajustes', cajaId: 2, fondo_fijo: '500,01', tolerancia: '5' }), /fondo fijo.*\$500/i)
  assert.match(err({ accion: 'ajustes', cajaId: 2, fondo_fijo: '20', tolerancia: '501' }), /tolerancia/i)
  assert.match(err({ accion: 'ajustes', cajaId: 2, fondo_fijo: '-1', tolerancia: '5' }), /fondo fijo/i)
  assert.match(err({ accion: 'ajustes', cajaId: 2, fondo_fijo: '20' }), /tolerancia/i)
  assert.match(err({ accion: 'ajustes', fondo_fijo: '20', tolerancia: '5' }), /caja/i)
})

import { urlSegura } from '../lib/caja.js'
test('urlSegura solo deja pasar https', () => {
  assert.equal(urlSegura('https://res.cloudinary.com/x.jpg'), 'https://res.cloudinary.com/x.jpg')
  for (const malo of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'http://x', '', null, undefined, 5]) assert.equal(urlSegura(malo), null)
})
