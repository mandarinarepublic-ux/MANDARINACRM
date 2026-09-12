// tests/shopify-producto-manual.test.js
//
// El camino manual del panel: el usuario llena la ficha y no interviene la IA.
// Lo que se blinda aqui son las dos funciones puras de las que depende:
// el handle (que ES la direccion del producto en la tienda) y la ficha en
// blanco (que decide con que tallas y con que marca arranca el producto).
import test from 'node:test'
import assert from 'node:assert'
import { handleDesdeTitulo, fichaEnBlanco, MARCA_POR_TIENDA } from '../lib/shopifyProducto.js'
import { TALLAS } from '../lib/cotizacion.js'

test('el handle sale en minusculas y separado por guiones', () => {
  assert.equal(handleDesdeTitulo('Chaqueta Dragon Ball Z'), 'chaqueta-dragon-ball-z')
})

test('☠️ las tildes y la ñ se convierten, no se borran', () => {
  // Si se borraran, «Niños» saldria «nios» y la direccion diria otra palabra.
  assert.equal(handleDesdeTitulo('Buzo Niños Otoño'), 'buzo-ninos-otono')
  assert.equal(handleDesdeTitulo('Edición Única'), 'edicion-unica')
})

test('los simbolos y los espacios de sobra no dejan guiones sueltos', () => {
  assert.equal(handleDesdeTitulo('  Gorra  ¡Súper! 2026  '), 'gorra-super-2026')
  assert.equal(handleDesdeTitulo('Camiseta 100% Algodón — Premium'), 'camiseta-100-algodon-premium')
})

test('un titulo vacio o raro devuelve cadena vacia, no revienta', () => {
  for (const v of ['', '   ', '!!!', null, undefined]) {
    assert.equal(handleDesdeTitulo(v), '', `fallo con ${JSON.stringify(v)}`)
  }
})

test('☠️ la ficha en blanco trae las SIETE tallas marcadas', () => {
  // La marca tiene todas las tallas siempre. Si arrancara con menos, el
  // producto saldria a la venta sin variantes que si hay en bodega.
  const f = fichaEnBlanco({ fotos: [], tienda: 'MANDARINA' })
  assert.deepEqual(f.tallas, TALLAS)
  assert.equal(f.tallas.length, 7)
  assert.ok(f.tallas.includes('XS') && f.tallas.includes('XXXL'), 'tiene que ir de XS a 3XL')
})

test('las tallas de la ficha son una COPIA, no la lista del CRM', () => {
  // Destildar una talla en el panel no puede cambiar TALLAS para todo el CRM.
  const f = fichaEnBlanco({})
  f.tallas.pop()
  assert.equal(TALLAS.length, 7, 'se modifico la lista compartida')
})

test('la marca depende de la tienda', () => {
  assert.equal(fichaEnBlanco({ tienda: 'MANDARINA' }).vendor, MARCA_POR_TIENDA.MANDARINA)
  assert.equal(fichaEnBlanco({ tienda: 'INDSTORE' }).vendor, MARCA_POR_TIENDA.INDSTORE)
  // Una tienda desconocida no puede dejar el campo vacio: Shopify lo publicaria
  // sin marca y quedaria visible asi en la ficha.
  assert.equal(fichaEnBlanco({ tienda: 'LO QUE SEA' }).vendor, MARCA_POR_TIENDA.MANDARINA)
  assert.equal(fichaEnBlanco().vendor, MARCA_POR_TIENDA.MANDARINA)
})

test('☠️ la ficha en blanco NO trae categoria', () => {
  // Publicar esta bloqueado sin categoria a proposito: sin ella el producto no
  // sirve para los anuncios. Si aqui llegara algo, el bloqueo se caeria solo.
  const f = fichaEnBlanco({})
  assert.ok(!f.categoriaId, 'la categoria la escoge el usuario, nunca viene puesta')
})

test('las fotos entran con el alt vacio, para que se escriba', () => {
  const f = fichaEnBlanco({ fotos: [{ url: 'a.jpg', alt: 'lo que sea' }, { url: 'b.jpg' }] })
  assert.deepEqual(f.fotos.map((x) => x.alt), ['', ''])
  assert.deepEqual(f.fotos.map((x) => x.url), ['a.jpg', 'b.jpg'])
})
