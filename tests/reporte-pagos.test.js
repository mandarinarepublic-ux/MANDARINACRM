import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoDlocal, filaDesdeDlocal, camposParaActualizar, estimarPayphone,
  rangoEcuador, hoyEcuador, filtrar, resumen, celularDeOrderDlocal, tiendaDeDescripcion,
} from '../lib/reportePagos.js'

const pagoDlocal = {
  id: 'DP-123', amount: 35, balance_amount: 31.88, balance_fee: 3.12, balance_currency: 'USD',
  created_date: '2026-11-09T15:00:00.000+0000', approved_date: '2026-11-09T15:10:00.000+0000',
  status: 'PAID', order_id: '593987654321-1762700000000', redirect_url: 'https://checkout.dlocalgo.com/validate/x',
  description: 'Pago IND STORE', payer: { first_name: 'Ana', last_name: 'Pérez' }, card: { issuer: 'PICHINCHA' },
}

test('estados de dLocal: lo desconocido nunca es pagado', () => {
  assert.equal(estadoDlocal('PAID'), 'PAGADO')
  assert.equal(estadoDlocal('EXPIRED'), 'EXPIRADO')
  assert.equal(estadoDlocal('REJECTED'), 'RECHAZADO')
  assert.equal(estadoDlocal('CANCELLED'), 'RECHAZADO')
  assert.equal(estadoDlocal('PENDING'), 'PENDIENTE')
  assert.equal(estadoDlocal('ALGO_NUEVO'), 'PENDIENTE')
  assert.equal(estadoDlocal(undefined), 'PENDIENTE')
})

test('pago dLocal pagado → fila con comisión y neto REALES', () => {
  const f = filaDesdeDlocal(pagoDlocal)
  assert.equal(f.proveedor, 'DLOCAL')
  assert.equal(f.client_tx_id, '593987654321-1762700000000')
  assert.equal(f.externo_id, 'DP-123')
  assert.equal(f.celular, '593987654321')
  assert.equal(f.tienda, 'INDSTORE')
  assert.equal(f.estado, 'PAGADO')
  assert.equal(f.comision, 3.12)
  assert.equal(f.neto, 31.88)
  assert.equal(f.comision_estimada, false)
  assert.equal(f.pagador, 'Ana Pérez')
  assert.equal(f.tarjeta, 'PICHINCHA')
})

test('pago dLocal sin pagar no trae comisión ni fecha de pago', () => {
  const f = filaDesdeDlocal({ ...pagoDlocal, status: 'EXPIRED' })
  assert.equal(f.estado, 'EXPIRADO')
  assert.equal(f.comision, null)
  assert.equal(f.neto, null)
  assert.equal(f.pagado_en, null)
})

test('order_id que no es del inbox no inventa celular', () => {
  assert.equal(celularDeOrderDlocal('#1191'), '')
  assert.equal(celularDeOrderDlocal('593987654321-1762700000000'), '593987654321')
  assert.equal(tiendaDeDescripcion('Pago Mandarina Republic'), 'MANDARINA')
  assert.equal(tiendaDeDescripcion(''), null)
})

test('actualizar NO pisa vendedor/origen ni una tienda ya puesta', () => {
  const existente = { estado: 'PENDIENTE', tienda: 'MANDARINA', vendedor_id: '7', origen: 'INBOX_MANDI', celular: '593987654321', link: 'x' }
  const patch = camposParaActualizar(existente, filaDesdeDlocal(pagoDlocal))
  assert.equal(patch.estado, 'PAGADO')
  assert.equal(patch.comision, 3.12)
  assert.equal('tienda' in patch, false)
  assert.equal('vendedor_id' in patch, false)
  assert.equal('origen' in patch, false)
})

test('actualizar sin cambios devuelve null (no escribe de gusto)', () => {
  const nueva = filaDesdeDlocal(pagoDlocal)
  assert.equal(camposParaActualizar({ ...nueva, comision: '3.12', neto: '31.88' }, nueva), null)
})

test('Payphone: comisión estimada al 5,75 %', () => {
  assert.deepEqual(estimarPayphone(1), { comision: 0.06, neto: 0.94 })
  assert.deepEqual(estimarPayphone(35), { comision: 2.01, neto: 32.99 })
  assert.deepEqual(estimarPayphone(null), { comision: null, neto: null })
})

test('rango de fechas en hora de Ecuador', () => {
  assert.deepEqual(rangoEcuador('2026-11-01', '2026-11-13'), {
    desde: '2026-11-01T05:00:00.000Z', hasta: '2026-11-14T05:00:00.000Z',
  })
  assert.equal(rangoEcuador('2026-11-13', '2026-11-01'), null)
  assert.equal(rangoEcuador('ayer', '2026-11-01'), null)
  // 23:30 del 12-nov en Quito = 04:30Z del 13: sigue siendo 12
  assert.equal(hoyEcuador(Date.parse('2026-11-13T04:30:00Z')), '2026-11-12')
})

const filas = [
  { proveedor: 'PAYPHONE', tienda: 'MANDARINA', vendedor_id: '1', estado: 'PAGADO', valor: 35, comision: 2.01, neto: 32.99, comision_estimada: true },
  { proveedor: 'PAYPHONE', tienda: 'MANDARINA', vendedor_id: '1', estado: 'PENDIENTE', valor: 20 },
  { proveedor: 'DLOCAL', tienda: 'INDSTORE', vendedor_id: null, estado: 'PAGADO', valor: 40, comision: 3.56, neto: 36.44 },
  { proveedor: 'DLOCAL', tienda: null, vendedor_id: null, estado: 'EXPIRADO', valor: 10 },
]

