import test from 'node:test'
import assert from 'node:assert'
import { textoAlerta } from '../lib/alerta-texto.js'

// La alerta llega al MISMO chat donde caen las ventas. Si se parece a una venta,
// se pierde entre ellas — y una alerta que no se distingue no sirve de nada.

test('deja claro de entrada que NO es una venta', () => {
  const t = textoAlerta({ fuente: 'datil', mensaje: 'RUC inválido', pedidoId: 'MAN-AND-5588' })
  assert.match(t, /no es una venta/i)
})

test('una falla de factura se reconoce por el icono y el nombre de la fuente', () => {
  const t = textoAlerta({ fuente: 'datil', mensaje: 'RUC inválido', pedidoId: 'MAN-AND-5588' })
  assert.match(t, /🧾/)
  assert.match(t, /factura/i)
})

test('lleva el pedido, que es lo que se necesita para ir a arreglarlo', () => {
  const t = textoAlerta({ fuente: 'datil', mensaje: 'RUC inválido', pedidoId: 'MAN-AND-5588' })
  assert.match(t, /MAN-AND-5588/)
})

test('lleva el motivo REAL que devolvió el proveedor', () => {
  // Sin esto la alerta solo dice "algo falló" y hay que ir a bucear igual.
  const t = textoAlerta({ fuente: 'datil', mensaje: 'Identificación del comprador inválida', pedidoId: 'MAN-AND-5588' })
  assert.match(t, /Identificación del comprador inválida/)
})

test('lleva el enlace directo al pedido en el CRM', () => {
  const t = textoAlerta({ fuente: 'datil', mensaje: 'x', pedidoId: 'MAN-AND-5588', baseUrl: 'https://crm.apps.mandarinaec.com' })
  assert.match(t, /https:\/\/crm\.apps\.mandarinaec\.com\/dashboard\/pedido\/MAN-AND-5588/)
})

test('sin pedido no inventa un enlace roto', () => {
  const t = textoAlerta({ fuente: 'supabase', mensaje: 'timeout', baseUrl: 'https://crm.apps.mandarinaec.com' })
  assert.ok(!t.includes('/dashboard/pedido/'), 'no debe haber enlace a un pedido inexistente')
  assert.match(t, /timeout/)
})

test('una fuente desconocida no rompe el mensaje', () => {
  const t = textoAlerta({ fuente: 'loquesea', mensaje: 'algo' })
  assert.match(t, /algo/)
  assert.ok(t.length > 0)
})

test('un mensaje larguísimo se recorta para que Telegram no rechace el envío', () => {
  // Telegram corta en 4096 caracteres: si se pasa, la API responde 400 y la
  // alerta se pierde entera. Justo el caso de un error con un volcado enorme.
  const t = textoAlerta({ fuente: 'datil', mensaje: 'x'.repeat(6000), pedidoId: 'MAN-AND-1' })
  assert.ok(t.length <= 4096, `el texto mide ${t.length}`)
  assert.match(t, /MAN-AND-1/, 'el pedido no se puede perder en el recorte')
})
