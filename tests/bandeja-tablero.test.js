// El Tablero de flujo.
//
// Pedia `/api/pedidos?rol=ADMIN` — los 680 pedidos con sus cinco tablas unidas
// (~970 kB) — y el navegador DESCARTABA 590 porque el interruptor "Ver
// despachados" arranca apagado. El 87% del peso viajaba para ser tirado.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/tablero/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/tablero.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/tablero/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('pide su endpoint propio, no la lista completa', () => {
  assert.ok(/fetch\(`\/api\/tablero/.test(src), 'debe llamar a /api/tablero')
  assert.ok(!/api\/pedidos\?rol=ADMIN/.test(src),
    'no debe volver a traer los 680 pedidos ni mandar el rol por la url')
})

test('☠️ DESPACHO no cuenta como cerrado', () => {
  // Ese estado lo pone el sistema cuando produccion marca la ultima prenda como
  // LISTO: significa "la fabrica termino", NO "ya salio". Medido el 19-ago-2026:
  // 10 pedidos asi y NINGUNO con guia. Contarlos como cerrados los sacaria del
  // tablero por defecto, y son justo los que hay que despachar.
  const cerrados = /ESTADOS_CERRADOS = \[([^\]]*)\]/.exec(sinComentarios(repo))?.[1] || ''
  assert.ok(!/DESPACHO/.test(cerrados), `DESPACHO no puede estar entre los cerrados: ${cerrados}`)
  assert.ok(/COMPLETADO/.test(cerrados) && /ENTREGADO/.test(cerrados) && /CANCELADO/.test(cerrados))
})

test('☠️ un pedido sin prendas que fabricar NO desaparece', () => {
  // `clasificarPedido` devolvia null y `.filter(x => x.clasif)` lo borraba del
  // tablero entero. Son los pedidos cuyas prendas van todas por ENTREGA EN
  // TIENDA: el 19-ago habia TRES vivos e invisibles, uno creado ese mismo dia.
  const codigo = sinComentarios(src)
  assert.ok(!/if \(activos\.length === 0\) return null/.test(codigo),
    'sin prendas NO significa que no pase nada')
  assert.ok(/if \(activos\.length === 0\) return \{ etapa: 'DESPACHO'/.test(codigo),
    'no hay nada que cortar ni producir: lo pendiente es entregarlo')
})

test('el interruptor de despachados cambia lo que se PIDE', () => {
  assert.ok(/incluirDespachados \? '\?cerrados=1' : ''/.test(src),
    'antes se traian los 590 siempre y se escondian en el navegador')
  assert.ok(/\[incluirDespachados\]/.test(src), 'y por eso tiene que recargar')
  assert.ok(/TOPE_CERRADOS/.test(repo), 'los cerrados que se traen van acotados')
})

test('los cerrados se cuentan, no se traen', () => {
  assert.ok(/count: 'exact', head: true/.test(repo),
    'el numero de despachados sale de un count, no de traer 590 filas')
})

test('el acceso por tienda se aplica en el SERVIDOR', () => {
  assert.ok(/sesionActual\(\)/.test(api), 'quien pregunta se sabe por la cookie firmada')
  assert.ok(/ROLES_POR_TIENDA/.test(api), 'solo se filtra a los roles de venta')
  assert.ok(!/searchParams\.get\('rol'\)/.test(api), 'el rol NO puede venir del navegador')
  assert.ok(!/filtrarPedidosPorTienda/.test(src), 'la pantalla ya no filtra por tienda')
})

test('mira res.ok y no quedan reintentos silenciosos', () => {
  assert.ok(/if \(!res\.ok\)/.test(src), 'sin mirar res.ok, un 401 acaba en "no hay trabajo"')
  assert.ok(!/intentos < 3/.test(src),
    'los 3 reintentos convertian un fallo en una espera y despues en un tablero vacio')
  assert.ok(/estado === 'ERROR'/.test(src) && /estado === 'INCOMPLETO'/.test(src),
    'un fallo y una lista recortada no pueden verse como un tablero sano')
})

test('solo evidencia POSITIVA marca el tablero incompleto', () => {
  // Si el conteo no llega, el peor caso es quedarse sin aviso — nunca gritar en
  // falso, que fue lo que paso el 19-ago con la alarma de los 64.
  assert.ok(/typeof total !== 'number' \|\| filas\.length >= total/.test(repo),
    'sin conteo se asume completo')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  const codigo = sinComentarios(repo)
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(codigo),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})
