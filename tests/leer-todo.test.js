// lib/leerTodo.js — paginar contra el tope de 1000 de PostgREST (20-nov-2026).
import test from 'node:test'
import assert from 'node:assert'
import { leerTodo, PAGINA_POSTGREST } from '../lib/leerTodo.js'

// Una "base" falsa que corta en 1000, como PostgREST.
const baseCon = (n, pedidos = []) => () => ({
  range(ini, fin) {
    pedidos.push([ini, fin])
    const filas = Array.from({ length: n }, (_, i) => ({ i })).slice(ini, Math.min(fin + 1, ini + PAGINA_POSTGREST))
    return Promise.resolve({ data: filas, error: null })
  },
})

test('trae TODAS las filas aunque pasen de 1000 (1.382 = el caso real de pauta_dia)', async () => {
  const pedidos = []
  const filas = await leerTodo(baseCon(1382, pedidos))
  assert.equal(filas.length, 1382)
  assert.deepEqual(pedidos, [[0, 999], [1000, 1999]])
})

test('justo 1000: pide una página más para saber que no hay más', async () => {
  assert.equal((await leerTodo(baseCon(1000))).length, 1000)
})

test('vacía y pocas filas', async () => {
  assert.equal((await leerTodo(baseCon(0))).length, 0)
  assert.equal((await leerTodo(baseCon(7))).length, 7)
})

test('un error de la base se lanza, no se traga', async () => {
  const mala = () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) })
  await assert.rejects(leerTodo(mala), /boom/)
})

test('pasar el freno es un error, nunca un recorte silencioso', async () => {
  await assert.rejects(leerTodo(baseCon(5000), { maxPaginas: 2 }), /acota la consulta/)
})
