// Pasarela de pago en indlovers.com (INDSTORE, 12-nov-2026): lo que no puede
// volver a caer en MANDARINA. Skill: ~/.claude/skills/pasarela-tienda.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { tiendaPago, cuentaPorId, cuentasDe } from '../lib/cuentasBancarias.js'
import { payloadPedidoTransferencia, textoAvisoTransferencia } from '../lib/transferenciaTienda.js'
import { canalDeTienda, CANAL_POR_DEFECTO } from '../lib/pedidoWebPendiente.js'
import { textoAbandono } from '../lib/checkoutTienda.js'

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('tienda: lista cerrada; cualquier otra cosa es MANDARINA', () => {
  assert.strictEqual(tiendaPago('INDSTORE'), 'INDSTORE')
  assert.strictEqual(tiendaPago('indstore'), 'INDSTORE')
  assert.strictEqual(tiendaPago(''), 'MANDARINA')
  assert.strictEqual(tiendaPago('OTRA'), 'MANDARINA')
  assert.strictEqual(tiendaPago(undefined), 'MANDARINA')
})

test('cuentas: el mismo id es OTRA cuenta en cada tienda', () => {
  assert.strictEqual(cuentaPorId('pichincha', 'MANDARINA').numero, '2210996988')
  assert.strictEqual(cuentaPorId('pichincha', 'INDSTORE').numero, '2202684983')
  assert.strictEqual(cuentaPorId('pichincha', 'INDSTORE').titular, 'XAVIER FROILAN CASTILLO BARRETO')
  assert.strictEqual(cuentaPorId('guayaquil', 'INDSTORE'), null) // IND no tiene Guayaquil
  assert.strictEqual(cuentaPorId('pacifico', 'MANDARINA'), null)
  assert.strictEqual(cuentasDe('INDSTORE').length, 6)
})

test('☠️ Deuna de IND es SOLO QR: sin número (a mano sale "cuenta inválida")', () => {
  const d = cuentaPorId('deuna', 'INDSTORE')
  assert.strictEqual(d.numero, null)
  assert.strictEqual(d.qr, '/qr-deuna-ind.jpg')
  assert.match(d.aviso, /cuenta inválida/)
})

const compraInd = {
  id: 'abc', tienda: 'INDSTORE', banco: 'deuna', total_centavos: 2500,
  lineas: [{ variantId: '1', cantidad: 1 }],
  calculo: { lineas: [{ titulo: 'Camiseta', variante: 'M', cantidad: 1, centavos: 2500 }] },
  cliente: { nombre: 'Ana', cedula: '1700000000', celular: '0991234567' },
  direccion: { ciudad: 'Quito' },
}

test('☠️ una transferencia de IND crea pedido de IND (no MAN-WEB)', () => {
  assert.strictEqual(payloadPedidoTransferencia(compraInd, 'https://x/f.jpg').tiendaId, 'INDSTORE')
  assert.strictEqual(payloadPedidoTransferencia({ ...compraInd, tienda: undefined }, '').tiendaId, 'MANDARINA')
})

test('avisos del inbox de IND nombran la cuenta de IND (Deuna por QR)', () => {
  assert.match(textoAvisoTransferencia(compraInd, { pedidoId: 'IND-WEB-1' }), /Deuna \(QR\)/)
  const pich = textoAvisoTransferencia({ ...compraInd, banco: 'pichincha' }, {})
  assert.match(pich, /2202684983/)
  assert.match(textoAbandono({ ...compraInd, metodo: 'TRANSFERENCIA', banco: 'bolivariano' }), /Banco Bolivariano/)
})

test('☠️ canal del inbox según la tienda', () => {
  assert.strictEqual(canalDeTienda('INDSTORE'), CANAL_POR_DEFECTO.IND)
  assert.strictEqual(canalDeTienda('MANDARINA'), CANAL_POR_DEFECTO.MANDI)
  assert.strictEqual(canalDeTienda(undefined), CANAL_POR_DEFECTO.MANDI)
})

test('☠️ nada de la pasarela queda fijo en MANDARINA', () => {
  const cron = src('app/api/cron/carritos/route.js')
  assert.match(cron, /tiendaId: tiendaPago\(c\.tienda\)/)
  assert.match(cron, /canalPorDefecto: canalDeTienda\(c\.tienda\)/)
  const proc = src('lib/procesarTransferencia.js')
  assert.ok(!/tiendaId: 'MANDARINA'/.test(proc), 'procesarTransferencia no puede fijar MANDARINA')
  assert.ok(!/CANAL_POR_DEFECTO\.MANDI/.test(proc), 'procesarTransferencia no puede fijar el canal MANDI')
  const ruta = src('app/api/publico/pago/route.js')
  assert.ok(!/PAYPHONE_STORE_ID_MANDARINA/.test(ruta), 'el storeId de Payphone sale de la tienda de la compra')
  assert.match(ruta, /tienda: tiendaPago\(body\?\.tienda\)/)
  assert.match(ruta, /cuentaPorId\(body\?\.banco, c\.tienda\)/)
})

test('script de la tienda: IND con pago internacional, solo Ecuador y apagado hasta probar', () => {
  const js = src('public/pago-tienda.js')
  const ind = js.slice(js.indexOf('INDSTORE: {'), js.indexOf('},', js.indexOf('INDSTORE: {')))
  assert.match(ind, /internacional: true/)
  assert.match(ind, /soloEcuador: true/)
  assert.match(ind, /param: 'ind'/)
  // ☠️ país por IP (browsing_context_suggestions), NUNCA Shopify.country: en IND da 'US' estando en Ecuador
  assert.match(js, /browsing_context_suggestions\.json/)
  assert.ok(!/window\.Shopify\.country\s*(&&|\|\||!==|===|\))/.test(js.replace(/\/\/.*$/gm, '')), 'no decidir con Shopify.country')
  // la red de seguridad solo actúa si los botones están activos (fuera de Ecuador no intercepta nada)
  assert.match(js, /if \(!activo\) return/)
  // el internacional va por location, no por <a>: la red de seguridad no lo intercepta
  assert.match(js, /function irAInternacional\(\) \{ location\.href = '\/checkout' \}/)
  // Mandarina no cambia: abierta y sin botón internacional
  const man = js.slice(js.indexOf('MANDARINA: {'), js.indexOf('},', js.indexOf('MANDARINA: {')))
  assert.match(man, /abierto: true/)
  assert.match(man, /internacional: false/)
})

