// El permiso `VER_TODAS_LAS_VENTAS`.
//
// El rol VENDEDOR filtra el Historial por `vendedor_id`: cada quien ve lo suyo.
// JACKELINE necesitaba ver las ventas de TODOS en MANDARINA e INDSTORE — no solo
// sus 176 de Mandarina. Este permiso levanta ESE filtro.
//
// ☠️ Y SOLO ESE. Si de paso levantara el de tienda, le abriría los 129 pedidos de
// YAW, que no le tocan. Son dos restricciones distintas y tienen que seguir
// siéndolo: por eso hay una prueba dedicada a que el filtro por tienda sobreviva.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { veTodasLasVentas, puedeVerTienda, filtraPorTienda } from '../lib/tiendasUsuario.js'

const repo = readFileSync(new URL('../lib/db/historial.js', import.meta.url), 'utf8')
const misPedidos = readFileSync(new URL('../lib/db/mis-pedidos.js', import.meta.url), 'utf8')
const usuarios = readFileSync(new URL('../app/dashboard/usuarios/page.js', import.meta.url), 'utf8')

const JACKE = { rol: 'VENDEDOR', nombre: 'JACKELINE BARRETO',
                tiendas: ['MANDARINA', 'INDSTORE'], accesos: ['VER_TODAS_LAS_VENTAS'] }
const OTRA  = { rol: 'VENDEDOR', nombre: 'GRACE VEGA', tiendas: ['MANDARINA'], accesos: [] }

test('el permiso se reconoce, y sin el no', () => {
  assert.strictEqual(veTodasLasVentas(JACKE), true)
  assert.strictEqual(veTodasLasVentas(OTRA), false)
  // Mayusculas de la otra forma de leer el usuario (ACCESOS), y datos raros.
  assert.strictEqual(veTodasLasVentas({ ACCESOS: ['VER_TODAS_LAS_VENTAS'] }), true)
  for (const malo of [null, undefined, {}, { accesos: null }, { accesos: 'VER_TODAS_LAS_VENTAS' }]) {
    assert.strictEqual(veTodasLasVentas(malo), false, `no deberia colar: ${JSON.stringify(malo)}`)
  }
})

test('levanta el filtro por VENDEDOR', () => {
  assert.ok(/rol === 'VENDEDOR' && !veTodasLasVentas\(usuario\)/.test(repo),
    'sin esto sigue viendo solo lo suyo')
})

test('☠️ NO levanta el filtro por TIENDA', () => {
  // El bloque de tienda no puede depender del permiso: es otra restriccion.
  const bloque = repo.slice(repo.indexOf('ROLES_POR_TIENDA.includes(rol)'))
  const hasta = bloque.slice(0, bloque.indexOf('return consulta'))
  assert.ok(!/veTodasLasVentas/.test(hasta),
    'el permiso no puede tocar el filtro por tienda: le abriria YAW')
  assert.ok(/consulta\.in\('tienda_id', suyas\)/.test(hasta), 'y ese filtro tiene que seguir ahi')

  // Y la regla, sin base de datos: con el permiso puesto, YAW le sigue negado.
  assert.strictEqual(filtraPorTienda(JACKE), true, 'sigue restringida por tienda')
  assert.strictEqual(puedeVerTienda(JACKE, 'MANDARINA'), true)
  assert.strictEqual(puedeVerTienda(JACKE, 'INDSTORE'), true)
  assert.strictEqual(puedeVerTienda(JACKE, 'YAW'), false, 'YAW no le toca ni con el permiso')
})

test('☠️ NO toca "Mis Pedidos": esa pantalla son los MIOS', () => {
  assert.ok(!/veTodasLasVentas/.test(misPedidos),
    'si Mis Pedidos mostrara los de todos, mentiria en su propio nombre')
  assert.ok(/identidadesDe/.test(misPedidos), 'ahi el filtro por vendedor se queda')
})

test('se puede marcar desde la pantalla de Usuarios', () => {
  // Un permiso que solo se pueda dar por SQL acaba sin darse.
  assert.ok(usuarios.includes('VER_TODAS_LAS_VENTAS'),
    'tiene que estar en el AccesosPicker o nadie podra asignarlo')
})
