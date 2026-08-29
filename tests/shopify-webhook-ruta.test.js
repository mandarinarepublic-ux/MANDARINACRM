import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const ruta = readFileSync(new URL('../app/api/shopify/pedidos/route.js', import.meta.url), 'utf8')

test('☠️ lee el cuerpo CRUDO antes de parsear, o la firma nunca cuadra', () => {
  assert.ok(/await\s+req\.text\(\)/.test(ruta), 'tiene que usar req.text(), no req.json()')
  assert.ok(!/await\s+req\.json\(\)/.test(ruta), 'req.json() rompe la verificación del HMAC')
})

test('☠️ MIRA res.ok en la llamada a /api/pedidos — la lección de LINKPAGO', () => {
  assert.ok(/res\.ok|\.ok\b/.test(ruta), 'un 401 no lanza: sin res.ok el fallo se descarta solo')
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
