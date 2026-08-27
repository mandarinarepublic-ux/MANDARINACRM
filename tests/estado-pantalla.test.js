// Lo que la pantalla tenía puesto se devuelve al volver — pero no para siempre.
//
// ☠️ La parte peligrosa NO es guardar: es RESTAURAR. Un filtro de fecha de ayer
// que vuelve solo deja la bandeja mostrando menos de lo que hay, y la pantalla
// se ve perfectamente sana. Por eso se prueban las tres defensas: caduca, se
// descarta si no se entiende, y sabe decir cuándo hay un filtro puesto.
import test from 'node:test'
import assert from 'node:assert'
import { leer, guardar, limpiar, hayFiltro, VIGENCIA_MS } from '../lib/estado-pantalla.js'

/** localStorage de mentira: un Map con la misma cara. */
function almacenFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _mapa: m,
  }
}

test('devuelve lo que se guardó', () => {
  const a = almacenFalso()
  guardar(a, 'despacho', { busqueda: 'MAN-AND-5599', visibles: 40 }, 1000)
  assert.deepStrictEqual(leer(a, 'despacho', 1000), { busqueda: 'MAN-AND-5599', visibles: 40 })
})

test('cada pantalla tiene su propio estado', () => {
  const a = almacenFalso()
  guardar(a, 'despacho', { busqueda: 'uno' }, 1000)
  guardar(a, 'produccion', { busqueda: 'dos' }, 1000)
  assert.strictEqual(leer(a, 'despacho', 1000).busqueda, 'uno')
  assert.strictEqual(leer(a, 'produccion', 1000).busqueda, 'dos')
})

test('sin nada guardado devuelve null, no un objeto vacio', () => {
  assert.strictEqual(leer(almacenFalso(), 'despacho', 1000), null)
})

test('CADUCA: pasada la vigencia no se restaura', () => {
  const a = almacenFalso()
  guardar(a, 'despacho', { fechaDesde: '2026-08-25' }, 0)
  assert.ok(leer(a, 'despacho', VIGENCIA_MS - 1), 'dentro de la vigencia sigue vivo')
  assert.strictEqual(leer(a, 'despacho', VIGENCIA_MS + 1), null,
    'un filtro de fecha de ayer no puede reaparecer solo')
})

test('lo vencido ademas se borra, no se queda ocupando sitio', () => {
  const a = almacenFalso()
  guardar(a, 'despacho', { busqueda: 'x' }, 0)
  leer(a, 'despacho', VIGENCIA_MS + 1)
  assert.strictEqual(a.getItem('mp_estado_despacho'), null)
})

test('un estado corrupto no tumba la pantalla: se descarta', () => {
  for (const basura of ['{no es json', 'null', '[]', '"texto"', '{"v":{"a":1}}', '{"t":"ayer","v":{}}']) {
    const a = almacenFalso({ 'mp_estado_despacho': basura })
    assert.strictEqual(leer(a, 'despacho', 1000), null, `deberia descartar: ${basura}`)
  }
})

test('sin almacen (SSR o Safari privado) no lanza', () => {
  assert.strictEqual(leer(null, 'despacho', 1000), null)
  assert.strictEqual(guardar(null, 'despacho', { a: 1 }, 1000), false)
  assert.doesNotThrow(() => limpiar(null, 'despacho'))
})

test('un almacen que lanza al escribir (cuota llena) no rompe nada', () => {
  const a = { getItem: () => { throw new Error('boom') }, setItem: () => { throw new Error('lleno') }, removeItem: () => {} }
  assert.strictEqual(leer(a, 'despacho', 1000), null)
  assert.strictEqual(guardar(a, 'despacho', { a: 1 }, 1000), false)
})

// ── El aviso ──────────────────────────────────────────────────────────────────
const POR_DEFECTO = { busqueda: '', fechaDesde: '', fechaHasta: '', filtroTienda: 'TODAS', visibles: 20, scroll: 0 }
const NO_SON_FILTRO = ['visibles', 'scroll']

test('sin nada puesto no hay filtro que avisar', () => {
  assert.strictEqual(hayFiltro({ ...POR_DEFECTO }, POR_DEFECTO, NO_SON_FILTRO), false)
})

test('cualquier filtro puesto se detecta', () => {
  assert.ok(hayFiltro({ ...POR_DEFECTO, busqueda: 'ana' }, POR_DEFECTO, NO_SON_FILTRO))
  assert.ok(hayFiltro({ ...POR_DEFECTO, fechaDesde: '2026-08-01' }, POR_DEFECTO, NO_SON_FILTRO))
  assert.ok(hayFiltro({ ...POR_DEFECTO, filtroTienda: 'MANDARINA' }, POR_DEFECTO, NO_SON_FILTRO))
})

test('scroll y paginacion NO son filtros: restaurarlos no esconde nada', () => {
  assert.strictEqual(hayFiltro({ ...POR_DEFECTO, visibles: 200, scroll: 900 }, POR_DEFECTO, NO_SON_FILTRO), false)
})

test('un filtro NUEVO entra solo, sin tocar esta funcion', () => {
  // La regla es "distinto del valor por defecto", no una lista de nombres. Una
  // lista blanca habria dejado el filtro nuevo fuera del aviso, en silencio.
  const conNuevo = { ...POR_DEFECTO, filtroInventado: 'TODOS' }
  assert.strictEqual(hayFiltro({ ...conNuevo }, conNuevo, NO_SON_FILTRO), false)
  assert.ok(hayFiltro({ ...conNuevo, filtroInventado: 'ALGO' }, conNuevo, NO_SON_FILTRO))
})