test('balance: cobrado, comisión, neto y % pagado', () => {
  const r = resumen(filas, { 1: 'JACKELINE' })
  assert.equal(r.total.links, 4)
  assert.equal(r.total.pagados, 2)
  assert.equal(r.total.generado, 105)
  assert.equal(r.total.cobrado, 75)
  assert.equal(r.total.comision, 5.57)
  assert.equal(r.total.neto, 69.43)
  assert.equal(r.total.pendientes, 1)
  assert.equal(r.total.monto_pendiente, 20)
  assert.equal(r.total.expirados, 1)
  assert.equal(r.total.tasa_pago, 50)
  assert.equal(r.total.comision_estimada, true)
  const pp = r.proveedor.find((x) => x.clave === 'PAYPHONE')
  assert.equal(pp.cobrado, 35)
  assert.equal(r.vendedor.find((x) => x.clave === '1').nombre, 'JACKELINE')
  assert.ok(r.tienda.find((x) => x.clave === 'SIN_TIENDA'))
})

test('filtros de lista', () => {
  assert.equal(filtrar(filas, { proveedor: 'DLOCAL' }).length, 2)
  assert.equal(filtrar(filas, { tienda: 'SIN_TIENDA' }).length, 1)
  assert.equal(filtrar(filas, { vendedor: 'SIN_VENDEDOR' }).length, 2)
  assert.equal(filtrar(filas, { vendedor: '1', estado: 'PAGADO' }).length, 1)
})

import { estadoEfectivo } from '../lib/reportePagos.js'

test('Payphone pendiente más de 48 h cuenta como vencido; dLocal no se toca', () => {
  const ahora = Date.parse('2026-11-13T12:00:00Z')
  assert.equal(estadoEfectivo({ proveedor: 'PAYPHONE', estado: 'PENDIENTE', creado_en: '2026-11-11T11:00:00Z' }, ahora), 'EXPIRADO')
  assert.equal(estadoEfectivo({ proveedor: 'PAYPHONE', estado: 'PENDIENTE', creado_en: '2026-11-12T11:00:00Z' }, ahora), 'PENDIENTE')
  assert.equal(estadoEfectivo({ proveedor: 'PAYPHONE', estado: 'PAGADO', creado_en: '2026-11-01T11:00:00Z' }, ahora), 'PAGADO')
  assert.equal(estadoEfectivo({ proveedor: 'DLOCAL', estado: 'PENDIENTE', creado_en: '2026-11-01T11:00:00Z' }, ahora), 'PENDIENTE')
})

import { linksPorRevisar } from '../lib/linkPago.js'

test('a Payphone no se le pregunta por links de dLocal', () => {
  const ahora = Date.parse('2026-11-13T12:00:00Z')
  const base = { estado: 'EXPIRADO', creado_en: '2026-11-12T12:00:00Z' }
  const r = linksPorRevisar([
    { id: 1, proveedor: 'DLOCAL', ...base },
    { id: 2, proveedor: 'PAYPHONE', ...base },
    { id: 3, ...base },
  ], ahora)
  assert.deepEqual(r.map((l) => l.id), [2, 3])
})

import { filaDesdeVentaPayphone, idsDeLotePayphone, normalizarTransaccion, celularDeClientTx } from '../lib/reportePagos.js'
import { idTransaccion } from '../lib/payphone.js'

test('venta Payphone aprobada → fila en dólares (amount viene en centavos)', () => {
  const clientTx = idTransaccion('593987654321', () => 0.5)
  const f = filaDesdeVentaPayphone({
    amount: 3500, statusCode: 3, transactionStatus: 'Approved', clientTransactionId: clientTx,
    transactionId: 93507187, cardBrand: 'Visa Produbanco', storeName: 'Ind Store', date: '2026-11-10T22:06:00',
  })
  assert.equal(f.valor, 35)
  assert.equal(f.estado, 'PAGADO')
  assert.equal(f.tienda, 'INDSTORE')
  assert.equal(f.celular, '593987654321')
  assert.equal(f.transaction_id, '93507187')
  assert.equal(f.comision, 2.01)
  assert.equal(f.comision_estimada, true)
})

test('venta Payphone rechazada no tiene comisión; sin clientTx no sirve', () => {
  const f = filaDesdeVentaPayphone({ amount: 100, statusCode: 2, clientTransactionId: 'x123', storeName: 'Mandarina Republic' })
  assert.equal(f.estado, 'RECHAZADO')
  assert.equal(f.comision, null)
  assert.equal(f.tienda, 'MANDARINA')
  assert.equal(filaDesdeVentaPayphone({ amount: 100, statusCode: 3 }), null)
  assert.equal(celularDeClientTx('x123'), '')
})

test('consulta por lotes: solo los # de transacción, sin repetir', () => {
  assert.deepEqual(idsDeLotePayphone([{ idTransaction: 1 }, { idTransaction: 1 }, { idTransaction: 2 }, {}]), ['1', '2'])
  assert.deepEqual(idsDeLotePayphone(null), [])
  assert.equal(normalizarTransaccion('#93 507 187'), '93507187')
  assert.equal(normalizarTransaccion('abc'), null)
})
