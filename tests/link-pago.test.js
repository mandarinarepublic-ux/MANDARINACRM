// Link de pago (Payphone) desde el CRM: lo que se puede romper sin red.
import test from 'node:test'
import assert from 'node:assert'
import {
  normalizarCelular, validarValor, formatoValor, urlWhatsApp, tiendasLinkPago,
  linksPorRevisar, TIENDAS_LINK,
} from '../lib/linkPago.js'
import {
  desglosarIva, idTransaccion, telefonoDeId, cuerpoLink, leerRespuestaLink, estadoDeConsulta,
} from '../lib/payphone.js'

// ── celular ──────────────────────────────────────────────────────────────────
test('celular de Ecuador en todas las formas que escribe un vendedor', () => {
  for (const c of ['0987654321', '987654321', '098 765 4321', '+593 98 765 4321', '593987654321', '0987-654-321']) {
    assert.strictEqual(normalizarCelular(c), '593987654321', c)
  }
})

test('celular inválido no pasa', () => {
  for (const c of ['', 'abc', '022345678', '09876543', '12345', '5930987654321']) {
    assert.strictEqual(normalizarCelular(c), null, c)
  }
})

test('número de afuera solo con su código de país', () => {
  assert.strictEqual(normalizarCelular('+1 415 555 0123'), '14155550123')
  assert.strictEqual(normalizarCelular('0014155550123'), '14155550123')
  assert.strictEqual(normalizarCelular('4155550123'), null)
})

// ── valor ────────────────────────────────────────────────────────────────────
test('valor: punto o coma, redondeado a centavos', () => {
  assert.strictEqual(validarValor('35'), 35)
  assert.strictEqual(validarValor('35,5'), 35.5)
  assert.strictEqual(validarValor(' 12.345 '), 12.35)
  for (const malo of ['', '0', '-5', 'abc', '20000', null]) assert.strictEqual(validarValor(malo), null, String(malo))
})

test('formatoValor se lee como precio', () => {
  assert.strictEqual(formatoValor(35), '35')
  assert.strictEqual(formatoValor(35.5), '35.50')
})

// ── WhatsApp ─────────────────────────────────────────────────────────────────
test('wa.me con el texto codificado (saltos de línea y emojis incluidos)', () => {
  const texto = TIENDAS_LINK.MANDARINA.mensaje('35', 'https://ppls.me/abc')
  const url = urlWhatsApp('593987654321', texto)
  assert.ok(url.startsWith('https://wa.me/593987654321?text='))
  assert.strictEqual(decodeURIComponent(url.split('?text=')[1]), texto)
  assert.ok(!url.includes('\n') && !url.includes(' '))
})

test('cada tienda habla con su voz', () => {
  assert.match(TIENDAS_LINK.MANDARINA.mensaje('35', 'L'), /Mandarina Republic/)
  assert.match(TIENDAS_LINK.INDSTORE.mensaje('35', 'L'), /IND STORE/)
  assert.doesNotMatch(TIENDAS_LINK.INDSTORE.mensaje('35', 'L'), /Mandarina/)
})

// ── tiendas ──────────────────────────────────────────────────────────────────
test('ADMIN cobra con las dos; un vendedor con las suyas', () => {
  assert.deepStrictEqual(tiendasLinkPago({ ROL: 'ADMIN', TIENDAS: '' }), ['MANDARINA', 'INDSTORE'])
  assert.deepStrictEqual(tiendasLinkPago({ ROL: 'VENDEDOR', TIENDAS: 'INDSTORE' }), ['INDSTORE'])
  assert.deepStrictEqual(tiendasLinkPago({ ROL: 'VENDEDOR', TIENDAS: 'INDSTORE,MANDARINA' }), ['MANDARINA', 'INDSTORE'])
  assert.deepStrictEqual(tiendasLinkPago({ rol: 'VENDEDOR', tiendas: ['mandarina'] }), ['MANDARINA'])
})

test('sin ninguna de las dos (solo YAW) cobra con Mandarina, no se queda sin poder cobrar', () => {
  assert.deepStrictEqual(tiendasLinkPago({ ROL: 'VENDEDOR_YAW', TIENDAS: 'YAW' }), ['MANDARINA'])
})