import { resumenCalculo } from '../lib/checkoutTienda.js'
const m = (x) => ({ shopMoney: { amount: String(x) } })

// Caso REAL de IND (12-nov): $30 → $19,50 con descuento automático, IVA INCLUIDO
// en el precio ($2,09), envío Quito $3,50, total $23. Sin `taxesIncluded` el
// resumen decía "Descuento −$12,59" + "IVA $2,09" (sumaba el IVA dos veces).
test('IND: IVA incluido en el precio → descuento real y sin sumar el IVA otra vez', () => {
  const r = resumenCalculo({
    lineItems: [{ title: 'Buzo Navidad', variantTitle: 'S', quantity: 1, originalTotalSet: m(30), discountedTotalSet: m(19.5) }],
    availableShippingRates: [
      { handle: 'q', title: 'Envío Quito $3,50', price: { amount: '3.5' } },
      { handle: 'p', title: 'Envío a provincia $6', price: { amount: '6.0' } },
    ],
    shippingLine: { title: 'Envío Quito $3,50' },
    subtotalPriceSet: m(19.5), totalDiscountsSet: m(10.5), totalTaxSet: m(2.09), totalPriceSet: m(23),
    taxesIncluded: true, discountCodes: [],
  }, 'q')
  assert.strictEqual(r.total, 2300)
  assert.strictEqual(r.impuestosIncluidos, true)
  assert.strictEqual(r.ahorro, 1050)
  assert.strictEqual(r.subtotalOriginal - r.ahorro + r.envio.centavos, r.total)
})

test('IND 1.er cálculo (sin tarifa puesta) con IVA incluido: no se suma el IVA al total', () => {
  const r = resumenCalculo({
    lineItems: [{ title: 'Buzo', quantity: 1, originalTotalSet: m(30), discountedTotalSet: m(19.5) }],
    availableShippingRates: [{ handle: 'q', title: 'Quito', price: { amount: '3.5' } }],
    subtotalPriceSet: m(19.5), totalDiscountsSet: m(10.5), totalTaxSet: m(2.09), totalPriceSet: m(19.5),
    taxesIncluded: true, discountCodes: [],
  })
  assert.strictEqual(r.total, 2300)
})

import { tarifasParaCiudad } from '../lib/checkoutTienda.js'

// 12-nov: Shopify de IND ofrece "Envío Quito $3,50" y "Envío a provincia $6" a
// CUALQUIER dirección. Alguien de Guayaquil podía elegir $3,50. Se filtra por ciudad
// (en el servidor: la tarifa que mande el navegador no puede saltarse esto).
const TARIFAS_IND = [
  { handle: 'q', title: 'Envío Quito $3,50 (3 a 4 días laborables)', centavos: 350 },
  { handle: 'p', title: 'Envío a provincia $6 (3 a 4 días laborables)', centavos: 600 },
]

test('envío: Quito ve solo la tarifa de Quito', () => {
  for (const ciudad of ['Quito', 'quito ', 'QUITO', 'Distrito Metropolitano de Quito']) {
    assert.deepStrictEqual(tarifasParaCiudad(TARIFAS_IND, ciudad).map((t) => t.handle), ['q'], ciudad)
  }
})

test('envío: fuera de Quito solo la de provincia', () => {
  for (const ciudad of ['Guayaquil', 'Cuenca', 'Sangolquí', '']) {
    assert.deepStrictEqual(tarifasParaCiudad(TARIFAS_IND, ciudad).map((t) => t.handle), ['p'], ciudad)
  }
})

test('envío: tarifas sin ciudad (retiro, gratis de Mandarina) siguen para todos', () => {
  const t = [...TARIFAS_IND, { handle: 'r', title: 'Retiro en tienda', centavos: 0 }]
  assert.deepStrictEqual(tarifasParaCiudad(t, 'Guayaquil').map((x) => x.handle), ['p', 'r'])
  const man = [{ handle: 'g', title: 'GRATIS en compras $20 o más', centavos: 0 }]
  assert.deepStrictEqual(tarifasParaCiudad(man, 'Loja'), man)
})

test('envío: si el filtro deja cero, no se deja al cliente sin envío', () => {
  const soloQuito = [TARIFAS_IND[0]]
  assert.deepStrictEqual(tarifasParaCiudad(soloQuito, 'Cuenca'), soloQuito)
})

test('☠️ el navegador no puede pedir la tarifa de Quito desde Guayaquil', () => {
  const calc = {
    lineItems: [], availableShippingRates: [
      { handle: 'q', title: 'Envío Quito $3,50', price: { amount: '3.5' } },
      { handle: 'p', title: 'Envío a provincia $6', price: { amount: '6.0' } },
    ],
    subtotalPriceSet: m(19.5), totalTaxSet: m(0), totalPriceSet: m(19.5), discountCodes: [],
  }
  const r = resumenCalculo(calc, 'q', { ciudad: 'Guayaquil' })
  assert.strictEqual(r.envio.handle, 'p')
  assert.deepStrictEqual(r.tarifas.map((t) => t.handle), ['p'])
})
