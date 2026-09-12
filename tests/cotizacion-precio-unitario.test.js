// tests/cotizacion-precio-unitario.test.js
//
// El documento mostraba «10 uds × $19.99» y abajo sumaba 15% de IVA. El cliente
// pagaba $22.99 por unidad y ese número no salía en ninguna parte: tenía que
// sacar la cuenta para saber cuánto le costaba cada prenda.
import test from 'node:test'
import assert from 'node:assert'
import { precioUnitarioConIva, calcSubtotalProducto, IVA_RATE } from '../lib/cotizacion.js'

test('suma el IVA al precio de lista', () => {
  assert.equal(precioUnitarioConIva({ precio: 12 }).toFixed(2), '13.80')
  assert.equal(precioUnitarioConIva({ precio: '19.99' }).toFixed(2), '22.99')
})

test('☠️ lee el precio IGUAL que calcSubtotalProducto', () => {
  // Si las dos no coinciden, la misma línea del documento mostraría un precio
  // por unidad y un subtotal que se contradicen mientras se escribe el precio.
  for (const precio of ['', '  ', null, undefined, 'abc', '12.5x']) {
    const p = { precio, cantidad: 1 }
    const porSubtotal = calcSubtotalProducto(p)             // cantidad 1 → es el precio
    const porUnidad = precioUnitarioConIva(p) / (1 + IVA_RATE)
    assert.equal(porUnidad.toFixed(4), porSubtotal.toFixed(4),
      `discrepan con precio ${JSON.stringify(precio)}`)
  }
})

test('un producto vacío o nulo no revienta', () => {
  for (const p of [null, undefined, {}]) assert.equal(precioUnitarioConIva(p), 0)
})

test('acepta otra tasa de IVA sin tocar la constante', () => {
  assert.equal(precioUnitarioConIva({ precio: 100 }, 0).toFixed(2), '100.00')
  assert.equal(precioUnitarioConIva({ precio: 100 }, 0.12).toFixed(2), '112.00')
})

import { descripcionEsBloque } from '../lib/cotizacion.js'

test('una descripción corta de una línea sigue siendo pastilla', () => {
  // La pastilla redondeada se diseñó para esto y se ve bien.
  assert.equal(descripcionEsBloque('Azul marino'), false)
  assert.equal(descripcionEsBloque('Negro, logo pecho izq.'), false)
})

test('☠️ con saltos de línea SIEMPRE es bloque, por corto que sea', () => {
  // Si se pintara como pastilla, los saltos se perderían y el texto saldría
  // de corrido — que es justo lo que se está arreglando.
  assert.equal(descripcionEsBloque('Azul\nRojo'), true)
})

test('un texto largo es bloque aunque no tenga saltos', () => {
  assert.equal(descripcionEsBloque('x'.repeat(41)), true)
  assert.equal(descripcionEsBloque('x'.repeat(40)), false)
})

test('vacío o nulo no es bloque y no revienta', () => {
  for (const t of ['', '   ', null, undefined]) assert.equal(descripcionEsBloque(t), false)
})
