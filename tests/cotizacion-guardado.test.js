// tests/cotizacion-guardado.test.js
//
// ☠️ lib/db/cotizaciones.js filtra lo que se escribe con una lista blanca de
// columnas. Un campo que no este ahi se descarta SIN ERROR: la pantalla lo
// muestra, el guardado responde ok, y al recargar no esta.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('../lib/db/cotizaciones.js', import.meta.url), 'utf8')
const cols = fuente.slice(fuente.indexOf('const COLS'), fuente.indexOf(']', fuente.indexOf('const COLS')))

test('☠️ `opciones` esta en la lista blanca de columnas', () => {
  assert.ok(/'opciones'/.test(cols), 'sin esto las opciones se pierden al guardar, en silencio')
})

test('las columnas que ya estaban siguen ahi', () => {
  for (const c of ['productos', 'descuento', 'subtotal', 'iva_monto', 'total', 'entrega_dias']) {
    assert.ok(new RegExp(`'${c}'`).test(cols), `se perdio la columna ${c}`)
  }
})

test('la migracion agrega la columna sin transformar datos', () => {
  const sql = readFileSync(new URL('../docs/sql/2026-09-12-cotizaciones-opciones.sql', import.meta.url), 'utf8')
  assert.ok(/add column if not exists\s+opciones/i.test(sql), 'falta el ADD COLUMN idempotente')
  assert.ok(!/\bupdate\b|\bdelete\b|\bdrop\b/i.test(sql), 'la migracion NO debe tocar ni una fila existente')
})
