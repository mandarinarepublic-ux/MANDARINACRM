// tests/shopify-producto-verificacion.test.js
//
// ☠️ El caso real del 10-sep-2026: productCreate devolvio userErrors: [] y
// habia dejado 1 variante de 5, a 0.00 y sin categoria. Esta funcion es lo que
// impide que un producto asi pase de borrador a ACTIVO.
import test from 'node:test'
import assert from 'node:assert'
import { verificarProducto } from '../lib/shopifyProducto.js'

const SANO = {
  seo: { title: 'Chaqueta Goku | Mandarina', description: 'Chaqueta con estampado de Goku.' },
  category: { id: 'gid://shopify/TaxonomyCategory/aa-1-10-2-2' },
  variants: { nodes: [
    { title: 'S', price: '35.00' },
    { title: 'M', price: '35.00' },
  ] },
  media: { nodes: [{ alt: 'Chaqueta de Goku, frente', status: 'READY' }] },
}
const ESPERADO = { tallas: ['S', 'M'], fotos: 1 }

test('un producto completo pasa', () => {
  const r = verificarProducto(SANO, ESPERADO)
  assert.equal(r.ok, true, `no deberia fallar: ${r.fallos.join(' | ')}`)
  assert.deepEqual(r.fallos, [])
})

test('☠️ una variante a 0.00 no pasa NUNCA', () => {
  const roto = { ...SANO, variants: { nodes: [
    { title: 'S', price: '0.00' }, { title: 'M', price: '35.00' },
  ] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /0\.00|precio/i.test(f)), `fallos: ${r.fallos}`)
})

test('☠️ faltan variantes: se pidieron 2 y vino 1', () => {
  const roto = { ...SANO, variants: { nodes: [{ title: 'S', price: '35.00' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /variante/i.test(f)))
})

test('sin categoria no pasa: sin ella no sirve para el feed de anuncios', () => {
  const r = verificarProducto({ ...SANO, category: null }, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /categor/i.test(f)))
})

test('sin SEO titulo o descripcion no pasa', () => {
  for (const seo of [{ title: '', description: 'x' }, { title: 'x', description: '  ' }, null]) {
    const r = verificarProducto({ ...SANO, seo }, ESPERADO)
    assert.equal(r.ok, false, `paso con seo ${JSON.stringify(seo)}`)
    assert.ok(r.fallos.some((f) => /SEO/i.test(f)))
  }
})

test('☠️ una foto que no esta READY no cuenta aunque el numero cuadre', () => {
  // Shopify descarga y procesa la imagen DESPUES de responder. Mientras tanto
  // la media existe pero NO esta lista: contar no alcanza.
  for (const status of ['FAILED', 'PROCESSING', 'UPLOADED']) {
    const roto = { ...SANO, media: { nodes: [{ alt: 'x', status }] } }
    const r = verificarProducto(roto, ESPERADO)
    assert.equal(r.ok, false, `dejo pasar una foto en ${status}`)
    assert.ok(r.fallos.some((f) => /imagen|foto/i.test(f)))
  }
})

test('☠️ una foto SIN campo status tampoco pasa: se falla cerrado', () => {
  // MediaImage.status es NON_NULL en el esquema de Shopify: si no viene, algo
  // anda mal. Tratar "no se si esta lista" como "esta lista" es fallar ABIERTO
  // en la unica funcion que separa un producto roto de la tienda publica.
  const roto = { ...SANO, media: { nodes: [{ alt: 'Chaqueta de Goku, frente' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false, 'una foto sin status se colo como buena')
  assert.ok(r.fallos.some((f) => /imagen|foto/i.test(f)))
})

test('una foto sin alt no pasa', () => {
  const roto = { ...SANO, media: { nodes: [{ alt: '', status: 'READY' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /alt/i.test(f)))
})

test('acumula TODOS los fallos, no solo el primero', () => {
  const r = verificarProducto({ seo: null, category: null, variants: { nodes: [] }, media: { nodes: [] } }, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.length >= 4, `deberia listar todo lo roto, listo: ${r.fallos.length}`)
})

test('no revienta si Shopify devuelve un producto vacio o nulo', () => {
  for (const p of [null, undefined, {}]) {
    const r = verificarProducto(p, ESPERADO)
    assert.equal(r.ok, false)
    assert.ok(Array.isArray(r.fallos) && r.fallos.length > 0)
  }
})
