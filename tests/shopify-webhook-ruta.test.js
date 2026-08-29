import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const ruta = readFileSync(new URL('../app/api/shopify/pedidos/route.js', import.meta.url), 'utf8')

test('☠️ lee el cuerpo CRUDO antes de parsear, o la firma nunca cuadra', () => {
  assert.ok(/await\s+req\.text\(\)/.test(ruta), 'tiene que usar req.text(), no req.json()')
  assert.ok(!/await\s+req\.json\(\)/.test(ruta), 'req.json() rompe la verificación del HMAC')
})

test('☠️ MIRA res.ok en la llamada a /api/pedidos — la lección de LINKPAGO', () => {
  // El patrón real, no solo que la cadena "res.ok" aparezca en algún lado: con
  // /res\.ok|\.ok\b/ una lógica INVERTIDA (`if (res.ok) { tratar como error }`)
  // pasaría igual. Exige el `if (!res.ok)` puntual.
  assert.ok(/if\s*\(\s*!res\.ok\s*\)/.test(ruta), 'tiene que ser exactamente if (!res.ok), no cualquier mención de .ok')
})

test('☠️ si la creación falla, avisa por Telegram', () => {
  assert.ok(/notificarPedidoWebFallido/.test(ruta), 'un pedido que no entra tiene que hacer ruido')
})

test('los avisos se ESPERAN, no van fire-and-forget', () => {
  assert.ok(/await\s+notificarPedidoWebSinPagar/.test(ruta), 'en serverless un aviso sin await se pierde')
  assert.ok(/await\s+notificarPedidoWebFallido/.test(ruta))
})

test('le contesta 200 a Shopify aunque algo falle, o borra la suscripción', () => {
  assert.ok(/status:\s*200|Response\.json\(\s*\{\s*ok/.test(ruta))
})

// ☠️ RONDA 1: el middleware protege TODA /api/* con cookie o token de máquina.
// Shopify no manda ninguno de los dos — la ruta se defiende sola con el HMAC —
// así que sin este permiso el webhook nunca llega a pasar de aquí: 401 antes de
// tocar route.js, firma válida o no.
const middleware = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')

/** Solo las entradas REALES de RUTAS_PUBLICAS, nunca las que aparecen dentro de
 * un comentario (como la de /api/factura-callback, que se sacó a propósito). */
function listaRutasPublicas(texto) {
  const bloque = texto.match(/RUTAS_PUBLICAS\s*=\s*\[([\s\S]*?)\n\]/)
  if (!bloque) return []
  return bloque[1]
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, '')) // corta todo desde el '//' de esa línea
    .map((linea) => linea.match(/'([^']+)'/))
    .filter(Boolean)
    .map((m) => m[1])
}

const rutasPublicas = listaRutasPublicas(middleware)

test('/api/shopify/pedidos está en RUTAS_PUBLICAS — sin esto el webhook nunca llega a la ruta', () => {
  assert.ok(rutasPublicas.includes('/api/shopify/pedidos'), rutasPublicas.join(', '))
})

test('☠️ /api/pedidos NO está en RUTAS_PUBLICAS — esa ruta saca al vendedor de la cookie', () => {
  // Comparación EXACTA contra la lista (nunca .includes() de texto): con
  // subcadena, '/api/shopify/pedidos' contiene a '/api/pedidos' y la prueba
  // pasaría siempre, sin importar lo que diga el archivo — justo lo que no
  // queremos. Si esto se abriera, cualquiera crearía pedidos a nombre de
  // cualquier vendedor sin sesión.
  assert.ok(!rutasPublicas.includes('/api/pedidos'), rutasPublicas.join(', '))
})

// ☠️ RONDA 2: orders/create y orders/paid del MISMO pedido llegan con
// milisegundos de diferencia. Sin ramificar por el tema, los dos pasan el
// select de "¿ya entró?" a la vez y los dos crean un pedido — el caso NORMAL,
// no uno raro.

test('ramifica por X-Shopify-Topic: orders/paid es el único tema que crea el pedido', () => {
  assert.ok(/x-shopify-topic/i.test(ruta), 'tiene que leer la cabecera del tema')
  assert.ok(/orders\/paid/.test(ruta), 'orders/paid es el único camino de creación')
  assert.ok(/orders\/create/.test(ruta), 'orders/create solo avisa si viene sin pagar')
})

test('☠️ un orders/create pagado NO crea nada — se lo deja a orders/paid', () => {
  // Si esto faltara, un pedido pagado entraría dos veces casi siempre: es la
  // secuencia normal de Shopify, no una carrera rara.
  assert.ok(/topic === 'orders\/create'/.test(ruta))
  assert.ok(/estaPagado\(order\)/.test(ruta))
})

test('☠️ revisa el error al marcar shopify_order_id — si falla en silencio, el próximo reintento duplica', () => {
  assert.ok(/const\s*\{\s*error:\s*\w+\s*\}\s*=\s*await\s+sb\.from\('pedidos'\)/.test(ruta),
    'tiene que leer el error de la respuesta del update, no ignorarlo')
  assert.ok(/if\s*\(errorMarcado\)/.test(ruta), 'y hacer algo si ese error viene')
})

test('☠️ un pedido creado sin marcar el shopify_order_id avisa por Telegram', () => {
  // Sin esto, el pedido queda creado pero irreconocible para el próximo
  // reintento de Shopify: entraría una segunda vez.
  const bloque = ruta.slice(ruta.indexOf("if (errorMarcado)"))
  assert.ok(/notificarPedidoWebFallido/.test(bloque))
})

test('☠️ no crea un pedido sin prendas — .every() sobre un arreglo vacío da true y se auto-despacha', () => {
  assert.ok(/payload\.items\??\.length/.test(ruta), 'tiene que comprobar que items no esté vacío')
  assert.ok(/notificarPedidoWebFallido/.test(ruta))
})

test('☠️ todo lo que va después de verificar la firma está en un try/catch propio (no solo el del JSON.parse)', () => {
  const catches = ruta.match(/catch\s*[({]/g) || []
  // Uno es el del JSON.parse (que sigue devolviendo 400, sin tocar). El otro
  // es la red de seguridad nueva: si algo revienta después de la firma
  // (p.ej. firmarSesion con SESSION_SECRET vacío), avisa y contesta 200 igual.
  assert.ok(catches.length >= 2, `esperaba al menos 2 catch, hay ${catches.length}`)
})

test('los 400 de cuerpo inválido y pedido sin id se quedan como están', () => {
  assert.ok(/Cuerpo inválido/.test(ruta))
  assert.ok(/Pedido sin id/.test(ruta))
  assert.ok(/status:\s*400/.test(ruta))
})
