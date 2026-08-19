// La bandeja de Despacho, vigilada desde la fuente.
//
// Traía los 661 pedidos de `/api/pedidos` —969 kB para pintar 20— porque su
// pestaña "Completados" necesitaba los 590 cerrados. Eso la dejaba expuesta al
// mismo tope de 1000 filas de PostgREST que dejó 21 pedidos invisibles en
// Producción durante 14 días: `crm.pedidos` va por 661 y cruza las 1000 en
// septiembre de 2026.
//
// Ahora pide solo lo vivo (71) y los cerrados se consultan en Historial.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/despacho/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/despacho.js', import.meta.url), 'utf8')

test('pide su endpoint propio, no la lista completa', () => {
  assert.ok(src.includes("'/api/despacho'"), 'debe llamar a /api/despacho')
  assert.ok(!src.includes('/api/pedidos?rol=ADMIN'),
    'no debe volver a traer los 661 pedidos ni mandar el rol por la url')
})

test('el servidor excluye los cerrados: son los que traian el riesgo del tope', () => {
  assert.ok(/not\('estado_pedido', 'in'/.test(repo),
    'la consulta debe excluir COMPLETADO/ENTREGADO/CANCELADO en el servidor')
})

test('los cerrados se cuentan, no se traen', () => {
  assert.ok(/count: 'exact', head: true/.test(repo),
    'el numero de despachados sale de un count, no de traer 590 filas')
})

test('mira res.ok antes de creerle a la respuesta', () => {
  assert.ok(/res\.ok/.test(src), 'sin mirar res.ok, un 401 o un 500 acaban en "todo despachado"')
})

test('usa estadoBandeja y no quedan reintentos silenciosos', () => {
  assert.ok(src.includes('estadoBandeja'), 'la decision vive en lib/bandeja-estado.js')
  assert.ok(!/intentos\s*<\s*3/.test(src),
    'los reintentos convertian un fallo en una espera y despues en "todo despachado"')
})

test('el contador cuenta solo lo que se puede despachar hoy', () => {
  // Con todo lo no cerrado, la bandeja nunca llegaba a cero: 71 de los cuales 66
  // seguian en fabrica. Una bandeja que no puede vaciarse no informa de nada.
  assert.ok(/const pendienteCount = listosCount/.test(src),
    'el contador debe ser el de listos para salir, no el de todo lo vivo')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  const codigo = repo.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(codigo),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})
