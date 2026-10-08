// tests/tipos-prenda-selector.test.js
//
// El catálogo llegó a 346 tipos activos porque el buscador del pedido ponía
// "Crear" PRIMERO y resaltado: `HOODIE PREM` + Enter creaba un tipo nuevo. Y
// cualquier vendedor podía crear. Limpieza y arreglo del 7-oct-2026.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { tiposParecidos, claveTipo, distancia } from '../lib/tiposParecidos.js'

const CATALOGO = [
  'HOODIE PREMIUM', 'HOODIE CON CIERRE PREMIUM', 'CAMISETA JERSEY', 'CAMISETA', 'JOGGER',
  'TOP', 'POLO', 'BUZO PREMIUM', 'HOODIE OVERSIZE', 'CAMISETA LICRA ALGODON',
]

test('los errores REALES que había en el catálogo se reconocen', () => {
  const reales = {
    'HODIE PREMIUM': 'HOODIE PREMIUM', 'HOODIE PEEMIUM': 'HOODIE PREMIUM',
    'HOODIEPREMIUM': 'HOODIE PREMIUM', 'HOODIE PREMIU': 'HOODIE PREMIUM',
    'HOODIES  PREMIUM': 'HOODIE PREMIUM', 'CAMISETA JETSEY': 'CAMISETA JERSEY',
    'JOOGER': 'JOGGER', 'BUZO PTEMIUM': 'BUZO PREMIUM', 'HOODIE OVERSIZR': 'HOODIE OVERSIZE',
    'CAMISETA LUCRA ALGODON': 'CAMISETA LICRA ALGODON',
  }
  for (const [malo, bueno] of Object.entries(reales)) {
    assert.equal(tiposParecidos(malo, CATALOGO)[0], bueno, `${malo} → ${bueno}`)
  }
})

test('tildes, mayúsculas, espacios y signos no cuentan', () => {
  assert.equal(claveTipo('hoodie  prémium.'), 'HOODIEPREMIUM')
  assert.deepEqual(tiposParecidos('hoodie  prémium.', CATALOGO), ['HOODIE PREMIUM'])
})

test('no inventa parecidos en nombres cortos ni en prendas nuevas', () => {
  assert.deepEqual(tiposParecidos('TOPO', CATALOGO), [], 'TOPO no es TOP ni POLO')
  assert.deepEqual(tiposParecidos('GORRA', CATALOGO), [])
  assert.deepEqual(tiposParecidos('CHAQUETA NUEVA', CATALOGO), [])
  assert.deepEqual(tiposParecidos('', CATALOGO), [])
})

test('la distancia corta temprano y es correcta', () => {
  assert.equal(distancia('JOOGER', 'JOGGER', 2), 1)
  assert.equal(distancia('ABC', 'ABCDEFGH', 2), 3, 'pasado el tope devuelve tope+1')
})

const selector = readFileSync(new URL('../components/pedido/SelectorTipoPrenda.js', import.meta.url), 'utf8')

test('Enter elige la primera COINCIDENCIA: "Crear" va al final', () => {
  assert.ok(/const opciones = \[\.\.\.filtrados, \.\.\.sugeridos, \.\.\.\(ofreceCrear \? \['__crear__'\] : \[\]\)\]/.test(selector),
    'el orden tiene que ser coincidencias → sugeridos → crear')
  assert.ok(!/\['__crear__', \.\.\.filtrados\]/.test(selector), 'crear ya no puede ir primero')
})

test('crear depende de permitirCrear, que por defecto es false', () => {
  assert.ok(/permitirCrear = false/.test(selector))
  assert.ok(/const ofreceCrear = permitirCrear &&/.test(selector))
})

test('se avisa cuántas opciones quedan abajo (la barra no se ve)', () => {
  assert.ok(/ocultasAbajo > 0/.test(selector) && /más · desliza/.test(selector))
  assert.ok(/lista-desplegable/.test(selector))
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.ok(/\.lista-desplegable::-webkit-scrollbar-thumb/.test(css))
})

test('la API: crear exige ADMIN y no reactiva un tipo desactivado', () => {
  const api = readFileSync(new URL('../app/api/productos/route.js', import.meta.url), 'utf8')
  const post = api.slice(api.indexOf('export async function POST'), api.indexOf('export async function PATCH'))
  assert.ok(/await requireAdmin\(req\)/.test(post), 'POST sin requireAdmin')
  assert.ok(post.indexOf('requireAdmin') < post.indexOf('addCatalogo'), 'el permiso va antes de escribir')
  assert.ok(/listCatalogoGestion\(\)/.test(post), 'comparar contra el catálogo COMPLETO, con los inactivos')
  assert.ok(/DESACTIVADO/.test(post))
})

test('el pedido solo deja crear al ADMIN', () => {
  const buscador = readFileSync(new URL('../components/pedido/BuscadorProductos.js', import.meta.url), 'utf8')
  assert.ok(/permitirCrear=\{esAdmin\}/.test(buscador))
})
