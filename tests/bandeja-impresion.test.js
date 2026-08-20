// La cola de Impresión.
//
// Pedia `/api/pedidos?rol=ADMIN` — los 683 pedidos con sus cinco tablas unidas
// (~970 kB) — para mostrar 75. Al pasar de 1000 filas PostgREST habria empezado
// a cortar EN SILENCIO y la lista dejaria de mostrar pedidos por imprimir.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { seFabrica } from '../lib/prenda-se-fabrica.js'

const src = readFileSync(new URL('../app/dashboard/impresion/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/impresion.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/impresion/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('pide su endpoint propio, no la lista completa', () => {
  assert.ok(/fetch\('\/api\/impresion'/.test(src), 'debe llamar a /api/impresion')
  assert.ok(!/api\/pedidos\?rol=ADMIN/.test(src),
    'no debe volver a traer los 683 pedidos ni mandar el rol por la url')
})

// ─── Lo que NO se manda a fabricar ──────────────────────────────────────────

test('☠️ una prenda ELIMINADA no se imprime', () => {
  // PdfPedido pintaba TODOS los items del pedido sin mirar nada: el taller
  // habria fabricado algo que se cancelo. Hoy no ha pasado (0 prendas eliminadas
  // en toda la base, 0 eliminaciones en la bitacora), pero la funcion existe.
  assert.strictEqual(seFabrica({ subestado: 'ELIMINADO' }), false)
  assert.strictEqual(seFabrica({ subestado: 'SOLICITADO', eliminado: true }), false)
})

test('☠️ una prenda de ENTREGA EN TIENDA no se imprime', () => {
  // No hay nada que fabricar con ellas. Se estaban imprimiendo: 3 el 19-ago.
  assert.strictEqual(seFabrica({ subestado: 'ENTREGADO_TIENDA' }), false)
})

test('lo que SI se fabrica sigue imprimiendose', () => {
  for (const sub of ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', '']) {
    assert.strictEqual(seFabrica({ subestado: sub }), true, `${sub || '(vacio)'} deberia imprimirse`)
  }
  // El subestado compuesto por area tambien.
  assert.strictEqual(seFabrica({ subestado: 'ESTAMPADO:LISTO|BORDADO:EN_PROCESO' }), true)
})

test('el filtro no se deja engañar por mayusculas ni por null', () => {
  assert.strictEqual(seFabrica({ subestado: 'eliminado' }), false)
  assert.strictEqual(seFabrica({ subestado: 'entregado_tienda' }), false)
  assert.strictEqual(seFabrica(null), false)
  assert.strictEqual(seFabrica({}), true, 'sin subestado es una prenda normal')
})

test('el filtro se aplica en el REPO, no en el PDF', () => {
  assert.ok(/\.filter\(seFabrica\)/.test(repo),
    'si se dejara al PDF, cualquier otro consumidor volveria a imprimir lo eliminado')
})

// ─── El estado fantasma ─────────────────────────────────────────────────────

test('☠️ ya no se filtra por PENDIENTE_FABRICA, que no existe', () => {
  // CERO pedidos lo han tenido nunca. La condicion estaba copiada en cinco
  // archivos haciendo creer que era parte del flujo.
  assert.ok(!/PENDIENTE_FABRICA/.test(sinComentarios(src)),
    'ese estado no existe: filtrar por el solo confunde a quien lea el codigo')
  assert.ok(/\.eq\('estado_pedido', 'EN_FABRICA'\)/.test(repo), 'el filtro real va en la base')
})

// ─── Pestañas ───────────────────────────────────────────────────────────────

test('la pestaña "Todos" se fue y la busqueda la reemplaza', () => {
  const codigo = sinComentarios(src)
  assert.ok(!/F_TODOS/.test(codigo), 'era la union exacta de las otras dos (10 + 65 = 75)')
  // Sin esto, quitar la pestaña obligaria a adivinar en cual esta cada pedido.
  assert.ok(/if \(!busqueda\) \{/.test(codigo),
    'buscando, la pestaña no puede limitar: el pedido aparece este impreso o no')
})

test('el orden FIFO lo pone la base', () => {
  assert.ok(/\.order\('unique_id', \{ ascending: true \}\)/.test(repo),
    'lo que lleva mas esperando se imprime primero')
})

test('avisa si la lista llego incompleta', () => {
  assert.ok(/completo === false/.test(src), 'imprimir a ciegas una lista recortada es peor que no imprimir')
  assert.ok(/typeof count !== 'number' \|\| filas\.length >= count/.test(repo),
    'solo evidencia POSITIVA marca la lista incompleta')
})

test('la identidad sale de la cookie', () => {
  assert.ok(/sesionActual\(\)/.test(api))
  assert.ok(!/searchParams\.get\('rol'\)/.test(api), 'el rol NO puede venir del navegador')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(sinComentarios(repo)),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})
