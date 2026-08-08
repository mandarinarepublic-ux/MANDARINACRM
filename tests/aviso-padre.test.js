// Mandar un postMessage con targetOrigin '*' es publicarle el pedido a
// cualquiera que te haya enmarcado. Estas pruebas fijan a quién se le habla.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { avisarPedidoCreado, origenDelPadre } from '../lib/aviso-padre.js'

function ventanaFalsa(referrer) {
  const enviados = []
  const avisos = []
  return {
    enviados,
    avisos,
    win: {
      document: { referrer },
      parent: { postMessage: (msg, destino) => enviados.push({ msg, destino }) },
      // Consola propia: así se puede comprobar que el silencio deja rastro sin
      // ensuciar la salida de las pruebas.
      console: { warn: (...a) => avisos.push(a.join(' ')) },
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

// ── Ronda 1 de arreglo ────────────────────────────────────────────────────────

test('el monto va redondeado a dos decimales, sin basura de coma flotante', () => {
  // 19.90 × 3 en coma flotante da 59.699999999999996. La nota del inbox NO se
  // puede editar, así que el redondeo tiene que pasar acá, en el origen.
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'MAN-1', montoTotal: 19.90 * 3, url: 'x' }, win)
  assert.strictEqual(enviados[0].msg.montoTotal, 59.7)
  assert.strictEqual(String(enviados[0].msg.montoTotal), '59.7')
  assert.strictEqual(enviados[0].msg.montoTotal.toFixed(2), '59.70')
})

test('un monto que ya está redondo no se toca', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'MAN-2', montoTotal: 42.5, url: 'x' }, win)
  assert.strictEqual(enviados[0].msg.montoTotal, 42.5)
})

test('un monto que no es número pasa tal cual, no se vuelve 0', () => {
  // Redondear a ciegas convertiría el vacío en $0, y un pedido de $0 en la nota
  // es peor que un dato ausente.
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'MAN-3', montoTotal: undefined, url: 'x' }, win)
  assert.strictEqual(enviados[0].msg.montoTotal, undefined)
})

test('cuando no se avisa, queda rastro en la consola', () => {
  // Sin rastro, un aviso que no salió es indistinguible de uno que sí salió, y
  // eso es lo que haría indiagnosticable el caso de la sesión vencida.
  const { win, enviados, avisos } = ventanaFalsa('https://evil.com/trampa')
  avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(enviados.length, 0)
  assert.strictEqual(avisos.length, 1)
  assert.match(avisos[0], /aviso-padre/)
})

test('el rastro también aparece cuando no hay referrer', () => {
  const { win, avisos } = ventanaFalsa('')
  avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(avisos.length, 1)
  assert.match(avisos[0], /vacío/)
})

test('avisar bien NO deja rastro de advertencia', () => {
  const { win, avisos } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  avisarPedidoCreado({ pedidoId: 'OK', montoTotal: 1, url: 'x' }, win)
  assert.strictEqual(avisos.length, 0)
})

// ── Que avisar NUNCA pueda tumbar la creación del pedido ──────────────────────
// El pedido ya está grabado cuando se llama a esto. Si lanzara, el error lo
// agarraría el catch que pinta "error al crear", la navegación no ocurriría y el
// vendedor reintentaría: pedido DUPLICADO. Estos casos son las formas conocidas
// de que un iframe reviente al hablarle al padre.

test('no lanza si postMessage explota', () => {
  // Pasa de verdad: el navegador tira DataCloneError si el mensaje no es
  // serializable, y SecurityError en algunos cruces de origen.
  const win = {
    document: { referrer: 'https://inbox.apps.mandarinaec.com/inbox' },
    parent: { postMessage: () => { throw new Error('DataCloneError') } },
  }
  assert.doesNotThrow(() => avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win))
})

test('no lanza si leer document.referrer explota', () => {
  const win = {
    get document() { throw new Error('SecurityError') },
    parent: { postMessage: () => {} },
  }
  assert.doesNotThrow(() => avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win))
})

test('no lanza si los datos del pedido son basura', () => {
  const { win } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  assert.doesNotThrow(() => avisarPedidoCreado(null, win))
  assert.doesNotThrow(() => avisarPedidoCreado(undefined, win))
})

test('no lanza si la ventana no tiene parent', () => {
  const win = { document: { referrer: 'https://inbox.apps.mandarinaec.com/inbox' } }
  assert.doesNotThrow(() => avisarPedidoCreado({ pedidoId: 'X', montoTotal: 1, url: 'x' }, win))
})

test('en nuevo-pedido el aviso va en su propio try y router.push queda fuera', () => {
  // Cinturón y tirantes. La función de arriba ya no lanza, pero si mañana
  // alguien la cambia y el aviso vuelve a quedar dentro del try grande que crea
  // el pedido, el pedido se duplicaría otra vez. Esto lo agarra.
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')

  const iLlamada = src.indexOf('avisarPedidoCreado({')
  assert.ok(iLlamada > 0, 'no se encontró la llamada a avisarPedidoCreado')

  const iEmbed = src.lastIndexOf('if (esEmbed) {', iLlamada)
  assert.ok(iEmbed > 0, 'la llamada debería estar detrás de un if (esEmbed)')
  assert.ok(
    src.slice(iEmbed, iLlamada).includes('try {'),
    'avisarPedidoCreado tiene que ir dentro de su PROPIO try',
  )

  const despues = src.slice(iLlamada)
  const iCatch = despues.indexOf('} catch')
  const iPush = despues.indexOf('router.push(`/dashboard/pedido/')
  assert.ok(iCatch > 0, 'al try del aviso le falta el catch')
  assert.ok(iPush > iCatch, 'router.push tiene que quedar FUERA del try del aviso')
})
