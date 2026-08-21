// El Historial, paginado por el servidor.
//
// Pedia `/api/pedidos?rol=ADMIN`: los 680 pedidos con sus cinco tablas unidas
// (~970 kB) para pintar 30, y despues filtraba y paginaba en el navegador. Con
// crm.pedidos en 680 y creciendo 72/semana, en ~4 semanas PostgREST habria
// empezado a cortar en 1000 EN SILENCIO y el Historial dejaria de encontrar
// pedidos viejos — que es su unico trabajo, y es a donde mandamos a Despacho a
// buscar los cerrados.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/historial/page.js', import.meta.url), 'utf8')
const repo = readFileSync(new URL('../lib/db/historial.js', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/historial/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('pide su endpoint propio, no la lista completa', () => {
  assert.ok(/fetch\(`\/api\/historial\?/.test(src), 'debe llamar a /api/historial')
  assert.ok(!/api\/pedidos\?\$\{query\}|rol=ADMIN/.test(src),
    'no debe volver a traer los 680 pedidos ni mandar el rol por la url')
})

test('☠️ no queda ninguna funcion llamada que no exista', () => {
  // El build de Next NO caza esto: `loadPedidos(u)` compilo perfecto despues de
  // renombrar la funcion, y habria reventado al abrir la pantalla.
  const codigo = sinComentarios(src)
  const definidas = new Set([
    ...[...codigo.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    ...[...codigo.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g)].map((m) => m[1]),
  ])
  const llamadas = [...codigo.matchAll(/(?<![.\w$])(load[A-Z]\w*|cargar[A-Z]\w*)\s*\(/g)].map((m) => m[1])
  for (const nombre of new Set(llamadas)) {
    assert.ok(definidas.has(nombre), `se llama a ${nombre}() y no esta definida en la pantalla`)
  }
})

test('el servidor pagina de verdad: range, no slice', () => {
  assert.ok(/\.range\(primera, primera \+ TAMANO_PAGINA - 1\)/.test(repo),
    'la pagina la corta la base')
  assert.ok(/count: 'exact'/.test(repo), 'el total tiene que salir de un count, no de contar lo traido')
  assert.ok(!/\.slice\(0, visibles\)/.test(src), 'ya no se recorta una lista que estaba entera en el navegador')
})

test('ordena por NUMERO, no comparando textos', () => {
  assert.ok(/\.order\('unique_id', \{ ascending: false \}\)/.test(repo),
    'ordenar por PEDIDO_ID como texto pone MAN- antes que IND-, o sea por tienda')
})

test('la pantalla ya no vuelve a filtrar lo que el servidor filtro', () => {
  const codigo = sinComentarios(src)
  assert.ok(/const filtered = pedidos\b/.test(codigo),
    'sobre una pagina de 30, filtrar otra vez esconderia lo que el servidor decidio mostrar')
  assert.ok(!/coincideBusqueda\(p, busquedaDebounced\)/.test(codigo), 'la busqueda va en la base')
  assert.ok(!/filtrarPedidosPorTienda/.test(codigo), 'el acceso por tienda se aplica en el servidor')
})

test('el alcance del rol se decide en el SERVIDOR, contra la cookie', () => {
  assert.ok(/sesionActual\(\)/.test(api), 'quien pregunta se sabe por la cookie firmada')
  assert.ok(/aplicarAlcance/.test(repo), 'el repo restringe segun el rol')
  assert.ok(/rol === 'VENDEDOR_YAW'/.test(repo) && /rol === 'VENDEDOR'/.test(repo),
    'YAW solo su tienda, VENDEDOR solo lo suyo')
  assert.ok(!/searchParams\.get\('rol'\)/.test(api), 'el rol NO puede venir del navegador')
})

test('sin tiendas asignadas NO se restringe', () => {
  // Mismo criterio que lib/tiendasUsuario.js: un dato faltante no puede dejar a
  // nadie sin ver su trabajo. Para restringir hay que asignar tiendas.
  assert.ok(/if \(suyas\.length\) consulta = consulta\.in\('tienda_id', suyas\)/.test(repo),
    'solo se filtra por tienda si tiene alguna asignada')
})

test('mira res.ok y no quedan reintentos silenciosos', () => {
  assert.ok(/if \(!res\.ok\)/.test(src), 'sin mirar res.ok, un 401 acaba en "no hay registros"')
  assert.ok(!/intentos < 3/.test(src),
    'los 3 reintentos convertian un fallo en una espera larga y despues en una lista vacia')
  assert.ok(/estado === 'ERROR'/.test(src), 'un fallo no se puede ver igual que "no hay nada"')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  const codigo = sinComentarios(repo)
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(codigo),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})

test('la busqueda por cliente NO se recorta a 50 en silencio', () => {
  // searchClientes tope a 50 porque alimenta un desplegable, y "maria" ya trae
  // 49 clientes reales: a la clienta 51 el Historial habria empezado a perder
  // pedidos sin avisar. Es el mismo modo de falla de siempre, entrando por la
  // puerta de atras.
  //
  // ⚠️ Esta prueba EXIGIA `tope = 2000` y `ids.length >= tope`, o sea que estaba
  // cristalizando el bug: 2000 esta POR ENCIMA del corte de PostgREST, y con 1000
  // filas devueltas "1000 >= 2000" es false. La guardia iba a callar justo al
  // truncarse. El detalle vive en tests/lecturas-no-se-truncan.test.js.
  const clientes = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
  assert.ok(/idsClientesQueCoinciden/.test(repo),
    'el historial no puede resolver clientes con el buscador del desplegable')
  assert.ok(/count: 'exact'/.test(clientes), 'el aviso sale del conteo real, no de un umbral')
  assert.ok(/ids\.length < count/.test(clientes), 'y si llegaron menos de los que hay, se dice')
  assert.ok(/busquedaTruncada/.test(src), 'la pantalla debe avisar cuando se recorto')
})
