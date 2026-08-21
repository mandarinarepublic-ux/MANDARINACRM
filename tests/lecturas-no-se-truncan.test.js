// Las dos lecturas que podían cortarse EN SILENCIO, cerradas el 21-ago-2026.
//
// PostgREST devuelve como mucho 1000 filas, con `error: null`. No avisa. El
// IND-XAV-5641 se imprimió con UNA de sus tres prendas por esto y la fábrica
// produjo de menos.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const clientes = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
const pedidos  = readFileSync(new URL('../lib/db/pedidos.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// ─── La guardia que iba a mentir ────────────────────────────────────────────

test('☠️ el aviso de busqueda truncada sale del CONTEO, no de un umbral', () => {
  const codigo = sinComentarios(clientes)
  const fn = codigo.slice(codigo.indexOf('export async function idsClientesQueCoinciden'))
    .slice(0, 900)

  assert.ok(/count: 'exact'/.test(fn), 'el count de PostgREST NO se trunca; la lista SI')
  assert.ok(/ids\.length < count/.test(fn),
    'truncado = llegaron menos de los que hay. Evidencia positiva, no corazonada')
  assert.ok(!/ids\.length >= tope/.test(fn),
    'con tope 2000 y corte en 1000, "1000 >= 2000" es false: el aviso callaba justo al truncarse')
})

test('el tope no puede pasarse del corte de PostgREST', () => {
  const m = clientes.match(/idsClientesQueCoinciden\(q, tope = (\d+)\)/)
  assert.ok(m, 'la funcion declara su tope')
  assert.ok(Number(m[1]) <= 1000, `pedir ${m[1]} no trae ${m[1]}: PostgREST corta en 1000 y no avisa`)
})

test('sin conteo NO se inventa el aviso', () => {
  // El peor caso es quedarse sin aviso, nunca inventarlo: un cartel de
  // "busqueda incompleta" sobre una busqueda sana entrena a ignorarlo.
  assert.ok(/hayConteo && ids\.length < count/.test(sinComentarios(clientes)))
})

// ─── El lector que estaba a 31 filas ────────────────────────────────────────

test('☠️ las tablas hijas se piden POR TANDAS, nunca de un tiro', () => {
  const codigo = sinComentarios(pedidos)

  // Medido el 21-ago-2026: 500 pedidos = 969 prendas. 31 filas del corte.
  assert.ok(/porTandas\(sb, 'detalle_pedido'/.test(codigo),
    'los 500 pedidos de una sentencia daban 969 prendas: a 16 pedidos de cortar en silencio')
  assert.ok(/porTandas\(sb, 'pagos'/.test(codigo))
  assert.ok(/porTandas\(sb, 'guias_despacho'/.test(codigo))

  assert.ok(!/sb\.from\('detalle_pedido'\)\.select\('\*'\)\.eq\('eliminado', false\)\.in\(/.test(codigo),
    'la consulta unica no puede volver por la puerta de atras')
})

test('la tanda deja margen aunque crezcan las prendas por pedido', () => {
  const m = pedidos.match(/const PEDIDOS_POR_TANDA = (\d+)/)
  assert.ok(m, 'el tamaño de tanda esta declarado y nombrado')
  const tanda = Number(m[1])
  // Promedio medido: 1.94 prendas por pedido (1328/700). Aun al DOBLE, una
  // tanda tiene que quedar holgadamente por debajo de 1000.
  assert.ok(tanda * 4 < 1000,
    `${tanda} pedidos por tanda: con 4 prendas por pedido ya rozaria el corte`)
})

test('porTandas NO se come filas si hay ids repetidos o vacios', () => {
  const fn = sinComentarios(pedidos).slice(sinComentarios(pedidos).indexOf('async function porTandas'),
    sinComentarios(pedidos).indexOf('async function porTandas') + 700)
  assert.ok(/new Set\(/.test(fn), 'los ids repetidos inflarian la URL sin traer nada nuevo')
  assert.ok(/\.filter\(Boolean\)/.test(fn), 'un id vacio en el .in() ensucia la consulta')
  assert.ok(/if \(limpios\.length === 0\) return \[\]/.test(fn),
    'sin ids no se consulta: un .in() vacio devuelve cosas raras segun el backend')
})
