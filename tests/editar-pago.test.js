// tests/editar-pago.test.js — Corregir un abono ya registrado (solo ADMIN).

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { validarEdicionPago, describirPago, TIPOS_PAGO } from '../lib/editarPago.js'

const actual = { tipo: 'EFECTIVO', monto: 20, notas: 'abono', fecha: '2026-10-06T15:00:00Z' }

test('solo devuelve lo que de verdad cambia', () => {
  const v = validarEdicionPago(actual, { tipo: 'EFECTIVO', monto: '200', notas: 'abono' })
  assert.deepEqual(v, { ok: true, cambios: { monto: 200 } })
})

test('sin cambios no es un error', () => {
  assert.deepEqual(validarEdicionPago(actual, { monto: '20.00', notas: ' abono ' }), { ok: true, cambios: {} })
})

test('el monto se redondea a centavos y tiene que ser > 0', () => {
  assert.equal(validarEdicionPago(actual, { monto: '15.555' }).cambios.monto, 15.56)
  for (const malo of ['0', '-5', 'abc', '']) {
    const v = validarEdicionPago(actual, { monto: malo })
    assert.equal(v.ok, false, `«${malo}» no puede pasar`)
    assert.match(v.error, /elimínalo/, 'el error dice qué hacer si el pago sobra')
  }
})

test('el tipo tiene que ser uno de los conocidos', () => {
  assert.deepEqual(TIPOS_PAGO, ['EFECTIVO', 'TRANSFERENCIA', 'LINK_PAGO'])
  assert.equal(validarEdicionPago(actual, { tipo: 'transferencia' }).cambios.tipo, 'TRANSFERENCIA')
  assert.equal(validarEdicionPago(actual, { tipo: 'BITCOIN' }).ok, false)
})

test('vaciar las notas las deja en null', () => {
  assert.deepEqual(validarEdicionPago(actual, { notas: '  ' }).cambios, { notas: null })
})

test('NUNCA se cambian fecha, comprobante ni quién lo registró', () => {
  const v = validarEdicionPago(actual, {
    fecha: '2020-01-01', foto_comprobante_url: 'x', vendedor_id: 'otro', pedido_id: 'MAN-X-1', estado: 'PAGADO',
  })
  assert.deepEqual(v, { ok: true, cambios: {} })
})

test('la bitácora lleva tipo, monto, fecha y notas', () => {
  assert.equal(describirPago(actual), 'EFECTIVO $20.00 · 2026-10-06 · abono')
  assert.equal(describirPago(null), '')
})

test('la ruta exige ADMIN en PATCH y en DELETE, y recalcula el pedido', () => {
  const src = readFileSync(new URL('../app/api/pagos/[id]/route.js', import.meta.url), 'utf8')
  const patch = src.slice(src.indexOf('export async function PATCH'), src.indexOf('export async function DELETE'))
  const del = src.slice(src.indexOf('export async function DELETE'))
  for (const [nombre, cuerpo] of [['PATCH', patch], ['DELETE', del]]) {
    assert.ok(/await requireAdmin\(req\)/.test(cuerpo), `${nombre} sin requireAdmin`)
    assert.ok(cuerpo.indexOf('requireAdmin') < cuerpo.indexOf('getPagoRaw'), `${nombre}: el permiso va ANTES de leer`)
    assert.ok(/await recalcPago\(/.test(cuerpo), `${nombre} tiene que recalcular el saldo`)
    assert.ok(/await logCambio\(/.test(cuerpo), `${nombre} tiene que dejar rastro, con await`)
  }
})

test('la pantalla solo muestra el lápiz a ADMIN', () => {
  const page = readFileSync(new URL('../app/dashboard/pedido/[id]/page.js', import.meta.url), 'utf8')
  assert.ok(/const canEditarAbono = user\?\.rol === 'ADMIN'/.test(page))
  assert.ok(/canEditarAbono && pago\.PAGO_ID/.test(page))
})
