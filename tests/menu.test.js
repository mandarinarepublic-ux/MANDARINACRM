// Menú lateral: grupos para el admin, buscador, y nada cambia para los demás.
import test from 'node:test'
import assert from 'node:assert/strict'
import { NAV_ALL, GRUPOS, AGRUPAR_DESDE, getNavItems, agruparMenu, buscarEnMenu, normalizarBusqueda } from '../lib/menu.js'

const ADMIN = { rol: 'ADMIN', accesos: ['INBOX_MANDARINA', 'INBOX_INDSTORE'] }
const JACKELINE = { rol: 'VENDEDOR', accesos: ['VER_TODAS_LAS_VENTAS', 'CAJA'] }
const labels = (xs) => xs.map(n => n.label)

test('toda opción del menú tiene un grupo conocido (menos Inicio)', () => {
  const ids = new Set(GRUPOS.map(g => g.id))
  for (const n of NAV_ALL) {
    if (n.href === '/dashboard') continue
    assert.ok(ids.has(n.grupo), `${n.label} sin grupo`)
  }
})

test('el admin ve el menú en grupos, con Inicio primero y Caja dentro de Dinero', () => {
  const items = getNavItems(ADMIN)
  assert.ok(items.length >= AGRUPAR_DESDE)
  const secciones = agruparMenu(items)
  assert.equal(secciones[0].id, 'inicio')
  assert.equal(secciones[0].titulo, null)
  assert.deepEqual(labels(secciones[0].items), ['Inicio'])
  const dinero = secciones.find(s => s.id === 'dinero')
  assert.deepEqual(labels(dinero.items), ['Link de pago', 'Caja', 'Reporte de pagos'])
  // No se pierde ni se repite ninguna opción al agrupar.
  const todas = secciones.flatMap(s => s.items)
  assert.equal(todas.length, items.length)
  assert.equal(new Set(todas).size, items.length)
})

test('los grupos salen en el orden fijado y sin grupos vacíos', () => {
  const secciones = agruparMenu(getNavItems(ADMIN))
  const orden = GRUPOS.map(g => g.id)
  const ids = secciones.slice(1).map(s => s.id)
  assert.deepEqual(ids, orden.filter(id => ids.includes(id)))
  for (const s of secciones) assert.ok(s.items.length > 0)
})

test('vendedora y taller: menú plano como siempre (sin grupos)', () => {
  assert.equal(agruparMenu(getNavItems(JACKELINE)), null)
  assert.equal(agruparMenu(getNavItems({ rol: 'BORDADO', accesos: [] })), null)
  assert.equal(agruparMenu(getNavItems({ rol: 'DESPACHO', accesos: [] })), null)
  // Jackeline sigue viendo su Caja.
  assert.ok(labels(getNavItems(JACKELINE)).includes('Caja'))
})

test('agruparMenu con entradas raras', () => {
  assert.equal(agruparMenu(null), null)
  assert.equal(agruparMenu([]), null)
})

test('buscador: sin tildes ni mayúsculas, por nombre o por grupo', () => {
  const items = getNavItems(ADMIN)
  assert.deepEqual(labels(buscarEnMenu(items, 'caj')), ['Caja'])
  assert.deepEqual(labels(buscarEnMenu(items, 'PRODUCCION')), ['Producción'])
  assert.deepEqual(labels(buscarEnMenu(items, 'dinero')), ['Link de pago', 'Caja', 'Reporte de pagos'])
  assert.deepEqual(labels(buscarEnMenu(items, 'reporte pago')), ['Reporte de pagos'])
  assert.deepEqual(buscarEnMenu(items, '   '), [])
  assert.deepEqual(buscarEnMenu(items, 'zzzz'), [])
  assert.deepEqual(buscarEnMenu(null, 'caja'), [])
})

test('normalizarBusqueda', () => {
  assert.equal(normalizarBusqueda('  Cotización '), 'cotizacion')
  assert.equal(normalizarBusqueda(null), '')
})
