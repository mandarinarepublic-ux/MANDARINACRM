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
