// tests/historial-busqueda.test.js
//
// El Historial reventaba con "Bad Request" en la primera tecla de un número de
// pedido: `6` coincidía con 979 clientes por su celular y sus ids iban en la URL
// (~26 KB). Ver lib/historial-busqueda.js.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  buscaEnClientes, filtroBusqueda, MAX_IDS_EN_URL, MIN_CARACTERES_CLIENTE,
} from '../lib/historial-busqueda.js'

// Un id real de crm.clientes mide ~26 caracteres.
const idsFalsos = (n) => Array.from({ length: n }, (_, i) => `CLI-${String(i).padStart(6, '0')}-abcdefghijklm`)

test('con 1 o 2 caracteres NO se busca entre los clientes', () => {
  for (const t of ['6', '0', 'a', '09', ' 5 ']) {
    assert.equal(buscaEnClientes(t), false, `«${t}» no debe resolver clientes`)
  }
  assert.equal(MIN_CARACTERES_CLIENTE, 3)
})

test('desde 3 caracteres sí: nombres, cédulas y celulares', () => {
  for (const t of ['593', 'ana', 'maria', '0991234567']) {
    assert.equal(buscaEnClientes(t), true, `«${t}» sí busca clientes`)
  }
})

test('sin clientes, el filtro es solo por número de pedido', () => {
  assert.equal(filtroBusqueda('6', []), 'pedido_id.ilike.*6*')
  assert.equal(filtroBusqueda('  ', []), null)
  assert.equal(filtroBusqueda('', ['X']), null)
})

test('los caracteres que rompen la sintaxis de PostgREST se quitan', () => {
  assert.equal(filtroBusqueda('5,6(*)', []), 'pedido_id.ilike.*56*')
})

test('NUNCA van más de MAX_IDS_EN_URL ids en la URL', () => {
  const filtro = filtroBusqueda('maria', idsFalsos(1000))
  const ids = filtro.match(/cliente_id\.in\.\((.*)\)$/)[1].split(',')
  assert.equal(ids.length, MAX_IDS_EN_URL)
  // 26 KB reventaba; Impresión ya manda 200 por petición sin problema.
  assert.ok(filtro.length < 8000, `el filtro mide ${filtro.length} bytes`)
})

test('el repositorio usa la regla y le pide a clientes solo lo que cabe', () => {
  const repo = readFileSync(new URL('../lib/db/historial.js', import.meta.url), 'utf8')
  assert.ok(/buscaEnClientes\(termino\)/.test(repo), 'la longitud mínima se respeta')
  assert.ok(/idsClientesQueCoinciden\(termino, MAX_IDS_EN_URL\)/.test(repo),
    'el tope se pide a la base: así el aviso de búsqueda recortada sale del conteo real')
  assert.ok(!/cliente_id\.in\.\(\$\{ids/.test(repo), 'el filtro no se arma a mano en el repositorio')
})
