// tests/api-productos-shopify-blindada.test.js
//
// Las rutas del panel de productos son SOLO ADMIN: crean y publican cosas en
// la tienda real. Esta prueba vigila que ninguna se abra por descuido.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const leer = (p) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))

const categorias = leer('../app/api/productos-shopify/categorias/route.js')

test('la busqueda de categorias exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(categorias), 'falta requireAdmin')
  assert.ok(/auth\.ok/.test(categorias), 'llama a requireAdmin pero no mira el resultado')
})

test('☠️ no se lee el rol ni el usuario de la url ni de una cabecera', () => {
  for (const p of ['rol', 'usuario', 'usuarioId', 'admin']) {
    assert.ok(!new RegExp(`searchParams\\.get\\('${p}'\\)`).test(categorias), `lee ?${p}= del navegador`)
  }
  assert.ok(!/headers\.get\('x-mp-usuario-id'\)/.test(categorias), 'confia en una cabecera')
})

const redactar = leer('../app/api/productos-shopify/redactar/route.js')

test('redactar exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(redactar))
  assert.ok(/auth\.ok/.test(redactar))
})

test('🔒 la clave de Anthropic no sale del servidor', () => {
  assert.ok(/process\.env\.ANTHROPIC_API_KEY/.test(redactar), 'la clave se lee del entorno')
  assert.ok(!/NEXT_PUBLIC_/.test(redactar), 'una clave con NEXT_PUBLIC_ viaja al navegador')
})

test('☠️ el prompt prohibe inventar lo que no se ve en la foto', () => {
  // Vigila DOS cosas: que la lista de prohibidos siga ahi, y que siga siendo
  // una PROHIBICION y no una sugerencia.
  //
  // Lo que esta prueba NO puede hacer, y conviene saberlo: si alguien reescribe
  // el prompt invirtiendo el sentido pero conservando el vocabulario ("si puedes
  // mencionar la composicion..."), una comparacion de texto no lo detecta.
  // Contra eso no hay prueba automatica, hay revision humana.
  assert.ok(/PROHIBIDO INVENTAR/.test(redactar), 'se perdio la prohibicion explicita')
  assert.ok(/Nunca menciones/.test(redactar), 'se perdio la forma imperativa de la regla')
  for (const palabra of ['composición', 'lavado', 'medidas']) {
    assert.ok(redactar.includes(palabra), `el prompt no menciona ${palabra} en la lista de prohibidos`)
  }
})

test('☠️ lo que devuelve la IA se comprueba de TIPO, no solo de existencia', () => {
  // `|| []` no protege de un string: `.filter` no existiria (500 mudo) y
  // `altTextos?.[i]` sobre un string devuelve letras sueltas.
  assert.ok(/Array\.isArray\(ficha\.altTextos\)/.test(redactar), 'altTextos no se comprueba de tipo')
  assert.ok(/Array\.isArray\(ficha\.tallasSugeridas\)/.test(redactar), 'tallasSugeridas no se comprueba de tipo')
})

test('☠️ la IA no devuelve el id de categoria, devuelve un termino de busqueda', () => {
  assert.ok(/categoriaBusqueda/.test(redactar), 'falta el campo de termino de busqueda')
  assert.ok(!/TaxonomyCategory/.test(redactar), 'si el prompt conoce el formato del id, se lo inventa')
})

const publicar = leer('../app/api/productos-shopify/publicar/route.js')

test('publicar exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(publicar))
  assert.ok(/auth\.ok/.test(publicar))
})

test('☠️ se publica con productSet, NUNCA con productCreate', () => {
  assert.ok(/productSet/.test(publicar), 'falta productSet')
  assert.ok(!/productCreate/.test(publicar),
    'productCreate deja el producto a medio hacer devolviendo userErrors: []')
})

test('☠️ nace en DRAFT y solo se activa despues de verificar', () => {
  const iDraft = publicar.indexOf("'DRAFT'")
  // 'verificarProducto(' con paréntesis: así se agarra la LLAMADA, no el import
  // de arriba del archivo (que también dice "verificarProducto" y adelantaría
  // el índice de forma artificial).
  const iVerif = publicar.indexOf('verificarProducto(')
  const iActive = publicar.indexOf("'ACTIVE'")
  assert.ok(iDraft > -1 && iVerif > -1 && iActive > -1, 'faltan DRAFT, verificarProducto o ACTIVE')
  assert.ok(iDraft < iVerif && iVerif < iActive,
    'el orden tiene que ser DRAFT -> verificar -> ACTIVE, o hay una ventana con el producto roto a la venta')
})

test('un 403 avisa que puede ser el token cacheado', () => {
  assert.ok(/cacheado|caché|cache/i.test(publicar),
    'sin ese aviso se diagnostica mal un permiso que ya esta puesto')
})

test('☠️ se reintenta mientras las fotos siguen procesandose', () => {
  // Shopify procesa las imagenes async. Sin reintento, verificar una sola vez
  // dejaria en borrador casi toda publicacion legitima.
  assert.ok(/for \(let intento/.test(publicar), 'falta el bucle de reintento')
  assert.ok(/fotosEnProceso/.test(publicar),
    'el reintento tiene que decidirse por fotosEnProceso: si esta roto por otra cosa, no se insiste')
})

test('☠️ el reintento NO se decide leyendo el texto de los fallos', () => {
  // Atar un reintento a la redaccion de un mensaje es atarlo a algo que cambia:
  // basta que alguien reescriba un aviso para que deje de dispararse, en
  // silencio y justo en el caso para el que existe. La decision sale de los
  // ESTADOS de la media, que calcula verificarProducto.
  assert.ok(!/\/imagen\/i|\/foto\/i|\/imagen\|foto\/i/.test(publicar),
    'el reintento esta mirando el texto de los fallos en vez de fotosEnProceso')
})

test('☠️ un fallo despues de crear NO se reporta como si no hubiera pasado nada', () => {
  // Desde que el producto existe en Shopify, cualquier excepcion tiene que
  // contarse como fallo PERO dejar llegar la respuesta con el productoId. Si
  // sube al catch de afuera, el usuario ve un 500 sin enlace y con un producto
  // vivo en la tienda que no sabe que existe.
  const iActive = publicar.indexOf("'ACTIVE'")
  const tramo = publicar.slice(iActive)
  assert.ok(/catch/.test(tramo), 'el bloque de activar/publicar no atrapa lo suyo')
  assert.ok(/El producto se creó/.test(publicar), 'no se avisa que el producto SI existe')
})

test('el sync tiene timeout: no puede matar la respuesta de una publicacion buena', () => {
  assert.ok(/AbortSignal\.timeout/.test(publicar),
    'sin timeout, un sync lento agota maxDuration y un producto publicado se reporta como fallo')
})

test('☠️ ACTIVE no basta: tambien se publica al canal Tienda Online', () => {
  // La doc del esquema de Shopify lo dice: "Products with an active status
  // aren't automatically published to sales channels". Sin este paso el
  // producto queda ACTIVO y NINGUN cliente lo ve en la web.
  assert.ok(/publishablePublish/.test(publicar), 'falta publicar al canal de venta')
  assert.ok(/onlineStoreUrl/.test(publicar), 'sin onlineStoreUrl no hay como comprobar que se ve')
})
