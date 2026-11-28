import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroWhatsapp, mensajeWhatsappPedido, urlWhatsapp } from '../lib/whatsappPedido.js'

test('número de WhatsApp con 593 desde el celular del CRM', () => {
  assert.equal(numeroWhatsapp('0998165125'), '593998165125')
  assert.equal(numeroWhatsapp('099 816 5125'), '593998165125')
  assert.equal(numeroWhatsapp('998165125'), '593998165125')
  assert.equal(numeroWhatsapp('+593 99 816 5125'), '593998165125')
  assert.equal(numeroWhatsapp(''), '')
  assert.equal(numeroWhatsapp(null), '')
})

test('el texto conserva lo de antes y pide revisar la hoja adjunta', () => {
  const t = mensajeWhatsappPedido({ cliente: { NOMBRE: 'Erika Zamora' }, pedido: { PEDIDO_ID: 'IND-XAV-6738', MONTO_TOTAL: '35' } })
  assert.match(t, /^Hola Erika Zamora 👋/)
  assert.match(t, /\*IND-XAV-6738\* ha sido registrado/)
  assert.match(t, /adjuntamos la hoja de tu pedido para tu revisión/)
  for (const p of ['dirección', 'datos', 'tallas', 'diseño']) assert.ok(t.includes(p), p)
  assert.match(t, /Total: \$35\.00/)
  assert.match(t, /Gracias por tu compra 🍊$/)
})

test('sin nombre ni monto no rompe el texto', () => {
  const t = mensajeWhatsappPedido({ cliente: {}, pedido: { PEDIDO_ID: 'X' } })
  assert.match(t, /^Hola 👋/)
  assert.match(t, /\$0\.00/)
})

test('la URL lleva el texto codificado', () => {
  assert.equal(urlWhatsapp('593998165125', 'Hola *x*\n'), 'https://wa.me/593998165125?text=Hola%20*x*%0A')
})
