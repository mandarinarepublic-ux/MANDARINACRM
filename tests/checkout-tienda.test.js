// Pago con tarjeta dentro de la tienda: lo que se puede romper sin red.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  leerCarrito, nuevoIdCheckout, ctxDeIntento, idDeCtx, celularEC, cedulaEC, validarDatos,
  inputBorrador, resumenCalculo, montosPayphone, esAbandonado, textoAbandono, idAvisoAbandono,
} from '../lib/checkoutTienda.js'
import { ORIGENES_TIENDA } from '../lib/origenes.js'

// ── carrito ──────────────────────────────────────────────────────────────────
test('carrito: variantes y cantidades, nada más', () => {
  assert.deepStrictEqual(leerCarrito('43372760334429:1,43697080008797:2'), [
    { variantId: '43372760334429', cantidad: 1 }, { variantId: '43697080008797', cantidad: 2 },
  ])
})

test('carrito: basura, ceros y precios colados se ignoran; repetidas se suman', () => {
  assert.deepStrictEqual(leerCarrito('abc,123:1,43372760334429:0,43372760334429:2,43372760334429:3,99999:1:25.00'), [
    { variantId: '43372760334429', cantidad: 5 },
  ])
  assert.deepStrictEqual(leerCarrito(''), [])
  assert.deepStrictEqual(leerCarrito(null), [])
})

test('carrito: tope de cantidad por línea', () => {
  assert.strictEqual(leerCarrito('43372760334429:999').length, 0)
  assert.strictEqual(leerCarrito('43372760334429:50,43372760334429:50')[0].cantidad, 50)
})

// ── ids ──────────────────────────────────────────────────────────────────────
test('el clientTransactionId lleva la compra y cambia en cada intento', () => {
  const id = nuevoIdCheckout()
  assert.match(id, /^[0-9a-z]{20}$/)
  assert.ok(ctxDeIntento(id, 9999).length <= 50) // límite de Payphone
  assert.strictEqual(new Set(Array.from({ length: 2000 }, nuevoIdCheckout)).size, 2000)
  assert.notStrictEqual(ctxDeIntento(id, 1), ctxDeIntento(id, 2))
  assert.strictEqual(idDeCtx(ctxDeIntento(id, 7)), id)
  for (const malo of ['', 'abc', 'CAJmwbn83or', 'abc1234567-1', `${id}`, `${id}-x`, null]) assert.strictEqual(idDeCtx(malo), null)
})

// ── datos del cliente ────────────────────────────────────────────────────────
test('celular y cédula de Ecuador', () => {
  assert.strictEqual(celularEC('098 765 4321'), '0987654321')
  assert.strictEqual(celularEC('+593987654321'), '0987654321')
  assert.strictEqual(celularEC('022345678'), null)
  assert.strictEqual(cedulaEC('1716608094'), '1716608094')
  assert.strictEqual(cedulaEC('1716608094001'), '1716608094001')
  assert.strictEqual(cedulaEC('12345'), null)
})

const BUENOS = {
  nombre: ' Ana ', apellido: 'Pérez', email: 'ANA@Correo.com', celular: '0987654321', cedula: '1716608094',
  direccion: 'Av. Amazonas N34-12', referencia: 'Casa blanca', ciudad: 'Quito', provincia: 'Pichincha', descuento: ' navidad ',
}

test('datos válidos: limpios y normalizados', () => {
  const v = validarDatos(BUENOS)
  assert.ok(v.ok)
  assert.strictEqual(v.datos.cliente.nombre, 'Ana')
  assert.strictEqual(v.datos.cliente.email, 'ana@correo.com')
  assert.strictEqual(v.datos.descuento, 'NAVIDAD')
})

test('datos incompletos: un error por campo', () => {
  const v = validarDatos({ ...BUENOS, email: 'malo', celular: '12', direccion: '' })
  assert.ok(!v.ok)
  assert.deepStrictEqual(Object.keys(v.errores).sort(), ['celular', 'direccion', 'email'])
})

// ── Shopify ──────────────────────────────────────────────────────────────────
test('borrador: variantes como gid, descuentos automáticos SIEMPRE, cédula y código', () => {
  const { datos } = validarDatos(BUENOS)
  const input = inputBorrador({ lineas: [{ variantId: '43372760334429', cantidad: 2 }], checkoutId: 'x', ...datos })
  assert.deepStrictEqual(input.lineItems, [{ variantId: 'gid://shopify/ProductVariant/43372760334429', quantity: 2 }])
  assert.strictEqual(input.acceptAutomaticDiscounts, true) // la preventa no se puede perder
  assert.deepStrictEqual(input.discountCodes, ['NAVIDAD'])
  assert.strictEqual(input.shippingAddress.countryCode, 'EC')
  assert.strictEqual(input.phone, '+593987654321')
  assert.ok(input.customAttributes.some((a) => a.key === 'Cédula' && a.value === '1716608094'))
  assert.ok(!('province' in input.shippingAddress)) // MailingAddressInput no lo tiene
  assert.ok(!input.shippingLine)
})

test('borrador con tarifa elegida', () => {
  const { datos } = validarDatos({ ...BUENOS, descuento: '' })
  const input = inputBorrador({ lineas: [{ variantId: '1', cantidad: 1 }], checkoutId: 'x', ...datos, envio: { handle: 'h1', title: 'Servientrega' } })
  assert.deepStrictEqual(input.shippingLine, { shippingRateHandle: 'h1', title: 'Servientrega' })
  assert.ok(!input.discountCodes)
})

const m = (x) => ({ shopMoney: { amount: String(x) } })

