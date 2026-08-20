// El Calendario de entregas.
//
// Pedia `/api/pedidos?rol=ADMIN` — los 683 pedidos con sus cinco tablas unidas
// (~970 kB) — para pintar UN mes. Al pasar de 1000 filas PostgREST habria
// empezado a cortar en silencio y habria perdido entregas.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/calendario/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/calendario.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/calendario/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('pide su endpoint propio, por MES', () => {
  assert.ok(/fetch\(`\/api\/calendario\?mes=/.test(src), 'debe pedir el mes que se esta viendo')
  assert.ok(!/api\/pedidos\?rol=ADMIN/.test(src),
    'no debe volver a traer los 683 pedidos ni mandar el rol por la url')
})

test('☠️ el rango de fechas se compara en UTC, NO en hora de Ecuador', () => {
  // `fecha_entrega_prometida` es timestamptz pero guarda una FECHA: el
  // formulario manda "2026-08-23" y Postgres lo escribe como 00:00 UTC. Medido
  // el 20-ago-2026: los 681 pedidos con fecha estan a las 00:00 UTC.
  // Convertir a Ecuador restaria 5 horas y correria CADA entrega al dia anterior.
  const codigo = sinComentarios(repo)
  assert.ok(/T00:00:00Z/.test(codigo), 'los limites del mes van en UTC')
  assert.ok(!/America\/Guayaquil/.test(codigo),
    'convertir a Ecuador correria todas las entregas un dia atras')
})

test('los atrasados vienen aunque sean de otro mes', () => {
  // Si no, el rojo de "esto ya vencio" desaparece al cambiar de mes — que es
  // justo cuando hay que verlo.
  const codigo = sinComentarios(repo)
  assert.ok(/\.lt\('fecha_entrega_prometida', inicio\)/.test(codigo), 'debe traer lo anterior al mes')
  assert.ok(/\.not\('estado_pedido', 'in'/.test(codigo), 'pero solo lo que sigue abierto')
})

test('un pedido no puede salir dos veces', () => {
  assert.ok(/vistos\.has\(p\.pedido_id\)/.test(sinComentarios(repo)),
    'el mes y los atrasados podrian solaparse')
})

test('la grilla NO trae fotos ni detalles', () => {
  // Traer fotos de 250 pedidos para que alguien abra uno era el problema.
  const cols = /const COLS_PRENDA = \[([^\]]*)\]/.exec(sinComentarios(repo))?.[1] || ''
  assert.ok(!/foto_/.test(cols), `la grilla no pinta fotos: ${cols}`)
  assert.ok(!/detalle_personalizado/.test(cols), 'ni detalles')
})

test('la hoja de confeccion pide el pedido COMPLETO', () => {
  const codigo = sinComentarios(src)
  assert.ok(/fetch\(`\/api\/pedidos\/\$\{p\.PEDIDO_ID\}`/.test(codigo),
    'sin esto la preview saldria sin fotos ni detalles')
  assert.ok(/\.filter\(seFabrica\)/.test(codigo),
    'y no puede incluir eliminadas ni entrega en tienda: no hay nada que fabricar')
})

test('el acceso por tienda se aplica en el SERVIDOR', () => {
  assert.ok(/sesionActual\(\)/.test(api), 'quien pregunta se sabe por la cookie firmada')
  assert.ok(/ROLES_POR_TIENDA/.test(api), 'solo se filtra a los roles de venta')
  assert.ok(!/filtrarPedidosPorTienda/.test(src), 'la pantalla ya no filtra por tienda')
})

test('mira res.ok y no quedan reintentos silenciosos', () => {
  assert.ok(/if \(!res\.ok\)/.test(src), 'sin mirar res.ok, un 401 acaba en "mes sin entregas"')
  assert.ok(!/intentos < 3/.test(src),
    'los 3 reintentos convertian un fallo en una espera y despues en un mes vacio')
  assert.ok(/completo === false/.test(src), 'y si el mes llego recortado, se dice')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(sinComentarios(repo)),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})

test('☠️ ATRASADOS cuenta todos, no solo los del mes visible', () => {
  // El 20-ago la pantalla decia 19 cuando habia 22 pedidos vencidos y sin
  // entregar: los otros 3 vencieron en julio y seguian abiertos. Un contador de
  // atrasados que se reinicia cada mes es justo el que no hay que creer.
  const codigo = sinComentarios(src)
  assert.ok(/if \(k === 'red'\) conteo\.red\+\+/.test(codigo),
    'el rojo se cuenta fuera del bloque `delMes`')
  assert.ok(/if \(delMes\) \{[\s\S]{0,200}?if \(k === 'amb' \|\| k === 'grn'\) conteo\[k\]\+\+/.test(codigo),
    'los demas si son del mes')
})
