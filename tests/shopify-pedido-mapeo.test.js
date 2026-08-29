import test from 'node:test'
import assert from 'node:assert'
import { normalizarCelular, identificacionPendiente, tallaYColor, estaPagado, mapearPedido } from '../lib/shopifyPedido.js'

test('el celular queda en 10 dígitos venga como venga', () => {
  for (const entrada of ['+593960643698', '0960643698', '+593 96 064 3698', '593960643698']) {
    assert.strictEqual(normalizarCelular(entrada), '0960643698', `falló con ${entrada}`)
  }
})

test('sin teléfono devuelve vacío, no basura', () => {
  assert.strictEqual(normalizarCelular(null), '')
  assert.strictEqual(normalizarCelular(''), '')
})

test('☠️ la identificación lleva GUION MEDIO: el guion bajo no pasa la validación', () => {
  const id = identificacionPendiente('0960643698')
  assert.strictEqual(id, 'PENDIENTE-0960643698')
  assert.ok(/^[A-Za-z0-9-]{3,20}$/.test(id), 'tiene que pasar validarIdentificacion de PASAPORTE')
  assert.ok(!id.includes('_'), 'un guion bajo lo reprueba el formulario de edición')
})

test('☠️ con nombres de opción se usan los NOMBRES, nunca la posición', () => {
  const a = tallaYColor('M / Naranja', [{ name: 'Talla' }, { name: 'Color' }])
  const b = tallaYColor('Naranja / M', [{ name: 'Color' }, { name: 'Talla' }])
  assert.deepStrictEqual(a, { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(b, { talla: 'M', color: 'Naranja' }, 'el catálogo tiene productos en los dos órdenes')
})

test('☠️ EL WEBHOOK NO MANDA LOS NOMBRES: sin ellos se reconoce la talla por su forma', () => {
  // Un line_item de webhook trae `variant_title` y nada más. Si esto se
  // resolviera por posición, la mitad del catálogo saldría con el color en
  // la talla y viceversa.
  assert.deepStrictEqual(tallaYColor('M / Naranja', []), { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(tallaYColor('Naranja / M', []), { talla: 'M', color: 'Naranja' })
  assert.deepStrictEqual(tallaYColor('2XL / Negro', []), { talla: '2XL', color: 'Negro' })
})

test('una sola opción cae a talla', () => {
  assert.deepStrictEqual(tallaYColor('XL', []), { talla: 'XL', color: '' })
  assert.deepStrictEqual(tallaYColor('Default Title', []), { talla: '', color: '' })
})

const PEDIDO = {
  id: 7538787221597,
  name: '#1184',
  financial_status: 'paid',
  shipping_address: { name: 'Jonathan Ríos', phone: '0980446364', address1: 'Machachi', city: 'Machachi' },
  customer: { phone: null, email: 'jr@ejemplo.com' },
  line_items: [{
    title: 'Camiseta Spider-Man', variant_title: 'M / Rojo', quantity: 2,
    price: '26.00', variant_id: 111, product_id: 222,
  }],
}

test('solo `paid` cuenta como pagado', () => {
  assert.ok(estaPagado(PEDIDO))
  for (const e of ['pending', 'voided', 'refunded', 'partially_paid', null]) {
    assert.ok(!estaPagado({ ...PEDIDO, financial_status: e }), `${e} NO es pagado`)
  }
})

test('el payload sale listo para /api/pedidos', () => {
  const p = mapearPedido(PEDIDO, 'MANDARINA', { 111: 'https://cdn/foto.jpg' })
  assert.strictEqual(p.tiendaId, 'MANDARINA')
  assert.strictEqual(p.cliente.cedula, 'PENDIENTE-0980446364')
  assert.strictEqual(p.cliente.nombre, 'Jonathan Ríos')
  assert.strictEqual(p.items[0].area, 'PRODUCTO SIN DISEÑO')
  assert.strictEqual(p.items[0].talla, 'M')
  assert.strictEqual(p.items[0].color, 'Rojo')
  assert.strictEqual(p.items[0].cantidad, 2)
  assert.strictEqual(p.items[0].precioUnit, 26)
  assert.strictEqual(p.items[0].imagenShopify, 'https://cdn/foto.jpg')
  assert.strictEqual(p.items[0].shopifyVariantId, '111')
  // pagado = abonado completo
  assert.strictEqual(p.pagos.reduce((s, x) => s + x.monto, 0), 52)
  assert.strictEqual(p.emitirFactura, false, 'estos pedidos NO se facturan en Dátil')
})

test('el teléfono sale del envío aunque el cliente no tenga', () => {
  const p = mapearPedido({ ...PEDIDO, customer: { phone: null } }, 'MANDARINA', {})
  assert.strictEqual(p.cliente.celular, '0980446364')
})
