// El NUMERO de cotizacion y su ESTADO.
//
// ☠️ El numero lo inventaba el NAVEGADOR con Math.random() entre 1 y 999, y ni
// el cliente ni la base impedian que se repitiera: con quince cotizaciones en
// un dia habia un 10% de que dos salieran con el mismo. Ademas el campo se
// editaba a mano. Dos clientes con «COT-20260910-042» distintas es el tipo de
// error que se descubre cuando uno de los dos reclama.
//
// ☠️ El estado existia en el modelo y en la base (con CHECK), pero el
// formulario pintaba un badge FIJO «⏳ Borrador» y no habia forma de
// cambiarlo: ninguna cotizacion paso nunca de borrador.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  prefijoNumero, numeroSiguiente, nuevaCotizacion, esEstadoValido,
  ESTADOS, ESTADO_COT_LABEL, ESTADO_COT_CLASES, NUMERO_PENDIENTE,
} from '../lib/cotizacion.js'

const fuente = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')

// ── El numero ────────────────────────────────────────────────────────────────

test('el prefijo es COT-AAAAMMDD- con la fecha de Ecuador', () => {
  // 2026-09-11 02:00 UTC es todavia 10 de septiembre en Ecuador (UTC-5).
  assert.equal(prefijoNumero(new Date('2026-09-11T02:00:00Z')), 'COT-20260910-')
  assert.equal(prefijoNumero(new Date('2026-09-11T12:00:00Z')), 'COT-20260911-')
})

test('el primero del dia es 001', () => {
  assert.equal(numeroSiguiente('COT-20260910-', []), 'COT-20260910-001')
})

test('sigue al mayor, no al ultimo ni al que haya mas', () => {
  const p = 'COT-20260910-'
  assert.equal(numeroSiguiente(p, [p + '001', p + '002']), p + '003')
  assert.equal(numeroSiguiente(p, [p + '007', p + '002', p + '004']), p + '008')
})

test('☠️ nunca devuelve uno que ya existe', () => {
  const p = 'COT-20260910-'
  const existentes = []
  for (let i = 0; i < 50; i++) {
    const n = numeroSiguiente(p, existentes)
    assert.ok(!existentes.includes(n), `repetido: ${n}`)
    existentes.push(n)
  }
})

test('☠️ el maximo se busca como NUMERO, no ordenando texto', () => {
  // «1000» ordena ANTES que «999» como cadena; con el maximo mal calculado el
  // siguiente seria 1000 otra vez y chocaria con el indice unico.
  const p = 'COT-20260910-'
  assert.equal(numeroSiguiente(p, [p + '999', p + '1000']), p + '1001')
})

test('los de otro dia no cuentan', () => {
  assert.equal(numeroSiguiente('COT-20260910-', ['COT-20260909-041', 'COT-20260909-042']), 'COT-20260910-001')
})

test('basura en la lista no rompe la cuenta', () => {
  const p = 'COT-20260910-'
  assert.equal(numeroSiguiente(p, [null, undefined, '', 'COT-', p + 'abc', p + '002']), p + '003')
})

test('☠️ una cotizacion nueva NO trae numero: lo pone el servidor', () => {
  assert.equal(nuevaCotizacion().numero, '')
  assert.ok(NUMERO_PENDIENTE.length > 0)
})

