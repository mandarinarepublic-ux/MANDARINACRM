// La consulta de clientes: cada modo pide lo que necesita.
//
// Antes la ruta traia la TABLA ENTERA hiciera lo que hiciera —incluso buscar UN
// cliente por id— y filtraba en memoria. Con `crm.clientes` en 900 y creciendo
// 44/semana, en septiembre PostgREST habria empezado a cortar en 1000 EN
// SILENCIO: un cliente que existe se ve como nuevo, el vendedor lo reteclea y al
// guardar el nombre bueno se sobrescribe.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { normalizarBusqueda } from '../lib/normalizar-busqueda.js'

const ruta = readFileSync(new URL('../app/api/clientes/route.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
const impresion = readFileSync(new URL('../app/dashboard/impresion/page.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// ─── La normalizacion tiene que ser LA MISMA en los dos lados ────────────────
//
// El JS normaliza lo que TECLEA el usuario; Postgres normalizo lo que hay
// GUARDADO (columna generada `busqueda`). Si se separan, la busqueda deja de
// encontrar y nadie se entera: no hay error, solo cero resultados.
//
// Estos pares salieron de correr en la base:
//   select translate(lower('X'),'áéíóúñÁÉÍÓÚÑ','aeiounaeioun')
const LO_QUE_HACE_POSTGRES = [
  ['MARÍA ANGÉLICA CORREA ACEBO', 'maria angelica correa acebo'],
  ['AYRTON RICARDO GARCIA MUÑOZ', 'ayrton ricardo garcia munoz'],
  ['Fabiana Calcaño', 'fabiana calcano'],
  ['MACÍAS FERNÁNDEZ MAYRA MERCEDES', 'macias fernandez mayra mercedes'],
  ['CARLOS DANIEL GUTIÉRREZ HOLGUÍN', 'carlos daniel gutierrez holguin'],
  ['JOSÉ PÉREZ ÑAÑEZ', 'jose perez nanez'],
  ['', ''],
]

test('el JS normaliza EXACTAMENTE igual que la columna generada', () => {
  for (const [entra, espera] of LO_QUE_HACE_POSTGRES) {
    assert.strictEqual(normalizarBusqueda(entra), espera,
      `"${entra}" tiene que quedar igual en los dos lados`)
  }
})

test('normalizar aguanta null y numeros sin reventar', () => {
  assert.strictEqual(normalizarBusqueda(null), '')
  assert.strictEqual(normalizarBusqueda(undefined), '')
  assert.strictEqual(normalizarBusqueda(993742937), '993742937')
})

// ─── Cada modo pide lo suyo ─────────────────────────────────────────────────

test('buscar filtra en la BASE, no en memoria', () => {
  const codigo = sinComentarios(repo)
  assert.ok(/\.like\('busqueda', `%\$\{term\}%`\)/.test(codigo),
    'la busqueda va contra la columna `busqueda`, en la base')
  assert.ok(/\.limit\(tope\)/.test(codigo), 'y acotada: nunca la tabla entera')
})

test('no queda NINGUNA lectura de clientes sin acotar', () => {
  // `listClientes()` decia "TODOS los clientes, la ruta aplica filtros/slices".
  // Ese "la ruta recorta DESPUES" era el problema entero: las 900 filas ya
  // habian viajado, y pasadas las 1000 el recorte se hace sobre una lista que
  // PostgREST corto en silencio.
  const codigo = sinComentarios(repo)
  assert.ok(!/export async function listClientes\b/.test(codigo),
    'listClientes traia la tabla entera: se borro, no se arreglo')
  assert.ok(!/export async function listClientesSupabase/.test(codigo),
    'listClientesSupabase igual')

  // Toda consulta a la tabla tiene que cerrarse con un tope o un filtro por
  // clave. Se mira la sentencia entera, hasta el `;`.
  for (const consulta of codigo.match(/from\('clientes'\)[\s\S]*?;/g) || []) {
    assert.ok(/\.limit\(|\.in\(|\.eq\(|\.insert\(|\.update\(/.test(consulta),
      `esta consulta puede traer la tabla entera:\n${consulta}`)
  }
})

test('un cliente por id no se lleva la agenda entera', () => {
  const codigo = sinComentarios(ruta)
  assert.ok(/getClienteById\(byId\)/.test(codigo), 'debe pedir esa fila')
  assert.ok(!/clientes\.find\(/.test(codigo), 'buscar en memoria obligaba a traerlo todo')
})

test('?all=1 ya no existe: era la fuga y el que rompia con el tope', () => {
  assert.ok(!/searchParams\.get\('all'\)/.test(ruta),
    'mandaba 900 cedulas al navegador de cualquier sesion')
  assert.ok(!/api\/clientes\?all=1/.test(impresion), 'impresion ya no debe pedirlo')
  assert.ok(/api\/clientes\?ids=/.test(impresion), 'pide solo los de sus pedidos')
})

test('impresion trocea los ids: no caben cientos en una URL', () => {
  assert.ok(/i \+= 100/.test(impresion), 'debe pedirlos en tandas')
  assert.ok(/new Set\(enFabrica\.map\(p => p\.CLIENTE_ID\)/.test(impresion),
    'sin deduplicar, dos pedidos del mismo cliente lo piden dos veces')
})

test('listClientesPorIds tampoco se pasa de 1000 ni con muchos ids', () => {
  const codigo = sinComentarios(repo)
  assert.ok(/const TANDA = 200/.test(codigo), 'trocea del lado del servidor tambien')
  assert.ok(/new Set\(/.test(codigo), 'ids repetidos no deben pedirse dos veces')
})
