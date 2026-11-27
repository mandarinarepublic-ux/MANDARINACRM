// Ajustes del 27-nov-2026: pedidos desde el buscador del menú, buscador y datos
// del pagador en el reporte de pagos, y el botón «Consultar» de Servientrega.
import test from 'node:test'
import assert from 'node:assert/strict'
import { pareceBusquedaDePedido } from '../lib/menu.js'
import { urlRastreoGuia } from '../lib/rastreoGuia.js'
import {
  coincideBusqueda, palabrasBusqueda, detallePayphone, detalleDlocal, filaDesdeVentaPayphone, camposParaActualizar,
} from '../lib/reportePagos.js'

test('menú: números de pedido sí, palabras del menú no', () => {
  for (const t of ['6738', 'IND-XAV-6738', 'man-and-5599', 'ind-', '0998165125', '099 816 5125', '9037827902'])
    assert.equal(pareceBusquedaDePedido(t), true, t)
  for (const t of ['', 'caja', 'pagos', '673', 'pedido 6738', 'x-6738'])
    assert.equal(pareceBusquedaDePedido(t), false, t)
})

test('Servientrega: solo guías de dígitos y de Servientrega', () => {
  assert.equal(urlRastreoGuia('9037827902', 'SERVIENTREGA'), 'https://www.servientrega.com.ec/Tracking/Index/?guia=9037827902')
  assert.equal(urlRastreoGuia(' 9037 827 902 ', ''), 'https://www.servientrega.com.ec/Tracking/Index/?guia=9037827902')
  assert.equal(urlRastreoGuia('9037827902', 'servientrega'), 'https://www.servientrega.com.ec/Tracking/Index/?guia=9037827902')
  assert.equal(urlRastreoGuia('QUITO', 'RETIRO_TIENDA'), null)
  assert.equal(urlRastreoGuia('9037827902', 'RETIRO_TIENDA'), null)
  assert.equal(urlRastreoGuia('IBARRACLV', 'SERVIENTREGA'), null)
  assert.equal(urlRastreoGuia('', 'SERVIENTREGA'), null)
  assert.equal(urlRastreoGuia('123', 'SERVIENTREGA'), null)
})

// El caso real del 11-nov: 099 816 5125, $198,50, Mastercard Pichincha.
const fila = {
  celular: '593998165125', valor: '198.50', tarjeta: 'Mastercard Pichincha', transaction_id: '93529002',
  pagador: 'jericoh36@hotmail.com', pagador_email: 'jericoh36@hotmail.com', cliente_nombre: 'MJAM 😎',
  pagador_documento: '1712345678', tarjeta_ultimos: '4321', tienda: 'INDSTORE',
}

test('buscador del reporte: celular escrito como sea', () => {
  for (const q of ['099 816 5125', '0998165125', '593998165125', '+593 99 816 5125', '998165125'])
    assert.equal(coincideBusqueda(fila, q), true, q)
  assert.equal(coincideBusqueda(fila, '0991111111'), false)
  assert.deepEqual(palabrasBusqueda('099 816 5125 Pichincha'), ['0998165125', 'pichincha'])
})

test('buscador del reporte: nombre, email, cédula, últimos 4, valor, transacción', () => {
  for (const q of ['mjam', 'JERICOH', '1712345678', '4321', '198,50', '198.50', '93529002', 'pichincha 198', 'master'])
    assert.equal(coincideBusqueda(fila, q), true, q)
  assert.equal(coincideBusqueda(fila, 'oliver'), false)
  assert.equal(coincideBusqueda(fila, ''), true)
})

test('buscador: un número no se arma juntando dígitos de dos campos', () => {
  // 4321 (últimos 4) + 93529002 (transacción) no deben dar «432193529»
  assert.equal(coincideBusqueda(fila, '432193529'), false)
})

const ventaPayphone = {
  email: 'jericoh36@hotmail.com', cardType: 'Credit', bin: '512345', lastDigits: '4321', cardBrand: 'Mastercard Pichincha',
  amount: 19850, clientTransactionId: '7kvn65j9-xzawq6', phoneNumber: '593998165125', statusCode: 3,
  transactionStatus: 'Approved', authorizationCode: 'W12345', transactionId: 93529002, document: '1712345678',
  optionalParameter4: 'JERICO H', storeName: 'Ind Store', date: '2026-11-11T10:18:00',
}

test('Payphone: se guardan todos los datos del pagador y la respuesta entera', () => {
  const d = detallePayphone(ventaPayphone)
  assert.equal(d.pagador_email, 'jericoh36@hotmail.com')
  assert.equal(d.pagador_telefono, '593998165125')
  assert.equal(d.pagador_documento, '1712345678')
  assert.equal(d.tarjeta_ultimos, '4321')
  assert.equal(d.tarjeta_tipo, 'Credit')
  assert.equal(d.autorizacion, 'W12345')
  assert.equal(d.pagador_nombre, 'JERICO H')
  assert.equal(d.datos_pasarela, ventaPayphone)
  const f = filaDesdeVentaPayphone(ventaPayphone)
  assert.equal(f.pagador_documento, '1712345678')
  assert.equal(f.valor, 198.5)
  assert.deepEqual(detallePayphone(null), {})
})

test('dLocal: nombre, email y documento del pagador', () => {
  const d = detalleDlocal({ payer: { first_name: 'Ana', last_name: 'Pérez', email: 'a@x.com', document: '0102030405' }, card: { last4: '1111' } })
  assert.equal(d.pagador_nombre, 'Ana Pérez')
  assert.equal(d.pagador_documento, '0102030405')
  assert.equal(d.tarjeta_ultimos, '1111')
})

test('actualizar: la respuesta cruda se compara como JSON, y lo vacío no pisa', () => {
  const existente = { estado: 'PAGADO', datos_pasarela: { a: 1 }, pagador_documento: '1712345678' }
  assert.equal(camposParaActualizar(existente, { datos_pasarela: { a: 1 } }), null)
  assert.deepEqual(camposParaActualizar(existente, { datos_pasarela: { a: 2 } }), { datos_pasarela: { a: 2 } })
  assert.equal(camposParaActualizar(existente, { pagador_documento: null }), null)
  assert.deepEqual(camposParaActualizar({ estado: 'PAGADO' }, { pagador_documento: '1712345678' }), { pagador_documento: '1712345678' })
})
