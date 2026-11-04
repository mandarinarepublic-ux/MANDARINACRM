import test from 'node:test'
import assert from 'node:assert'
import { textoGuiaDespachada, cabeceraGuia, chatAlarmas, notificarGuiaDespachada } from '../lib/telegram.js'

// Cuando Despacho registra una guía, al grupo de alarmas llega la foto con el
// detalle del pedido. Lo que se prueba es lo que hace falta para identificar el
// envío sin abrir el CRM.

const pedido = {
  PEDIDO_ID: 'MAN-AND-6409', TIENDA_ID: 'MANDARINA',
  CLIENTE_NOMBRE: 'Justin Vinces', CLIENTE_CELULAR: '0986413373',
  CIUDAD_PEDIDO: 'Guayaquil', DIRECCION_PEDIDO: 'Av. 9 de Octubre',
  MONTO_TOTAL: '70', MONTO_ABONADO: '50', MONTO_PENDIENTE: '20',
  items: [
    { PRODUCTO_NOMBRE: 'HOODIE_OVERSIZE <negro>', TALLA: 'M', COLOR: 'Negro', CANTIDAD: '2', SUBTOTAL: '70', DETALLE_PERSONALIZADO: 'Logo en pecho' },
  ],
}
const guia = { numero: '123456789', transportista: 'SERVIENTREGA', registradoPor: 'Ana' }

test('lleva pedido, guía, cliente y prendas', () => {
  const t = textoGuiaDespachada({ pedido, guia })
  for (const esperado of ['MAN-AND-6409', 'SERVIENTREGA #123456789', 'Justin Vinces', '0986413373', 'Guayaquil', '2× ', 'T. M', 'Logo en pecho', '$70.00', 'Ana']) {
    assert.ok(t.includes(esperado), `falta ${esperado}`)
  }
})

test('avisa si queda saldo por cobrar', () => {
  assert.match(textoGuiaDespachada({ pedido, guia }), /Pendiente de cobro: \$20\.00/)
  assert.doesNotMatch(textoGuiaDespachada({ pedido: { ...pedido, MONTO_PENDIENTE: '0' }, guia }), /Pendiente/)
})

test('escapa el HTML de los datos (si no, Telegram rechaza el mensaje)', () => {
  const t = textoGuiaDespachada({ pedido, guia })
  assert.ok(t.includes('&lt;negro&gt;'))
  assert.ok(!t.includes('<negro>'))
})

test('lleva el enlace al pedido', () => {
  const t = textoGuiaDespachada({ pedido, guia, baseUrl: 'https://crm.apps.mandarinaec.com/' })
  assert.ok(t.includes('https://crm.apps.mandarinaec.com/dashboard/pedido/MAN-AND-6409'))
})

test('la cabecera cabe en el pie de una foto', () => {
  assert.ok(cabeceraGuia({ pedido, guia }).length < 1024)
})

test('un pedido enorme no pasa el tope de Telegram', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ PRODUCTO_NOMBRE: `Camiseta ${i}`, CANTIDAD: '1', DETALLE_PERSONALIZADO: 'x'.repeat(150) }))
  const t = textoGuiaDespachada({ pedido: { ...pedido, items }, guia })
  assert.ok(t.length <= 4096)
})

test('va al grupo de alarmas (el mismo de las alertas de error)', () => {
  const antes = { ...process.env }
  delete process.env.TELEGRAM_CHAT_GUIAS
  process.env.TELEGRAM_CHAT_ERRORES = '-111'
  process.env.TELEGRAM_CHAT_VENTAS = '-222'
  assert.equal(chatAlarmas(), '-111')
  process.env.TELEGRAM_CHAT_GUIAS = '-333'
  assert.equal(chatAlarmas(), '-333')
  process.env = antes
})

test('manda la foto con el detalle, y si la foto falla manda el texto', async () => {
  const antesEnv = { ...process.env }
  const antesFetch = globalThis.fetch
  process.env.TELEGRAM_BOT_TOKEN = 'tok'
  const llamadas = []
  let fallarFoto = false
  globalThis.fetch = async (url, opts) => {
    const metodo = url.split('/').pop()
    llamadas.push({ metodo, body: JSON.parse(opts.body) })
    const ok = !(fallarFoto && metodo === 'sendPhoto')
    return { ok, status: ok ? 200 : 400, text: async () => '' }
  }
  try {
    assert.equal(await notificarGuiaDespachada({ pedido, guia, fotoUrl: 'https://res.cloudinary.com/x.jpg' }), true)
    assert.equal(llamadas[0].metodo, 'sendPhoto')
    assert.equal(llamadas[0].body.photo, 'https://res.cloudinary.com/x.jpg')
    assert.match(llamadas[0].body.caption, /Justin Vinces/)

    llamadas.length = 0
    fallarFoto = true
    assert.equal(await notificarGuiaDespachada({ pedido, guia, fotoUrl: 'https://res.cloudinary.com/x.jpg' }), true)
    assert.deepEqual(llamadas.map(l => l.metodo), ['sendPhoto', 'sendMessage'])
    assert.match(llamadas[1].body.text, /cloudinary/)

    llamadas.length = 0
    await notificarGuiaDespachada({ pedido, guia, fotoUrl: '' })
    assert.deepEqual(llamadas.map(l => l.metodo), ['sendMessage'])
    assert.match(llamadas[0].body.text, /Sin foto/)
  } finally {
    globalThis.fetch = antesFetch
    process.env = antesEnv
  }
})