test('resumen (1.er cálculo, sin tarifa): suma el envío más barato', () => {
  const r = resumenCalculo({
    lineItems: [{ title: 'Camiseta', variantTitle: 'M', quantity: 1, discountedTotalSet: m(15) }],
    availableShippingRates: [{ handle: 'caro', title: 'Express', price: { amount: '9' } }, { handle: 'svt', title: 'Servientrega', price: { amount: '5' } }],
    subtotalPriceSet: m(15), totalDiscountsSet: m(0), totalTaxSet: m(0), totalPriceSet: m(15), discountCodes: [],
  })
  assert.strictEqual(r.envio.handle, 'svt')
  assert.strictEqual(r.total, 2000)
})

test('resumen (2.º cálculo, con tarifa): manda el total de Shopify', () => {
  const r = resumenCalculo({
    lineItems: [], shippingLine: { title: 'Servientrega' },
    availableShippingRates: [{ handle: 'svt', title: 'Servientrega', price: { amount: '5' } }],
    subtotalPriceSet: m(15), totalDiscountsSet: m(0), totalTaxSet: m(0), totalPriceSet: m(20), discountCodes: [],
  }, 'svt')
  assert.strictEqual(r.total, 2000)
})

test('resumen: preventa real ($30 → $25, envío gratis)', () => {
  const r = resumenCalculo({
    lineItems: [{ title: 'Ugly Sweaters Power Ranger - Red', quantity: 1, discountedTotalSet: m(25) }],
    availableShippingRates: [{ handle: 'g', title: 'GRATIS en compras $20 o más', price: { amount: '0.0' } }],
    subtotalPriceSet: m(25), totalDiscountsSet: m(5), totalTaxSet: m(0), totalPriceSet: m(25), discountCodes: [],
  })
  assert.strictEqual(r.total, 2500)
  assert.strictEqual(r.descuentos, 500)
  assert.strictEqual(r.envio.centavos, 0)
})

// ── Payphone ─────────────────────────────────────────────────────────────────
test('montos: suma exacta con IVA incluido en el precio', () => {
  for (const t of [100, 2500, 3500, 3999, 123456]) {
    const x = montosPayphone(t)
    assert.strictEqual(x.amount, t)
    assert.strictEqual(x.amountWithoutTax + x.amountWithTax + x.tax, t)
    assert.ok(x.amountWithoutTax >= 0)
  }
  assert.deepStrictEqual(montosPayphone(3500), { amount: 3500, amountWithoutTax: 0, amountWithTax: 3043, tax: 457 })
})

test('montos: si Shopify cobró IVA aparte, se usa ese', () => {
  const x = montosPayphone(4025, 525)
  assert.strictEqual(x.tax, 525)
  assert.strictEqual(x.amountWithoutTax + x.amountWithTax + x.tax, 4025)
})

test('montos: total inválido no abre la Cajita', () => {
  assert.strictEqual(montosPayphone(0), null)
  assert.strictEqual(montosPayphone(NaN), null)
})

// ── carrito abandonado ───────────────────────────────────────────────────────
test('abandono: con celular, cotizado o pagando, entre 30 min y 48 h, sin aviso previo', () => {
  const ahora = Date.parse('2026-11-11T20:00:00Z')
  const hace = (min) => new Date(ahora - min * 60000).toISOString()
  const base = { estado: 'COTIZADO', cliente: { celular: '0987654321' }, aviso_abandono_en: null }
  assert.ok(esAbandonado({ ...base, actualizado_en: hace(31) }, ahora))
  assert.ok(esAbandonado({ ...base, estado: 'PAGANDO', actualizado_en: hace(120) }, ahora))
  assert.ok(!esAbandonado({ ...base, actualizado_en: hace(10) }, ahora))              // muy pronto
  assert.ok(!esAbandonado({ ...base, actualizado_en: hace(60 * 49) }, ahora))         // muy viejo
  assert.ok(!esAbandonado({ ...base, estado: 'PAGADO', actualizado_en: hace(60) }, ahora))
  assert.ok(!esAbandonado({ ...base, estado: 'NUEVO', actualizado_en: hace(60) }, ahora)) // nunca dejó datos
  assert.ok(!esAbandonado({ ...base, cliente: {}, actualizado_en: hace(60) }, ahora))
  assert.ok(!esAbandonado({ ...base, aviso_abandono_en: hace(5), actualizado_en: hace(60) }, ahora))
})

test('aviso de abandono: productos, total y qué hacer', () => {
  const t = textoAbandono({
    total_centavos: 2500,
    cliente: { nombre: 'Ana', apellido: 'Pérez', email: 'ana@correo.com' },
    direccion: { ciudad: 'Quito', provincia: 'Pichincha' },
    calculo: { lineas: [{ titulo: 'Ugly Sweater', variante: 'M', cantidad: 1, centavos: 2500 }] },
  })
  assert.match(t, /CARRITO SIN PAGAR/)
  assert.match(t, /Ugly Sweater · M · x1 — \$25\.00/)
  assert.match(t, /Total: \$25\.00/)
  assert.match(t, /plantilla/)
  assert.strictEqual(idAvisoAbandono('abc'), 'carrito_abc')
})

// ── la tienda puede enmarcar /pagar (y solo eso además de /pedido) ───────────
test('CSP: /pagar y /pagar/respuesta aceptan la tienda', () => {
  const config = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8')
  for (const fuente of ["'/pagar'", "'/pagar/:path*'"]) {
    const bloque = config.match(new RegExp(`source:\\s*${fuente.replace(/[/*:]/g, '\\$&')}[\\s\\S]*?frame-ancestors([^"]*)"`))
    assert.ok(bloque, `falta la regla ${fuente}`)
    for (const o of ORIGENES_TIENDA) assert.ok(bloque[1].includes(o), `falta ${o} en ${fuente}`)
  }
  assert.ok(config.indexOf("source: '/pagar'") > config.indexOf("source: '/:path*'"))
})
