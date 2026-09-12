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

// ---------------------------------------------------------------------------
// Ronda de arreglo del 2026-09-11: C1, C2, I1, I2, I3, I6
// ---------------------------------------------------------------------------

test('☠️ C1: no se lee content[0] directo, se BUSCA el bloque de tipo texto', () => {
  // En claude-opus-5 el thinking viene ENCENDIDO por defecto: content[0] es un
  // bloque `thinking` vacio (el display por defecto lo omite). Leer
  // content[0].text da '' y el JSON.parse de mas abajo revienta SIEMPRE.
  assert.ok(!/data\?\.content\?\.\[0\]\?\.text/.test(redactar),
    'sigue leyendo content[0] directo: con el thinking encendido eso es el bloque vacio, no el texto')
  assert.ok(/\.find\(/.test(redactar), 'no se usa find(...) para localizar el bloque de texto')
  assert.ok(/type === 'text'/.test(redactar), 'no se filtra el bloque por su tipo ("text")')
})

test('☠️ C1: max_tokens es de al menos 16000', () => {
  // Los tokens de thinking se descuentan de max_tokens. Con 2000 (el valor
  // viejo) el JSON queda truncado y JSON.parse falla igual, con un mensaje que
  // despista ("La IA no devolvió un JSON válido").
  const m = redactar.match(/max_tokens:\s*(\d+)/)
  assert.ok(m, 'no se encontró max_tokens en la llamada a la API de Anthropic')
  assert.ok(Number(m[1]) >= 16000,
    `max_tokens quedó en ${m && m[1]}: muy bajo, el thinking se come el tope y trunca el JSON`)
})

test('☠️ C2: activar el producto usa productUpdate, NUNCA un productSet parcial', () => {
  // productSet es declarativo: en las listas (variantes, opciones, archivos)
  // BORRA lo que no venga en el input. Un productSet con solo {id, status}
  // puede dejar el producto ACTIVO y sin una sola variante.
  assert.ok(/productUpdate/.test(publicar), 'falta la mutation productUpdate')
  assert.ok(/shopifyGraphQLPorTienda\(tienda, ACTIVAR,/.test(publicar),
    'el paso de activar no llama a la mutation ACTIVAR (productUpdate)')
  // El patron viejo y roto: `productSet` con SOLO id+status para activar.
  assert.ok(!/input:\s*\{\s*id:\s*producto\.id,\s*status:\s*'ACTIVE'/.test(publicar),
    'sigue activando con un productSet parcial {id, status}: eso puede vaciar el producto')
  assert.ok(/product:\s*\{\s*id:\s*producto\.id,\s*status:\s*'ACTIVE'/.test(publicar),
    'falta la llamada a productUpdate con { product: { id, status } }')
})

test('☠️ C2: la respuesta de activar se lee de productUpdate, no de productSet', () => {
  assert.ok(/act\?\.productUpdate\?\.userErrors/.test(publicar), 'no se leen los userErrors de productUpdate')
  assert.ok(/act\?\.productUpdate\?\.product\?\.status/.test(publicar), 'no se lee el status desde productUpdate')
  assert.ok(!/act\?\.productSet\?\.(userErrors|product)/.test(publicar),
    'todavia se lee la respuesta de activar como si fuera productSet')
})

test('☠️ C2: el productSet del paso 1 sigue mandando variantes, opciones y archivos', () => {
  // El productSet completo (creacion/actualizacion inicial) NO se toca: es el
  // unico lugar donde SI hace falta mandar todo, porque ahi si se quiere fijar
  // la lista completa.
  const iSet = publicar.indexOf('const SET = ')
  const iActivar = publicar.indexOf('const ACTIVAR = ')
  assert.ok(iSet > -1 && iActivar > -1, 'no se encuentran las constantes SET y ACTIVAR')
  const bloqueSet = publicar.slice(iSet, iActivar)
  assert.ok(/productSet/.test(bloqueSet), 'el bloque SET dejo de usar productSet')
  assert.ok(/ProductSetInput/.test(bloqueSet), 'el bloque SET perdio el tipo ProductSetInput')
})

test('☠️ I1: el try que atrapa fallos envuelve TAMBIEN la relectura, no solo la activacion', () => {
  // Antes el try empezaba un paso tarde: un corte de red durante el bucle de
  // reintentos subia al catch de AFUERA -> 500 sin productoId -> el ADMIN
  // reintenta -> productSet SIN id -> producto duplicado en Shopify.
  const iChequeoId = publicar.indexOf('Shopify no devolvió el producto')
  const iFor = publicar.indexOf('for (let intento')
  assert.ok(iChequeoId > -1 && iFor > -1, 'no se encuentran los anclas del paso 2')
  const iTry = publicar.indexOf('try {', iChequeoId)
  assert.ok(iTry > -1 && iTry < iFor,
    'el try sigue empezando DESPUES del bucle de relectura: un corte de red ahi pierde el productoId')
})

test('☠️ I2: urlAdmin NO se arma con tienda.toLowerCase()', () => {
  // `tienda` es el id interno del CRM (MANDARINA/INDSTORE), no el handle real
  // de Shopify (ej. "3cnrr9-sy"): armar la URL desde el id daba 404 siempre.
  assert.ok(!/tienda\.toLowerCase\(\)/.test(publicar),
    'urlAdmin sigue inventando el handle desde el id interno del CRM')
  assert.ok(/getTiendasConfig/.test(publicar), 'urlAdmin no sale de la config real de la tienda')
})

test('☠️ I3: el aviso de fallo dice que falta el permiso del canal, cuando aplica', () => {
  assert.ok(/read_publications/.test(publicar), 'no se menciona el permiso read_publications')
  assert.ok(/write_publications/.test(publicar), 'no se menciona el permiso write_publications')
  // El aviso especifico tiene que estar CONDICIONADO a un 403/ACCESS_DENIED
  // real, no ser el mensaje generico de siempre: si no, cualquier fallo del
  // bloque de activar/publicar diria "falta permiso" aunque sea otra cosa.
  assert.ok(/\/403\|ACCESS_DENIED\/i\.test\(m\)/.test(publicar),
    'el aviso de permisos no esta anclado a una comprobacion real de 403/ACCESS_DENIED')
  assert.ok(/falta permiso para publicarlo al canal/.test(publicar), 'se perdio el mensaje especifico del permiso')
})

test('☠️ I6: tags se comprueba de TIPO, igual que altTextos y tallasSugeridas', () => {
  // Si la IA devuelve `tags` como string, (ficha.tags || []).map(...) revienta
  // toda la pantalla de revision y se pierde la redaccion ya pagada.
  assert.ok(/Array\.isArray\(ficha\.tags\)/.test(redactar), 'tags no se comprueba de tipo antes de usarlo')
})
