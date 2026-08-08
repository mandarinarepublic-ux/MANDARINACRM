// Mandar un postMessage con targetOrigin '*' es publicarle el pedido a
// cualquiera que te haya enmarcado. Estas pruebas fijan a quién se le habla.
import test from 'node:test'
import assert from 'node:assert'
import { avisarPedidoCreado, origenDelPadre } from '../lib/aviso-padre.js'

function ventanaFalsa(referrer) {
  const enviados = []
  return {
    enviados,
    win: {
      document: { referrer },
      parent: { postMessage: (msg, destino) => enviados.push({ msg, destino }) },
    },
  }
}

test('avisa al inbox que lo enmarcó, con su origen exacto', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'MAN-AND-1', montoTotal: 42.5, url: 'https://crm…/p/1' }, win)
  assert.strictEqual(enviados.length, 1)
  assert.strictEqual(enviados[0].destino, 'https://inbox.apps.mandarinaec.com')
  assert.strictEqual(enviados[0].msg.tipo, 'pedido-creado')
  assert.strictEqual(enviados[0].msg.pedidoId, 'MAN-AND-1')
  assert.strictEqual(enviados[0].msg.montoTotal, 42.5)
})

test('el inbox de IND también vale', () => {
  const { win, enviados } = ventanaFalsa('https://ind-inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'IND-1', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(enviados[0].destino, 'https://ind-inbox.apps.mandarinaec.com')
})

test('NO avisa si quien enmarca no es de los nuestros', () => {
  const { win, enviados } = ventanaFalsa('https://evil.com/trampa')
  avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(enviados.length, 0)
})

test('NO avisa sin referrer', () => {
  // Sin referrer no se sabe a quién hablarle, y '*' no es opción.
  const { win, enviados } = ventanaFalsa('')
  avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(enviados.length, 0)
})

test('origenDelPadre saca solo el origen, sin la ruta', () => {
  assert.strictEqual(
    origenDelPadre('https://inbox.apps.mandarinaec.com/inbox?x=1'),
    'https://inbox.apps.mandarinaec.com',
  )
  assert.strictEqual(origenDelPadre('basura'), '')
  assert.strictEqual(origenDelPadre(''), '')
})

test('no lanza si no hay ventana', () => {
  // En el servidor no existe `window`; la función tiene que aguantarlo.
  assert.doesNotThrow(() => avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, undefined))
})
