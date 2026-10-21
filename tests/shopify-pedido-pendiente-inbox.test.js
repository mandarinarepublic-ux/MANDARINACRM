import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  textoAvisoPedidoWeb, telefonoInbox, nombrePasarela, idAvisoPedidoWeb,
  DIRECCION_INTERNO, CANAL_POR_DEFECTO,
} from '../lib/pedidoWebPendiente.js'
import { textoPedidoWebPagadoDespues } from '../lib/telegram.js'

// Forma real del #1191 (20-oct-2026), recortada.
const pedido1191 = {
  id: 18990873608285,
  name: '#1191',
  total_price: '35.00',
  payment_gateway_names: ['Bank Deposit'],
  shipping_address: { name: 'Kevin Guzhñay Peralta', phone: '0991552710', city: 'Cuenca', province: 'Azuay' },
  line_items: [{ title: 'Chaqueta de Ben 10', variant_title: 'L', quantity: 1, price: '35.00' }],
}

test('el aviso trae pedido, prenda con talla, total, pago y la orden de comunicarse', () => {
  const t = textoAvisoPedidoWeb(pedido1191)
  for (const esperado of ['#1191', 'PAGO PENDIENTE', 'Chaqueta de Ben 10 · L · x1', '$35.00', 'Depósito', 'Cuenca']) {
    assert.ok(t.includes(esperado), `falta «${esperado}» en:\n${t}`)
  }
  assert.ok(t.includes('Comunícate con el cliente: realizó una compra pero tiene pendiente el pago.'))
  assert.ok(/Pedido manual/.test(t), 'tiene que decir que se carga a mano')
})

test('el subtotal de cada línea multiplica por la cantidad', () => {
  const t = textoAvisoPedidoWeb({
    ...pedido1191,
    line_items: [{ title: 'Camiseta', variant_title: 'M / Negro', quantity: 3, price: '12.50' }],
  })
  assert.ok(t.includes('Camiseta · M · Negro · x3 — $37.50'), t)
})

test('una pasarela desconocida pasa tal cual, nunca en blanco', () => {
  assert.strictEqual(nombrePasarela({ payment_gateway_names: ['PayPhone'] }), 'PayPhone')
  assert.strictEqual(nombrePasarela({}), 'Sin indicar')
  assert.match(nombrePasarela({ payment_gateway_names: ['Dlocal Go Offline Payments'] }), /efectivo/)
})

test('el teléfono queda como lo guarda el inbox (593…), o vacío', () => {
  assert.strictEqual(telefonoInbox('0991552710'), '593991552710')
  assert.strictEqual(telefonoInbox('593991552710'), '593991552710')
  assert.strictEqual(telefonoInbox(''), '')
  assert.strictEqual(telefonoInbox('12345'), '')
})

test('☠️ el aviso NO es ENTRANTE: abriría una ventana de 24 h falsa', () => {
  assert.notStrictEqual(DIRECCION_INTERNO, 'ENTRANTE')
  assert.notStrictEqual(DIRECCION_INTERNO, 'SALIENTE')
})

test('el id del aviso es estable por pedido (un reintento no lo duplica)', () => {
  assert.strictEqual(idAvisoPedidoWeb('123'), idAvisoPedidoWeb('123'))
  assert.notStrictEqual(idAvisoPedidoWeb('123'), idAvisoPedidoWeb('124'))
})

test('cada inbox tiene su número principal por defecto', () => {
  assert.strictEqual(CANAL_POR_DEFECTO.MANDI, '1024077200794372')
  assert.strictEqual(CANAL_POR_DEFECTO.IND, '1153686904504422')
})

test('el Telegram del pago posterior dice que NO entró solo', () => {
  const t = textoPedidoWebPagadoDespues({ tiendaId: 'MANDARINA', orderName: '#1191', cliente: 'Kevin', monto: 35 })
  assert.ok(t.includes('#1191') && t.includes('35.00'))
  assert.ok(/NO entró solo/.test(t))
})

const ruta = readFileSync(new URL('../app/api/shopify/pedidos/route.js', import.meta.url), 'utf8')

test('☠️ orders/paid revisa la marca de "nació sin pagar" ANTES de crear el pedido', () => {
  const marca = ruta.indexOf("from('shopify_sin_pagar')\n      .select")
  const crea = ruta.indexOf('/api/pedidos`')
  assert.ok(marca > 0, 'falta la consulta de la marca en orders/paid')
  assert.ok(marca < crea, 'la marca tiene que mirarse antes de llamar a /api/pedidos')
})

test('orders/create sin pagar guarda la marca ANTES del aviso al inbox', () => {
  const marca = ruta.indexOf("from('shopify_sin_pagar').upsert")
  const aviso = ruta.indexOf('await avisarPedidoEnInbox')
  assert.ok(marca > 0 && aviso > 0 && marca < aviso)
})
