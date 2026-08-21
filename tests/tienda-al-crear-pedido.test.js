// Quién vende, y en qué tienda, lo decide el SERVIDOR.
//
// ☠️ `POST /api/pedidos` tomaba `tiendaId`, `vendedorId`, `vendedorNombre` y
// `vendedorCodigo` del CUERPO de la petición y los guardaba tal cual:
//
//   · cualquiera con una sesión podía crear un pedido **a nombre de otro
//     vendedor** — y eso decide comisiones, el ranking del panel y a quién le
//     reclaman si algo sale mal;
//   · y de **cualquier tienda**. La pantalla de Nueva Venta solo ofrece las
//     suyas, pero eso es esconder, no restringir.
//
// Regla de Rodrigo (21-ago-2026): Klever no debe registrar ventas de YAW.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { puedeVerTienda, tiendasDe, filtraPorTienda, puedeVender } from '../lib/tiendasUsuario.js'

const api = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const post = sinComentarios(api).slice(sinComentarios(api).indexOf('export async function POST'))

// Usuarios reales, tal como estan en crm.usuarios el 21-ago-2026.
const KLEVER = { rol: 'VENDEDOR', tiendas: ['INDSTORE', 'MANDARINA'] }
const YAW    = { rol: 'VENDEDOR_YAW', tiendas: ['YAW'] }
const ADMIN  = { rol: 'ADMIN', tiendas: ['MANDARINA', 'INDSTORE'] }
const SIN_TIENDAS = { rol: 'VENDEDOR', tiendas: [] }

test('☠️ Klever NO puede registrar una venta de YAW', () => {
  assert.strictEqual(puedeVerTienda(KLEVER, 'YAW'), false)
})

test('pero si las suyas', () => {
  assert.strictEqual(puedeVerTienda(KLEVER, 'INDSTORE'), true)
  assert.strictEqual(puedeVerTienda(KLEVER, 'MANDARINA'), true)
})

test('YAW solo vende YAW', () => {
  assert.strictEqual(puedeVerTienda(YAW, 'YAW'), true)
  assert.strictEqual(puedeVerTienda(YAW, 'MANDARINA'), false)
})

test('ADMIN no se filtra', () => {
  for (const t of ['YAW', 'MANDARINA', 'INDSTORE']) {
    assert.strictEqual(puedeVerTienda(ADMIN, t), true)
  }
})

test('sin tiendas asignadas NO se restringe', () => {
  // Un dato faltante no puede dejar a nadie sin poder vender. Para restringir
  // hay que asignar tiendas, no al reves.
  assert.strictEqual(filtraPorTienda(SIN_TIENDAS), false)
  assert.strictEqual(puedeVerTienda(SIN_TIENDAS, 'YAW'), true)
})

test('el nombre de la tienda se compara sin espacios ni mayusculas', () => {
  assert.strictEqual(puedeVerTienda({ rol: 'VENDEDOR', tiendas: ' indstore ' }, 'INDSTORE'), true)
  assert.deepStrictEqual(tiendasDe({ tiendas: 'INDSTORE, MANDARINA' }), ['INDSTORE', 'MANDARINA'])
})

// ─── Que el POST lo aplique de verdad ───────────────────────────────────────

test('☠️ el POST NO lee el vendedor del cuerpo', () => {
  assert.ok(!/vendedorId, vendedorNombre, vendedorCodigo/.test(post),
    'esos tres campos no pueden venir del navegador')
  assert.ok(/const vendedorId\s+= usuario\.USUARIO_ID/.test(post), 'sale de la cookie')
  assert.ok(/const vendedorNombre = usuario\.NOMBRE/.test(post))
  assert.ok(/const vendedorCodigo = usuario\.CODIGO/.test(post))
})

test('☠️ el POST comprueba la tienda contra las del usuario', () => {
  assert.ok(/puedeVerTienda\(/.test(post), 'debe validarla en el servidor')
  assert.ok(/status: 403/.test(post), 'y rechazar con 403, no ignorar en silencio')
})

test('el POST identifica al usuario antes de crear nada', () => {
  const hastaCliente = post.slice(0, post.indexOf('upsertClienteByCedula'))
  assert.ok(/sesionActual\(\)/.test(hastaCliente),
    'la sesion se lee ANTES de tocar la base: si no, se crea el cliente y luego se rechaza')
  assert.ok(/usuario\.ACTIVO !== 'TRUE'/.test(hastaCliente), 'un usuario desactivado no vende')
})

// ─── DISEÑO que ademas vende (permiso por persona, 21-ago-2026) ─────────────

const DISENADOR_VENDE = { rol: 'DISEÑO', tiendas: ['INDSTORE', 'MANDARINA'], accesos: ['VENTAS'] }
const DISENADOR_NORMAL = { rol: 'DISEÑO', tiendas: [], accesos: [] }

test('☠️ un diseñador con permiso de vender NO puede vender de YAW', () => {
  // Sin esto, su rol no estaba en ROLES_FILTRADOS y podia registrar una venta de
  // CUALQUIER tienda por API. La pantalla solo ofrece MANDARINA e INDSTORE, pero
  // esconder no es restringir.
  assert.strictEqual(puedeVerTienda(DISENADOR_VENDE, 'YAW'), false)
  assert.strictEqual(puedeVerTienda(DISENADOR_VENDE, 'INDSTORE'), true)
  assert.strictEqual(puedeVerTienda(DISENADOR_VENDE, 'MANDARINA'), true)
})

test('un diseñador SIN el permiso sigue sin filtrarse por tienda', () => {
  // Su trabajo es transversal: produccion no se reparte por tienda.
  assert.strictEqual(filtraPorTienda(DISENADOR_NORMAL), false)
})

test('el permiso VENTAS se lee por persona, no por rol', () => {
  assert.strictEqual(puedeVender(DISENADOR_VENDE), true)
  assert.strictEqual(puedeVender(DISENADOR_NORMAL), false)
  assert.strictEqual(puedeVender({ rol: 'DISEÑO' }), false, 'sin accesos, no vende')
  assert.strictEqual(puedeVender(null), false)
})

test('el POST mira los accesos, no solo el rol', () => {
  assert.ok(/accesos: usuario\.ACCESOS/.test(post),
    'sin pasarlos, un diseñador con permiso podria vender de cualquier tienda')
})
