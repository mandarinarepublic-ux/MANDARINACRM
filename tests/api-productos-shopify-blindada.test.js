// tests/api-productos-shopify-blindada.test.js
//
// Las rutas del panel de productos son SOLO ADMIN: crean y publican cosas en
// la tienda real. Esta prueba vigila que ninguna se abra por descuido.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const leer = (p) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))

const categorias = leer('../app/api/productos-shopify/categorias/route.js')

test('la busqueda de categorias exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(categorias), 'falta requireAdmin')
  assert.ok(/auth\.ok/.test(categorias), 'llama a requireAdmin pero no mira el resultado')
})

test('☠️ no se lee el rol ni el usuario de la url ni de una cabecera', () => {
  for (const p of ['rol', 'usuario', 'usuarioId', 'admin']) {
    assert.ok(!new RegExp(`searchParams\\.get\\('${p}'\\)`).test(categorias), `lee ?${p}= del navegador`)
  }
  assert.ok(!/headers\.get\('x-mp-usuario-id'\)/.test(categorias), 'confia en una cabecera')
})

const redactar = leer('../app/api/productos-shopify/redactar/route.js')

test('redactar exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(redactar))
  assert.ok(/auth\.ok/.test(redactar))
})

test('🔒 la clave de Anthropic no sale del servidor', () => {
  assert.ok(/process\.env\.ANTHROPIC_API_KEY/.test(redactar), 'la clave se lee del entorno')
  assert.ok(!/NEXT_PUBLIC_/.test(redactar), 'una clave con NEXT_PUBLIC_ viaja al navegador')
})

test('☠️ el prompt prohibe inventar lo que no se ve en la foto', () => {
  // Vigila DOS cosas: que la lista de prohibidos siga ahi, y que siga siendo
  // una PROHIBICION y no una sugerencia.
  //
  // Lo que esta prueba NO puede hacer, y conviene saberlo: si alguien reescribe
  // el prompt invirtiendo el sentido pero conservando el vocabulario ("si puedes
  // mencionar la composicion..."), una comparacion de texto no lo detecta.
  // Contra eso no hay prueba automatica, hay revision humana.
  assert.ok(/PROHIBIDO INVENTAR/.test(redactar), 'se perdio la prohibicion explicita')
  assert.ok(/Nunca menciones/.test(redactar), 'se perdio la forma imperativa de la regla')
  for (const palabra of ['composición', 'lavado', 'medidas']) {
    assert.ok(redactar.includes(palabra), `el prompt no menciona ${palabra} en la lista de prohibidos`)
  }
})

test('☠️ lo que devuelve la IA se comprueba de TIPO, no solo de existencia', () => {
  // `|| []` no protege de un string: `.filter` no existiria (500 mudo) y
  // `altTextos?.[i]` sobre un string devuelve letras sueltas.
  assert.ok(/Array\.isArray\(ficha\.altTextos\)/.test(redactar), 'altTextos no se comprueba de tipo')
  assert.ok(/Array\.isArray\(ficha\.tallasSugeridas\)/.test(redactar), 'tallasSugeridas no se comprueba de tipo')
})

test('☠️ la IA no devuelve el id de categoria, devuelve un termino de busqueda', () => {
  assert.ok(/categoriaBusqueda/.test(redactar), 'falta el campo de termino de busqueda')
  assert.ok(!/TaxonomyCategory/.test(redactar), 'si el prompt conoce el formato del id, se lo inventa')
})
