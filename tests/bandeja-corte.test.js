// La bandeja de CORTE, vigilada desde la fuente.
//
// Comía de `/api/pedidos`: 663 filas y 972 kB para trabajar sobre 136 prendas, y
// con ello heredaba el tope de 1000 filas de PostgREST — el mismo que dejó 21
// pedidos invisibles en Producción durante 14 días. Ahora pide solo los pedidos
// EN_FABRICA con sus prendas de taller: 204 filas.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/corte/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/corte.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/corte/route.js', import.meta.url), 'utf8')

// Sin comentarios: la nota que documenta un bug suele contener el patrón que la
// prueba persigue, y entonces la prueba se cita a sí misma.
const codigo = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('pide su endpoint propio, no la lista completa', () => {
  assert.ok(src.includes("'/api/corte'"), 'debe llamar a /api/corte')
  assert.ok(!src.includes('/api/pedidos?rol=ADMIN'),
    'no debe volver a traer los 663 pedidos ni mandar el rol por la url')
})

test('el servidor filtra por EN_FABRICA sobre la vista del taller', () => {
  assert.ok(/\.eq\('estado_pedido', 'EN_FABRICA'\)/.test(repo),
    'el filtro de estado va en la consulta, no en el navegador')
  assert.ok(/prendas_en_taller/.test(repo),
    'las prendas salen de la vista, que ya excluye ELIMINADO y ENTREGADO_TIENDA')
  assert.ok(!/ESTADO_PEDIDO === 'EN_FABRICA'/.test(codigo(src)),
    'la pantalla no debe volver a filtrar lo que el servidor ya filtro')
})

test('corte ve TODAS las areas: no se reparte como produccion', () => {
  assert.ok(!/prendaEsDelUsuario|areasDeUsuario/.test(repo),
    'corte corta la tela de estampado, sublimacion y bordado — filtrar por area le escondería trabajo')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(codigo(repo)),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})

test('mira res.ok en la CARGA de la bandeja', () => {
  // Ojo: `res.ok` aparece tambien en el boton de cortar, y esa si estaba. La que
  // importa es la del cargador — sin ella un 401 se veia como bandeja vacia.
  const cargador = src.slice(src.indexOf('const loadItems'), src.indexOf('function handleCorteChange'))
  assert.ok(/if \(!res\.ok\)/.test(cargador),
    'sin mirar res.ok, un 401 o un 500 acaban en "no hay nada que cortar"')
})

test('usa estadoBandeja y no quedan reintentos silenciosos', () => {
  assert.ok(src.includes('estadoBandeja'), 'la decision vive en lib/bandeja-estado.js')
  assert.ok(!/intentos\s*<\s*3/.test(src),
    'los reintentos convertian un fallo en una espera y despues en "todo cortado"')
})

test('un pedido al que le faltan prendas NO se esconde', () => {
  // El `.filter(items.length > 0)` de antes borraba de la pantalla justo al
  // pedido que llego incompleto: el unico que habia que mirar.
  assert.ok(/itemsFiltrados\.length > 0 \|\| p\.COMPLETO === false/.test(codigo(src)),
    'el pedido incompleto debe sobrevivir al filtro para poder recuperarlo')
  assert.ok(/pedido\.COMPLETO === false/.test(codigo(src)),
    'el boton de recuperacion se decide por COMPLETO, nunca por items.length')
})

test('el contador cuenta solo lo que falta cortar', () => {
  // Contando tambien lo ya cortado, el numero no bajaba por mas que se trabajara:
  // la bandeja no podia llegar a cero y no informaba de nada.
  assert.ok(/const porCortar = \(contadores\.PENDIENTE \|\| 0\) \+ \(contadores\.SOLICITADO \|\| 0\)/.test(src),
    'el encabezado debe contar pendiente + solicitado, no todos los items')
})

test('la identidad sale de la cookie y la bandeja es de corte', () => {
  assert.ok(/sesionActual\(\)/.test(api), 'quien pregunta se sabe por la cookie firmada')
  assert.ok(/ROLES_PERMITIDOS = \['ADMIN', 'CORTE'\]/.test(api),
    'esconder la pantalla no es un control de acceso: la API se pedia igual')
  assert.ok(!/searchParams/.test(api), 'la ruta no debe aceptar parametros del navegador')
})

test('el aviso de bandeja incompleta se registra CON await', () => {
  assert.ok(/await registrarEvento/.test(api),
    'sin await la funcion serverless se congela y el evento se pierde justo cuando habia algo que contar')
})
