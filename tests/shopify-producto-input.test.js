// tests/shopify-producto-input.test.js
//
// ☠️ La razon de existir de este archivo: productCreate acepta un producto a
// medio armar y devuelve userErrors: []. Se probo contra la tienda real el
// 10-sep-2026: se pidieron 5 tallas a $35 y quedo 1 variante a 0.00 sin
// categoria. Como el panel publica en ACTIVO, eso queda comprable.
// Aqui se blinda el paso previo: el input que se le manda a productSet.
import test from 'node:test'
import assert from 'node:assert'
import { construirProductSetInput, TALLA_UNICA } from '../lib/shopifyProducto.js'

const BASE = {
  titulo: 'Chaqueta Dragon Ball Z Goku',
  handle: 'chaqueta-dragon-ball-z-goku',
  descripcionHtml: '<p>Chaqueta con estampado de Goku.</p>',
  seoTitulo: 'Chaqueta Dragon Ball Z Goku | Mandarina Republic',
  seoDescripcion: 'Chaqueta con estampado de Goku a todo color. Envios a todo Ecuador.',
  tags: ['anime', 'goku'],
  tipoProducto: 'Chaquetas',
  vendor: 'Mandarina Republic',
  categoriaId: 'gid://shopify/TaxonomyCategory/aa-1-10-2-2',
  tallas: ['S', 'M', 'L'],
  precio: 35,
  fotos: [{ url: 'https://res.cloudinary.com/x/goku.png', alt: 'Chaqueta de Goku, frente' }],
  status: 'DRAFT',
}

test('crea UNA variante por talla, todas al mismo precio', () => {
  const input = construirProductSetInput(BASE)
  assert.equal(input.variants.length, 3, 'tres tallas, tres variantes')
  assert.deepEqual(input.variants.map((v) => v.optionValues[0].name), ['S', 'M', 'L'])
  for (const v of input.variants) assert.equal(v.price, '35.00')
})

test('☠️ un precio de cero o vacio no se puede armar', () => {
  for (const malo of [0, '0', null, undefined, '', -5, 'abc']) {
    assert.throws(() => construirProductSetInput({ ...BASE, precio: malo }),
      /precio/i, `dejo pasar el precio ${JSON.stringify(malo)}`)
  }
})

test('el inventario NO se rastrea: con stock 0 Shopify bloquearia la compra', () => {
  const input = construirProductSetInput(BASE)
  for (const v of input.variants) assert.equal(v.inventoryItem.tracked, false)
})

test('sin ninguna talla marcada sale UNA variante de talla unica, no cero', () => {
  const input = construirProductSetInput({ ...BASE, tallas: [] })
  assert.equal(input.variants.length, 1, 'Shopify exige al menos una variante')
  assert.equal(input.variants[0].optionValues[0].name, TALLA_UNICA)
  assert.equal(input.productOptions[0].values[0].name, TALLA_UNICA)
})

test('las tallas van en el orden del CRM, no en el que llegaron', () => {
  const input = construirProductSetInput({ ...BASE, tallas: ['XL', 'S', 'M'] })
  assert.deepEqual(input.variants.map((v) => v.optionValues[0].name), ['S', 'M', 'XL'])
})

test('cada foto viaja con su alt text y como IMAGE', () => {
  const input = construirProductSetInput(BASE)
  assert.equal(input.files.length, 1)
  assert.equal(input.files[0].originalSource, BASE.fotos[0].url)
  assert.equal(input.files[0].alt, BASE.fotos[0].alt)
  assert.equal(input.files[0].contentType, 'IMAGE')
})

test('☠️ una foto sin alt no se puede armar: el alt es la mitad del SEO', () => {
  assert.throws(() => construirProductSetInput({
    ...BASE, fotos: [{ url: 'https://res.cloudinary.com/x/a.png', alt: '  ' }],
  }), /alt/i)
})

test('el precio tachado solo aparece si es mayor que el precio', () => {
  const con = construirProductSetInput({ ...BASE, precioTachado: 45 })
  assert.equal(con.variants[0].compareAtPrice, '45.00')
  const sin = construirProductSetInput({ ...BASE, precioTachado: 30 })
  assert.equal(sin.variants[0].compareAtPrice, undefined, 'un tachado menor es un error de dedo')
})

test('el SEO y la categoria viajan con la forma que pide Shopify', () => {
  const input = construirProductSetInput(BASE)
  assert.deepEqual(input.seo, { title: BASE.seoTitulo, description: BASE.seoDescripcion })
  assert.equal(input.category, BASE.categoriaId)
  assert.equal(input.status, 'DRAFT')
})

test('id solo aparece cuando se esta actualizando un producto que ya existe', () => {
  assert.equal(construirProductSetInput(BASE).id, undefined)
  const conId = construirProductSetInput({ ...BASE, id: 'gid://shopify/Product/1' })
  assert.equal(conId.id, 'gid://shopify/Product/1')
})
