// El filtro de área del Historial.
//
// Dos reglas, y las dos esconden pedidos si alguien las cambia sin darse cuenta.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { AREAS_FILTRABLES, esAreaFiltrable } from '../lib/areas-filtrables.js'

const repo = readFileSync(new URL('../lib/db/historial.js', import.meta.url), 'utf8')
const api  = readFileSync(new URL('../app/api/historial/route.js', import.meta.url), 'utf8')
const src  = readFileSync(new URL('../app/dashboard/historial/page.js', import.meta.url), 'utf8')

// ─── Regla 1: CONTIENE, no es igual ─────────────────────────────────────────
//
// ☠️ `detalle_pedido.area` guarda combinaciones en un solo texto:
// `ESTAMPADO + BORDADO` son 82 pedidos. Medido el 26-ago-2026, filtrar con `=`
// en vez de "contiene" perdería 77 pedidos de BORDADO (270 → 193) y 75 de
// ESTAMPADO (393 → 318). La pantalla se vería perfectamente sana.

test('el area se filtra con ilike, NUNCA con eq', () => {
  assert.ok(/\.ilike\(\s*['"`]filtro_area\.area/.test(repo),
    'tiene que ser ilike con comodines')
  assert.ok(!/\.eq\(\s*['"`]filtro_area\.area/.test(repo),
    'con eq se pierden las areas compuestas (ESTAMPADO + BORDADO) en silencio')
  assert.ok(/%\$\{areaPedida\}%/.test(repo), 'los comodines van a los dos lados')
})

test('una prenda de area compuesta cae dentro del filtro', () => {
  // La regla en si, sin base de datos: es lo que hace `%AREA%`.
  const contiene = (guardado, pedida) => guardado.toUpperCase().includes(pedida.toUpperCase())
  assert.ok(contiene('ESTAMPADO + BORDADO', 'BORDADO'))
  assert.ok(contiene('SUBLIMACION + BORDADO', 'BORDADO'))
  assert.ok(contiene('ESTAMPADO + SUBLIMACION', 'SUBLIMACION'))
  // Y que no se cuele lo que no toca.
  assert.ok(!contiene('PRODUCTO SIN DISEÑO', 'BORDADO'))
})

test('las areas sin diseño no se pisan entre ellas', () => {
  // `PREMIUM - SIN DISEÑO` y `PRODUCTO SIN DISEÑO` comparten "SIN DISEÑO", pero
  // ninguna es subcadena de la otra: filtrar una no arrastra la otra.
  assert.ok(!'PRODUCTO SIN DISEÑO'.includes('PREMIUM - SIN DISEÑO'))
  assert.ok(!'PREMIUM - SIN DISEÑO'.includes('PRODUCTO SIN DISEÑO'))
})

// ─── Regla 2: el filtro elige PEDIDOS, no recorta la tarjeta ────────────────
//
// ☠️ Con PostgREST, un `!inner` sobre el embed que se PINTA filtra tambien las
// filas devueltas: un pedido de 3 prendas con una sola de bordado se veria como
// un pedido de UNA prenda. Es la trampa de "la lista recortada con cara de
// completa" — la misma que dejo 21 pedidos invisibles 14 dias.

test('el embed que se pinta NO lleva !inner', () => {
  const pintado = repo.match(/prendas:detalle_pedido[^\n]*/g) || []
  assert.ok(pintado.length > 0, 'tiene que existir el embed de prendas')
  for (const linea of pintado) {
    assert.ok(!linea.includes('!inner'),
      `el embed que se pinta no puede filtrarse: ${linea.trim()}`)
  }
})

test('el !inner vive en un embed aparte, que no se lee', () => {
  assert.ok(/filtro_area:detalle_pedido!inner\(area\)/.test(repo),
    'el join de filtrado va con su propio alias')
  assert.ok(!/filtro_area\??\.\w/.test(repo.replace(/filtro_area\.area/g, '')),
    'ese embed es solo para el join: nada deberia leer sus datos')
})

test('sin filtro de area no se le mete un join a la consulta normal', () => {
  assert.ok(/areaPedida \? SELECT_CON_AREA : SELECT/.test(repo),
    'la consulta de siempre no debe cambiar cuando nadie filtra por area')
})

// ─── Que llegue de punta a punta ────────────────────────────────────────────

test('el area viaja de la pantalla al servidor', () => {
  assert.ok(/q\.set\('area', filtroArea\)/.test(src), 'la pantalla la manda')
  assert.ok(/area:\s*searchParams\.get\('area'\)/.test(api), 'la api la recibe')
  assert.ok(/busquedaDebounced[^\]]*filtroArea/.test(src),
    'cambiar el area tiene que disparar consulta nueva, o la lista se queda vieja')
})

test('solo se aceptan las areas de la lista', () => {
  // Lo que llegue por la url no puede volverse un patron cualquiera contra la base.
  assert.ok(/esAreaFiltrable\(area\)/.test(repo))
  assert.ok(esAreaFiltrable('BORDADO'))
  assert.ok(!esAreaFiltrable('%'))
  assert.ok(!esAreaFiltrable('ESTAMPADO + BORDADO'), 'las compuestas no se ofrecen')
})

test('hay UNA sola lista de areas, compartida', () => {
  assert.deepStrictEqual(AREAS_FILTRABLES, [
    'ESTAMPADO', 'BORDADO', 'SUBLIMACION',
    'PRODUCTO SIN DISEÑO', 'PREMIUM - SIN DISEÑO', 'ENTREGA EN TIENDA',
  ])
  assert.ok(src.includes('AREAS_FILTRABLES'), 'la pantalla come de la misma lista')
  // `AREAS` de lib/pedidos.js ya se desincronizo con lib/pedidos-client.js.
  assert.ok(!/const AREAS_\w*\s*=\s*\[/.test(src), 'nadie define su propia lista acá')
})
