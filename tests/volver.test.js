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
