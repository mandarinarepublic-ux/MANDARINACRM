// Buscar un cliente por cedula no puede tumbar la venta.
//
// `crm.clientes.cedula` NO tiene indice unico —solo `clientes_cedula_idx`, un
// btree normal— y `.maybeSingle()` DEVUELVE ERROR con mas de una fila. De
// `findClienteByCedula` cuelga `upsertClienteByCedula`, que es lo primero que
// hace POST /api/pedidos: una cedula repetida no daba un dato raro, tumbaba la
// creacion del pedido entera.
//
// La migracion de Sheets del 12-jun-2026 dejo 20 filas asi. Ninguna de esas
// personas llego a pedir; por eso nunca exploto. Se limpiaron el 19-ago.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
const sinComentarios = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const buscar = sinComentarios.slice(
  sinComentarios.indexOf('export async function findClienteByCedula'),
  sinComentarios.indexOf('export async function createCliente'),
)

test('buscar por cedula NO usa maybeSingle', () => {
  assert.ok(buscar.length > 0, 'no se encontro findClienteByCedula')
  assert.ok(!/maybeSingle/.test(buscar),
    'con dos filas devuelve error y se cae la creacion del pedido')
})

test('acota a una fila con un orden ESTABLE', () => {
  assert.ok(/\.limit\(1\)/.test(buscar), 'debe pedir una sola fila')
  assert.ok(/\.order\('fecha_registro'/.test(buscar) && /\.order\('cliente_id'/.test(buscar),
    'sin orden estable, dos ejecuciones pueden devolver fichas distintas del mismo cliente')
})

test('sigue devolviendo null cuando no hay nadie', () => {
  // El upsert distingue crear de actualizar con este null. Si devolviera
  // undefined o {} crearia un cliente nuevo en cada pedido.
  assert.ok(/\?\?\s*null/.test(buscar) || /\|\|\s*null/.test(buscar),
    'la primera fila de una lista vacia es undefined: hay que volverlo null')
  assert.ok(/if \(!c\) return null;/.test(src), 'toCliente(null) debe seguir dando null')
})

test('la busqueda por cedula sigue siendo acotada, no un barrido', () => {
  // Es lo unico que salva a la creacion de pedidos del tope de 1000 filas de
  // PostgREST: si esto pasara a traer todo y filtrar en memoria, un cliente
  // existente se veria como nuevo y se duplicaria.
  assert.ok(/\.eq\('cedula', ced\)/.test(buscar),
    'debe filtrar en la base por cedula, nunca traer la tabla y buscar aca')
})
