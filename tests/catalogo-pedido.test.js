// Una sola lista de áreas y tallas para el buscador y la prenda agregada
// (ver lib/catalogo-pedido.js).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  AREAS, TALLAS, TALLAS_ADULTO, TALLAS_NINO,
  opcionesConValor, valorFueraDeLista, areaSinFotos,
} from '../lib/catalogo-pedido.js'

test('las áreas incluyen las que le faltaban a la prenda agregada', () => {
  for (const a of ['PREMIUM - SIN DISEÑO', 'PRODUCTO SIN DISEÑO', 'ENTREGA EN TIENDA', 'ESTAMPADO + SUBLIMACION + BORDADO']) {
    assert.ok(AREAS.includes(a), `falta ${a}`)
  }
  assert.strictEqual(new Set(AREAS).size, AREAS.length, 'sin repetidas')
  assert.ok(!AREAS.includes(''), 'la opción vacía la pinta cada pantalla, no es un área')
})

test('tallas: adulto + niño, sin repetidas', () => {
  assert.deepStrictEqual(TALLAS, [...TALLAS_ADULTO, ...TALLAS_NINO])
  assert.strictEqual(new Set(TALLAS).size, TALLAS.length)
  assert.ok(TALLAS_ADULTO.includes('XS') && TALLAS_NINO.includes('1 AÑO'))
})

test('☠️ el valor guardado nunca se esconde', () => {
  assert.strictEqual(opcionesConValor(AREAS, 'ESTAMPADO'), AREAS, 'si ya está, la lista no cambia')
  assert.deepStrictEqual(opcionesConValor(AREAS, 'DTF'), [...AREAS, 'DTF'])
  assert.strictEqual(opcionesConValor(AREAS, ''), AREAS)
  assert.strictEqual(opcionesConValor(AREAS, null), AREAS)
  assert.strictEqual(valorFueraDeLista(AREAS, 'DTF'), true)
  assert.strictEqual(valorFueraDeLista(AREAS, 'BORDADO'), false)
  assert.strictEqual(valorFueraDeLista(AREAS, ''), false)
})

test('sin fotos: todo lo "SIN DISEÑO" y la entrega en tienda', () => {
  assert.strictEqual(areaSinFotos('PRODUCTO SIN DISEÑO'), true)
  assert.strictEqual(areaSinFotos('PREMIUM - SIN DISEÑO'), true)
  assert.strictEqual(areaSinFotos('premium - sin diseño'), true, 'sin importar mayúsculas')
  assert.strictEqual(areaSinFotos('ENTREGA EN TIENDA'), true)
  assert.strictEqual(areaSinFotos('ESTAMPADO'), false)
  assert.strictEqual(areaSinFotos('ESTAMPADO + BORDADO'), false)
  assert.strictEqual(areaSinFotos(''), false, 'sin área todavía: se muestran')
  assert.strictEqual(areaSinFotos(undefined), false)
})

test('el buscador y la prenda agregada usan la MISMA lista', () => {
  for (const ruta of ['../components/pedido/BuscadorProductos.js', '../components/pedido/ItemProducto.js']) {
    const src = readFileSync(new URL(ruta, import.meta.url), 'utf8')
    assert.ok(/from '@\/lib\/catalogo-pedido'/.test(src), `${ruta} no importa la lista compartida`)
    assert.ok(!/const AREAS = \[/.test(src), `${ruta} volvió a tener su propia lista de áreas`)
    assert.ok(!/const TALLAS = \[/.test(src), `${ruta} volvió a tener su propia lista de tallas`)
  }
})