test('☠️ createCotizacion asigna el numero y reintenta si otro lo tomo primero', () => {
  const repo = sinComentarios(fuente('../lib/db/cotizaciones.js'))
  const fn = repo.slice(repo.indexOf('export async function createCotizacion'))
  assert.ok(/numeroSiguiente\(prefijo/.test(fn), 'el numero sale de numeroSiguiente')
  assert.ok(/\.\.\.pick\(data\), numero/.test(fn), 'y PISA el que venga del cliente (va despues del spread)')
  assert.ok(/23505/.test(repo), 'reconoce la violacion de indice unico')
  assert.ok(/for \(let intento = 0/.test(fn), 'y reintenta')
  assert.ok(/\.like\('numero'/.test(repo) && /\.limit\(/.test(repo), 'la lectura del dia esta acotada')
})

test('☠️ el PATCH no deja cambiar el numero', () => {
  const ruta = sinComentarios(fuente('../app/api/cotizaciones/[id]/route.js'))
  const patch = ruta.slice(ruta.indexOf('export async function PATCH'))
  const spread = patch.indexOf('...patch')
  const numero = patch.indexOf('numero: permiso.row.numero')
  assert.ok(spread >= 0 && numero > spread, 'el numero se pisa DESPUES de expandir el patch')
})

test('☠️ el formulario ya no tiene un input para el numero', () => {
  const form = sinComentarios(fuente('../components/cotizaciones/CotizacionForm.js'))
  assert.ok(!/updCot\('numero'/.test(form), 'volvio el numero editable a mano')
  assert.ok(/NUMERO_PENDIENTE/.test(form), 'y muestra que esta pendiente hasta guardar')
})

test('el indice unico esta en el repo, junto a las otras migraciones', () => {
  const sql = fuente('../docs/sql/2026-09-10-cotizaciones-numero-unico.sql')
  assert.ok(/create unique index/i.test(sql))
  assert.ok(/crm\.cotizaciones \(numero\)/.test(sql))
})

// ── El estado ────────────────────────────────────────────────────────────────

test('los cuatro estados tienen etiqueta y color, y nada mas los tiene', () => {
  assert.deepEqual(Object.keys(ESTADO_COT_LABEL).sort(), [...ESTADOS].sort())
  assert.deepEqual(Object.keys(ESTADO_COT_CLASES).sort(), [...ESTADOS].sort())
})

test('esEstadoValido acepta la lista y rechaza el resto', () => {
  for (const e of ESTADOS) assert.ok(esEstadoValido(e), e)
  for (const e of ['', null, undefined, 'BORRADOR', 'pagada', 'enviado', 0]) assert.ok(!esEstadoValido(e), String(e))
})

test('☠️ el PATCH rechaza un estado invalido con 400, no con el texto del CHECK', () => {
  const ruta = sinComentarios(fuente('../app/api/cotizaciones/[id]/route.js'))
  const patch = ruta.slice(ruta.indexOf('export async function PATCH'))
  assert.ok(/esEstadoValido\(patch\.estado\)/.test(patch))
  assert.ok(/status: 400/.test(patch))
})

test('☠️ el estado ya no es un badge fijo: se puede cambiar', () => {
  const form = sinComentarios(fuente('../components/cotizaciones/CotizacionForm.js'))
  assert.ok(!/⏳ Borrador/.test(form), 'volvio el badge fijo')
  assert.ok(/ESTADOS\.map/.test(form), 'hay un boton por estado')
  assert.ok(/h\.cambiarEstado\(/.test(form))
})

test('cambiar el estado de una cotizacion guardada se persiste al instante', () => {
  const hook = sinComentarios(fuente('../components/cotizaciones/useCotizacion.js'))
  const fn = hook.slice(hook.indexOf('const cambiarEstado'), hook.indexOf('const armarPdf'))
  assert.ok(/method: 'PATCH'/.test(fn), 'PATCH inmediato')
  assert.ok(/JSON\.stringify\(\{ estado \}\)/.test(fn), 'y SOLO ese campo: no arrastra lo demas sin guardar')
  assert.ok(/estado: anterior/.test(fn), 'si falla, vuelve atras en pantalla')
})

test('☠️ compartir de verdad marca «enviada»; solo descargar, NO', () => {
  const hook = sinComentarios(fuente('../components/cotizaciones/useCotizacion.js'))
  const fn = hook.slice(hook.indexOf('const compartirWhatsApp'))
  const share = fn.indexOf('await navigator.share(')
  const marca = fn.indexOf("cambiarEstado('enviada')")
  const descarga = fn.indexOf('pdf.save(nombre)')
  assert.ok(share >= 0 && marca > share, 'se marca DESPUES de que la hoja de compartir resolvio')
  assert.ok(descarga > marca, 'y el camino de descarga viene despues, sin marcar')
  assert.equal((fn.match(/cambiarEstado\('enviada'\)/g) || []).length, 1, 'una sola marca, en el camino confirmado')
})

test('el historial muestra el estado de cada cotizacion', () => {
  const hist = sinComentarios(fuente('../app/dashboard/historial/page.js'))
  assert.ok(/ESTADO_COT_LABEL\[c\.estado\]/.test(hist))
})

// ── Compartir una nueva la guarda primero, sin desmontar el formulario ──────

test('☠️ una cotizacion nueva se guarda antes de generar el PDF', () => {
  const hook = sinComentarios(fuente('../components/cotizaciones/useCotizacion.js'))
  const fn = hook.slice(hook.indexOf('const armarPdf'), hook.indexOf('const nombreArchivo'))
  assert.ok(/if \(!cotizacion\.id\)/.test(fn) && /await save\(\)/.test(fn))
})

test('☠️ crear no navega con router.replace: mataria el PDF en curso', () => {
  const page = sinComentarios(fuente('../app/dashboard/cotizacion/page.js'))
  assert.ok(!/onCreated=\{\(id\) => router\.replace/.test(page), 'volvio el router.replace')
  assert.ok(/history\.replaceState/.test(page), 'la URL cambia sin desmontar')
})
