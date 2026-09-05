// El total del Historial cuando hay filtro por ÁREA no se puede creer.
//
// EL FALLO REAL (4-sep-2026, 19:45): «El Historial fallo al cargar: Requested
// range not satisfiable». Es PostgREST (PGRST103) contestando a un `.range()`
// que empieza más allá de la última fila.
//
// POR QUÉ PASÓ. Con filtro de área la consulta añade
// `filtro_area:detalle_pedido!inner(area)`. Ese `!inner` es a una relación de
// MUCHOS, así que `count: 'exact'` cuenta FILAS DEL JOIN, no pedidos. Medido
// contra la base ese mismo día:
//
//     área          pedidos reales   filas del join   infla
//     ESTAMPADO           441             733         1,66×
//     BORDADO             308             439         1,43×
//     SUBLIMACION          40              70         1,75×
//
// Consecuencia en cadena:
//   · la cabecera dice «733 registros» y son 441
//   · hayMas = primera + recibidas < total  → sigue en true pasada la última
//   · el botón «Ver más» sigue ahí y a la página 15 pide el tramo 450-479
//   · sobre 441 filas eso es fuera de rango → 416
//
// Por eso ocurrió UNA sola vez: hay que filtrar por área y paginar hasta el
// fondo. No es un azar ni una carrera — es determinista.
//
// LA REGLA: un total que no se puede sostener NO se publica como exacto. Es la
// misma de `esCompleta` en bandeja-estado: ante la duda, se dice que no se sabe,
// nunca un número inventado que se lee como cierto.
//
// ⚠️ Import RELATIVO, no `@/`: `node --test` no entiende el alias.
import test from 'node:test'
import assert from 'node:assert'
import { conteoEsFiable, resumenPagina, esFueraDeRango } from '../lib/historial-paginacion.js'

// ── conteoEsFiable ────────────────────────────────────────────────────────────

test('sin filtro de área el conteo es fiable', () => {
  assert.equal(conteoEsFiable({ areaPedida: null }), true)
  assert.equal(conteoEsFiable({}), true)
})

test('☠️ con filtro de área NO es fiable: el !inner cuenta filas del join', () => {
  assert.equal(conteoEsFiable({ areaPedida: 'BORDADO' }), false)
  assert.equal(conteoEsFiable({ areaPedida: 'ESTAMPADO' }), false)
})

// ── resumenPagina ─────────────────────────────────────────────────────────────

test('sin filtro de área: el total se publica y hayMas sale de él', () => {
  const r = resumenPagina({ conteo: 838, recibidas: 30, primera: 0, tamano: 30, fiable: true })
  assert.equal(r.total, 838)
  assert.equal(r.hayMas, true)
})

test('sin filtro de área: en la última página hayMas es false', () => {
  const r = resumenPagina({ conteo: 838, recibidas: 28, primera: 810, tamano: 30, fiable: true })
  assert.equal(r.hayMas, false)
})

test('☠️ con filtro de área el total NO se publica', () => {
  // Publicar 733 cuando son 441 hace dos daños: la cabecera miente y el botón
  // «Ver más» sobrevive a la última página hasta reventar con 416.
  const r = resumenPagina({ conteo: 733, recibidas: 30, primera: 0, tamano: 30, fiable: false })
  assert.equal(r.total, null, 'un total inflado no se publica como si fuera exacto')
})

test('con filtro de área hayMas sale de si la página vino llena', () => {
  // Página llena ⇒ puede haber más. Página corta ⇒ se acabó, con certeza.
  assert.equal(resumenPagina({ conteo: 733, recibidas: 30, primera: 420, tamano: 30, fiable: false }).hayMas, true)
  assert.equal(resumenPagina({ conteo: 733, recibidas: 21, primera: 420, tamano: 30, fiable: false }).hayMas, false)
})

test('☠️ el caso exacto que reventó: página 14 llena, la 15 ya no existe', () => {
  // 441 pedidos de ESTAMPADO. La página 14 (offset 420) trae 21 y se acaba.
  // Con el total inflado en 733, hayMas daba true y la 15 pedía 450-479.
  const conLaCorreccion = resumenPagina({ conteo: 733, recibidas: 21, primera: 420, tamano: 30, fiable: false })
  assert.equal(conLaCorreccion.hayMas, false, 'no puede ofrecer una página 15 que no existe')
})

test('un conteo ausente tampoco se inventa', () => {
  const r = resumenPagina({ conteo: null, recibidas: 30, primera: 0, tamano: 30, fiable: true })
  assert.equal(r.total, null)
  assert.equal(r.hayMas, true, 'sin total, una página llena sigue significando que puede haber más')
})

test('una página vacía nunca ofrece más', () => {
  assert.equal(resumenPagina({ conteo: null, recibidas: 0, primera: 90, tamano: 30, fiable: true }).hayMas, false)
  assert.equal(resumenPagina({ conteo: 733, recibidas: 0, primera: 450, tamano: 30, fiable: false }).hayMas, false)
})

// ── esFueraDeRango: la red de seguridad ───────────────────────────────────────

test('reconoce el 416 de PostgREST por su código', () => {
  assert.equal(esFueraDeRango({ code: 'PGRST103' }), true)
})

test('lo reconoce también por el mensaje, que es lo que llegó al tablero', () => {
  assert.equal(esFueraDeRango({ message: 'Requested range not satisfiable' }), true)
})

test('cualquier otro error NO se disfraza de página vacía', () => {
  // ☠️ Tragarse un error real y devolver una lista vacía es el bug que este repo
  // ya pagó: "no hay trabajo" y "no pude leer" pasan a verse idénticos.
  assert.equal(esFueraDeRango({ code: 'PGRST116', message: 'otra cosa' }), false)
  assert.equal(esFueraDeRango({ message: 'permission denied for schema crm' }), false)
  assert.equal(esFueraDeRango(null), false)
  assert.equal(esFueraDeRango(undefined), false)
  assert.equal(esFueraDeRango({}), false)
})