// ── Payphone ─────────────────────────────────────────────────────────────────
test('IVA incluido: la suma cuadra al centavo', () => {
  assert.deepStrictEqual(desglosarIva(35), { amount: 3500, amountWithTax: 3043, tax: 457 })
  for (const t of [0.01, 1, 12.5, 99.99, 1234.56]) {
    const d = desglosarIva(t)
    assert.strictEqual(d.amountWithTax + d.tax, d.amount)
  }
})

test('el celular viaja en el id de Payphone (≤ 15) igual que en los inbox', () => {
  const id = idTransaccion('593987654321')
  assert.ok(id.length <= 15)
  assert.strictEqual(telefonoDeId(id), '593987654321')
})

test('cuerpo del link: tienda, referencia y suma exacta', () => {
  const b = cuerpoLink({ monto: 35, telefono: '593987654321', storeId: 's1', reference: 'Pago IND STORE', rnd: () => 0 })
  assert.strictEqual(b.storeId, 's1')
  assert.strictEqual(b.reference, 'Pago IND STORE')
  assert.strictEqual(b.amount, b.amountWithoutTax + b.amountWithTax + b.tax + b.service + b.tip)
  assert.strictEqual(b.expireIn, 48)
  assert.strictEqual(b.oneTime, true)
})

test('respuesta de Payphone: link o nada', () => {
  assert.strictEqual(leerRespuestaLink('"https://ppls.me/abc"'), 'https://ppls.me/abc')
  assert.strictEqual(leerRespuestaLink('{"message":"Validaciones fallidas"}'), null)
})

test('estado: manda el APROBADO aunque antes hubo un rechazo', () => {
  const r = estadoDeConsulta([
    { statusCode: 2, transactionStatus: 'Canceled', transactionId: 1 },
    { statusCode: 3, transactionStatus: 'Approved', transactionId: 2, cardBrand: 'Visa Pichincha' },
  ])
  assert.deepStrictEqual(r.estado, 'PAGADO')
  assert.strictEqual(r.transactionId, '2')
  assert.strictEqual(r.tarjeta, 'Visa Pichincha')
})

test('estado: rechazado, pendiente y respuestas vacías', () => {
  assert.strictEqual(estadoDeConsulta({ statusCode: 2 }).estado, 'RECHAZADO')
  assert.strictEqual(estadoDeConsulta({ statusCode: 1 }).estado, 'PENDIENTE')
  assert.strictEqual(estadoDeConsulta(null).estado, 'PENDIENTE')
  assert.strictEqual(estadoDeConsulta([]).estado, 'PENDIENTE')
})

// ── qué se le vuelve a preguntar a Payphone ─────────────────────────────────
test('solo se revisan los que pueden cambiar, recientes y no revisados hace un minuto', () => {
  const ahora = Date.parse('2026-11-10T20:00:00Z')
  const hace = (min) => new Date(ahora - min * 60000).toISOString()
  const links = [
    { id: 1, estado: 'PENDIENTE', creado_en: hace(10), revisado_en: null },        // sí
    { id: 2, estado: 'PAGADO',    creado_en: hace(10), revisado_en: null },        // no: ya pagado
    { id: 3, estado: 'PENDIENTE', creado_en: hace(60 * 24 * 8), revisado_en: null }, // no: más de 7 días
    { id: 4, estado: 'PENDIENTE', creado_en: hace(30), revisado_en: hace(0.5) },   // no: revisado hace 30 s
    { id: 5, estado: 'RECHAZADO', creado_en: hace(30), revisado_en: hace(5) },     // sí: puede pagar después
  ]
  assert.deepStrictEqual(linksPorRevisar(links, ahora).map((l) => l.id), [1, 5])
})

test('tope de 10 consultas por vez (Payphone permite 30 por minuto)', () => {
  const ahora = Date.now()
  const muchos = Array.from({ length: 25 }, (_, i) => ({ id: i, estado: 'PENDIENTE', creado_en: new Date(ahora).toISOString() }))
  assert.strictEqual(linksPorRevisar(muchos, ahora).length, 10)
})
