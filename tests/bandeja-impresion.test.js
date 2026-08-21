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

// ─── Que no se imprima una orden INCOMPLETA (21-ago-2026) ───────────────────
//
// El 17-ago el IND-XAV-5641 salio con UNA de sus tres prendas: la pantalla nunca
// supo que las otras dos existian (tope de 1000 de PostgREST), asi que el PDF se
// genero "bien" y la fabrica produjo de menos. Verificado por posicion fisica:
// la talla M estaba en la fila 15 y las otras dos en la 1016 y la 1137.

test('☠️ el repo trae el CONTEO real de prendas, no solo las que llegaron', () => {
  assert.ok(/total_prendas:detalle_pedido\(count\)/.test(repo),
    'el count anidado NO se trunca; la lista anidada SI')
  assert.ok(/PRENDAS_TOTAL/.test(repo) && /COMPLETO/.test(repo),
    'hay que poder comparar lo que llego contra lo que hay')
})

test('solo evidencia POSITIVA marca un pedido incompleto', () => {
  // Si el conteo no llega, se asume completo: el peor caso es quedarse sin
  // aviso, nunca bloquear una impresion buena.
  assert.ok(/!hayConteo \|\| todas >= total/.test(repo))
})

test('☠️ NO se puede seleccionar un pedido incompleto', () => {
  const codigo = sinComentarios(src)
  assert.ok(/pedido\.COMPLETO === false/.test(codigo), 'toggleSelect debe bloquearlo')
  // "Seleccionar todos" no pasa por toggleSelect: sin esto se colarian en el lote.
  assert.ok(/filtered\.filter\(p => p\.COMPLETO !== false\)/.test(codigo),
    'seleccionar todos tambien debe dejarlos fuera')
})

test('☠️ la hoja impresa lleva el control en TODAS las paginas', () => {
  const pdf = readFileSync(new URL('../components/pedido/PdfPedido.js', import.meta.url), 'utf8')
  const codigo = sinComentarios(pdf)

  assert.ok(/TOTAL DEL PEDIDO/.test(codigo), 'el control tiene que verse, no ser un pie de pagina')
  assert.ok(/PRENDAS/.test(codigo) && /UNIDADES/.test(codigo),
    'dos numeros distintos: lineas del pedido y piezas fisicas')

  // ☠️ Antes esta franja iba dentro de `{paginaActual === 1 && (...)}`: quien
  // fabricaba con la hoja 2 no tenia ningun control contra el que contar.
  const franja = codigo.slice(codigo.indexOf('TOTAL DEL PEDIDO') - 600, codigo.indexOf('TOTAL DEL PEDIDO'))
  assert.ok(!/paginaActual === 1 && \($/.test(franja.trim()),
    'el control no puede estar limitado a la primera pagina')

  assert.ok(/pedido\?\.PRENDAS_TOTAL/.test(codigo),
    'las PRENDAS salen del CONTEO de la base, no de las filas que llegaron')
})

test('☠️ una hoja suelta tiene que poder identificarse sola', () => {
  // Con 3 hojas, las tres decian "esta hoja: 2 de 6": el mismo texto en todas.
  // Si se traspapelaba una, nadie lo notaba. Ahora cada hoja dice cual es y que
  // rango de prendas trae (#1–#2, #3–#4, #5–#6).
  const pdf = readFileSync(new URL('../components/pedido/PdfPedido.js', import.meta.url), 'utf8')
  const codigo = sinComentarios(pdf)
  assert.ok(/HOJA \{paginaActual\} DE \{totalPaginas\}/.test(codigo))
  assert.ok(/offsetIdx \|\| 0\) \+ 1/.test(codigo), 'el rango arranca en el offset de la hoja')
})

test('☠️ prendas y unidades NO son el mismo numero', () => {
  // El IND-XAV-5641 tenia 3 prendas pero 4 unidades (una iba x2). La franja
  // llamaba "PRENDAS" a las unidades: dos numeros distintos con el mismo nombre,
  // y quien despacha cuenta piezas.
  const pdf = readFileSync(new URL('../components/pedido/PdfPedido.js', import.meta.url), 'utf8')
  const codigo = sinComentarios(pdf)
  assert.ok(/const lineasPedido = pedido\?\.PRENDAS_TOTAL/.test(codigo))
  assert.ok(/const unidadesPedido = .*reduce.*CANTIDAD/.test(codigo))
})
