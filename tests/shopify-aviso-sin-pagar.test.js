import test from 'node:test'
import assert from 'node:assert'
import { textoPedidoWebSinPagar, textoPedidoWebFallido } from '../lib/telegram.js'

test('el aviso trae lo necesario para perseguir la venta', () => {
  const t = textoPedidoWebSinPagar({
    tiendaId: 'MANDARINA', nombre: 'Justin Vinces', celular: '0986413373',
    monto: 35, prendas: 1, urlShopify: 'https://admin.shopify.com/…/orders/123',
  })
  for (const esperado of ['Justin Vinces', '0986413373', '35.00', 'admin.shopify.com']) {
    assert.ok(t.includes(esperado), `falta ${esperado} en el aviso`)
  }
  assert.ok(/sin pagar|no pag/i.test(t), 'tiene que decir que NO está pagado')
})

test('☠️ si el pedido no pudo entrar, el aviso dice por qué', () => {
  const t = textoPedidoWebFallido({ tiendaId: 'MANDARINA', orderName: '#1184', motivo: '401 No autenticado' })
  assert.ok(t.includes('#1184'))
  assert.ok(t.includes('401'), 'sin el motivo nadie sabe qué arreglar')
})
