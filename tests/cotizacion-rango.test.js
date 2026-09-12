// tests/cotizacion-rango.test.js
import test from 'node:test'
import assert from 'node:assert'
import { rangoTotales } from '../lib/cotizacion.js'

const prod = (precio, cantidad = 1) => ({ id: String(Math.random()), precio, cantidad })
const conOpciones = (...listas) => ({
  descuento: 0,
  opciones: listas.map((ps, i) => ({ id: `o${i}`, nombre: `O${i}`, entrega_dias: 15, productos: ps })),
})

test('una sola opcion: min y max son el mismo y `varias` es false', () => {
  const r = rangoTotales({ productos: [prod(100)], descuento: 0 })
  assert.equal(r.varias, false)
  assert.equal(r.min.total, r.max.total)
  assert.equal(r.min.total.toFixed(2), '115.00')
})

test('varias opciones: el rango va de la mas barata a la mas cara', () => {
  const r = rangoTotales(conOpciones([prod(1200)], [prod(800)], [prod(1000)]))
  assert.equal(r.varias, true)
  assert.equal(r.min.total.toFixed(2), '920.00')   // 800 + 15%
  assert.equal(r.max.total.toFixed(2), '1380.00')  // 1200 + 15%
  assert.equal(r.porOpcion.length, 3, 'devuelve el total de CADA opcion, en su orden')
  assert.equal(r.porOpcion[0].totales.total.toFixed(2), '1380.00', 'porOpcion respeta el orden original')
})

test('☠️ los tres valores que se guardan salen de la MISMA opcion', () => {
  // Tomando el minimo de cada uno por separado saldria el subtotal de una
  // opcion con el IVA de otra: tres numeros que no cuadran entre si.
  const r = rangoTotales(conOpciones([prod(800)], [prod(1200)]))
  const g = r.guardar
  assert.equal(g.subtotal.toFixed(2), '800.00')
  assert.equal(g.iva_monto.toFixed(2), '120.00')
  assert.equal(g.total.toFixed(2), '920.00')
  assert.equal((g.subtotal + g.iva_monto).toFixed(2), g.total.toFixed(2), 'los tres cuadran entre si')
})

test('el descuento es de toda la cotizacion y se aplica a cada opcion', () => {
  const c = conOpciones([prod(800)], [prod(1200)])
  c.descuento = 100
  const r = rangoTotales(c)
  assert.equal(r.min.total.toFixed(2), '805.00')   // (800-100) × 1.15
  assert.equal(r.max.total.toFixed(2), '1265.00')  // (1200-100) × 1.15
})

test('no revienta con una cotizacion vacia o nula', () => {
  for (const c of [null, undefined, {}, { opciones: [] }]) {
    const r = rangoTotales(c)
    assert.equal(r.min.total, 0)
    assert.equal(r.varias, false)
  }
})

test('una opcion sin productos cuenta como cero, no rompe el rango', () => {
  const r = rangoTotales(conOpciones([], [prod(800)]))
  assert.equal(r.min.total, 0)
  assert.equal(r.max.total.toFixed(2), '920.00')
})
