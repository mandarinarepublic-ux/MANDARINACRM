// El parámetro `volver` viene de la URL, o sea del mundo exterior. Estas pruebas
// son la lista de trucos conocidos para colarse; si alguna se cae, tenemos un
// redirect abierto en la página de login.
const test = require('node:test')
const assert = require('node:assert')

async function cargar() {
  const mod = await import('../lib/volver.js')
  return mod.volverSeguro
}

test('sin destino va al tablero', async () => {
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro(null), '/dashboard')
  assert.strictEqual(volverSeguro(''), '/dashboard')
})

test('una ruta interna se respeta', async () => {
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro('/dashboard/historial'), '/dashboard/historial')
})

test('una ruta interna CON QUERY se respeta entera', async () => {
  // El middleware guarda `pathname + search`: si se perdiera la query, quien
  // abre PEDIDO MANUAL con la sesión vencida volvería sin `embed=1`, sin
  // precarga y creando el pedido sin avisarle al inbox.
  const volverSeguro = await cargar()
  assert.strictEqual(
    volverSeguro('/dashboard/nuevo-pedido?embed=1&celular=0999989663&nombre=Prueba'),
    '/dashboard/nuevo-pedido?embed=1&celular=0999989663&nombre=Prueba',
  )
})

test('la query no puede sacarte del sitio', async () => {
  // Todo lo que va después del '?' es query: no cambia de host por más que
  // parezca una URL. Y los trucos de ruta se siguen rechazando aunque traigan
  // query detrás.
  const volverSeguro = await cargar()
  assert.strictEqual(
    volverSeguro('/dashboard?next=https://evil.com'),
    '/dashboard?next=https://evil.com',
  )
  assert.strictEqual(volverSeguro('//evil.com/?volver=/dashboard'), '/dashboard')
  assert.strictEqual(volverSeguro('/\\evil.com?x=1'), '/dashboard')
  assert.strictEqual(volverSeguro('https://evil.com/?volver=/dashboard'), '/dashboard')
})

test('los inbox de la lista blanca se aceptan', async () => {
  const volverSeguro = await cargar()
  assert.strictEqual(
    volverSeguro('https://inbox.apps.mandarinaec.com/inbox'),
    'https://inbox.apps.mandarinaec.com/inbox',
  )
  assert.strictEqual(
    volverSeguro('https://ind-inbox.apps.mandarinaec.com/'),
    'https://ind-inbox.apps.mandarinaec.com/',
  )
})

test('un sitio ajeno se rechaza', async () => {
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro('https://evil.com/roba'), '/dashboard')
})

test('el truco del sufijo se rechaza', async () => {
  // inbox.apps.mandarinaec.com.evil.com NO es nuestro dominio, aunque lo parezca
  // si uno compara con "empieza por" o "contiene".
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro('https://inbox.apps.mandarinaec.com.evil.com/'), '/dashboard')
})

test('el truco de la barra doble se rechaza', async () => {
  // '//evil.com' es una URL relativa al protocolo: el navegador la lee como
  // https://evil.com, pero "empieza con /" la daría por interna.
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro('//evil.com'), '/dashboard')
  assert.strictEqual(volverSeguro('/\\evil.com'), '/dashboard')
})

test('una basura cualquiera no revienta', async () => {
  const volverSeguro = await cargar()
  assert.strictEqual(volverSeguro('http://['), '/dashboard')
})
