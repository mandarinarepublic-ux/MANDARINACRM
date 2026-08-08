// La hoja del pedido que se le manda al cliente por WhatsApp desde el inbox.
//
// Dos cosas se vigilan acá y las dos duelen si se rompen:
//   1. A QUIÉN se le entrega la hoja. El mensaje lleva el nombre, el celular, la
//      dirección y lo que compró el cliente: mandarlo a '*' es publicárselo a
//      cualquiera que nos haya enmarcado.
//   2. Que un envío que NO salió se note. Un error en silencio significa que el
//      vendedor cree que el cliente ya tiene su hoja y el cliente nunca la
//      recibe — y nadie vuelve a mandarla.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { enviarHojaPedido } from '../lib/aviso-padre.js'
import { pesoKbDataUrl, CALIDAD_JPG_HOJA } from '../lib/generarPdf.js'

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

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

// ── El contrato con el inbox ─────────────────────────────────────────────────

test('manda la hoja al origen exacto del inbox que nos enmarcó', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  const r = enviarHojaPedido({ pedidoId: 'MAN-AND-1', imagen: JPG }, win)
  assert.deepStrictEqual(r, { ok: true })
  assert.strictEqual(enviados.length, 1)
  assert.strictEqual(enviados[0].destino, 'https://inbox.apps.mandarinaec.com')
})

test('el mensaje es EXACTAMENTE el contrato acordado: tipo, pedidoId, imagen', () => {
  // El inbox espera estas tres claves y nada más. Una clave de sobra hoy es una
  // clave que mañana alguien lee del otro lado sin saber de dónde salió.
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  enviarHojaPedido({ pedidoId: 'MAN-AND-1', imagen: JPG }, win)
  const msg = enviados[0].msg
  assert.deepStrictEqual(Object.keys(msg).sort(), ['imagen', 'pedidoId', 'tipo'])
  assert.strictEqual(msg.tipo, 'hoja-pedido')
  assert.strictEqual(msg.pedidoId, 'MAN-AND-1')
  assert.strictEqual(msg.imagen, JPG)
})

test('el inbox de IND también vale', () => {
  const { win, enviados } = ventanaFalsa('https://ind-inbox.apps.mandarinaec.com/inbox')
  assert.strictEqual(enviarHojaPedido({ pedidoId: 'IND-1', imagen: JPG }, win).ok, true)
  assert.strictEqual(enviados[0].destino, 'https://ind-inbox.apps.mandarinaec.com')
})

test('NUNCA se manda a *', () => {
  for (const referrer of [
    'https://inbox.apps.mandarinaec.com/inbox',
    'https://ind-inbox.apps.mandarinaec.com/x',
  ]) {
    const { win, enviados } = ventanaFalsa(referrer)
    enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win)
    assert.notStrictEqual(enviados[0].destino, '*')
  }
})

// ── Cuándo NO se manda, y que se sepa ────────────────────────────────────────

test('no le entrega la hoja a quien no es uno de nuestros inbox', () => {
  const { win, enviados } = ventanaFalsa('https://evil.com/trampa')
  const r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win)
  assert.strictEqual(r.ok, false)
  assert.match(r.motivo, /inbox/)
  assert.strictEqual(enviados.length, 0)
})

test('un host que solo SE PARECE al nuestro tampoco pasa', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com.evil.com/x')
  assert.strictEqual(enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win).ok, false)
  assert.strictEqual(enviados.length, 0)
})

test('sin referrer no se manda: no se sabe a quién', () => {
  const { win, enviados } = ventanaFalsa('')
  const r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win)
  assert.strictEqual(r.ok, false)
  assert.match(r.motivo, /vacío/)
  assert.strictEqual(enviados.length, 0)
})

test('si ya no hay iframe (la pantalla quedó suelta) avisa en vez de mandarse a sí misma', () => {
  // Pasa de verdad: la sesión vence, el rodeo por el login abre la pantalla en su
  // propia pestaña y el referrer sigue diciendo "inbox", pero parent === window.
  const win = {
    document: { referrer: 'https://inbox.apps.mandarinaec.com/inbox' },
  }
  win.parent = win
  win.parent.postMessage = () => { throw new Error('no debería llamarse') }
  const r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win)
  assert.strictEqual(r.ok, false)
  assert.match(r.motivo, /dentro del inbox/)
})

test('sin pedidoId no se manda nada', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  assert.strictEqual(enviarHojaPedido({ pedidoId: '', imagen: JPG }, win).ok, false)
  assert.strictEqual(enviados.length, 0)
})

test('solo pasa un JPG: ni PNG, ni texto, ni vacío', () => {
  const { win, enviados } = ventanaFalsa('https://inbox.apps.mandarinaec.com/inbox')
  for (const imagen of ['data:image/png;base64,iVBOR', 'https://algo/foto.jpg', '', null, undefined, 42]) {
    const r = enviarHojaPedido({ pedidoId: 'X', imagen }, win)
    assert.strictEqual(r.ok, false, `debería rechazar ${String(imagen)}`)
    assert.match(r.motivo, /JPG/)
  }
  assert.strictEqual(enviados.length, 0)
})

// ── Que un fallo se reporte, pero no reviente la pantalla ────────────────────

test('si postMessage explota, lo dice y no lanza', () => {
  const win = {
    document: { referrer: 'https://inbox.apps.mandarinaec.com/inbox' },
    parent: { postMessage: () => { throw new Error('DataCloneError') } },
  }
  let r
  assert.doesNotThrow(() => { r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win) })
  assert.strictEqual(r.ok, false)
  assert.match(r.motivo, /DataCloneError/)
})

test('si leer el referrer explota, lo dice y no lanza', () => {
  const win = {
    get document() { throw new Error('SecurityError') },
    parent: { postMessage: () => {} },
  }
  let r
  assert.doesNotThrow(() => { r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, win) })
  assert.strictEqual(r.ok, false)
})

test('sin ventana (en el servidor) no lanza y avisa', () => {
  let r
  assert.doesNotThrow(() => { r = enviarHojaPedido({ pedidoId: 'X', imagen: JPG }, undefined) })
  assert.strictEqual(r.ok, false)
})

test('sin argumentos no lanza', () => {
  assert.doesNotThrow(() => enviarHojaPedido(undefined, undefined))
})

test('nunca devuelve ok sin haber entregado el mensaje', () => {
  // El invariante que importa: `ok: true` es lo único que la pantalla usa para
  // decirle al vendedor "listo, ya se la mandaste".
  const casos = [
    ['https://evil.com/x', JPG],
    ['', JPG],
    ['https://inbox.apps.mandarinaec.com/inbox', 'data:image/png;base64,x'],
  ]
  for (const [referrer, imagen] of casos) {
    const { win, enviados } = ventanaFalsa(referrer)
    const r = enviarHojaPedido({ pedidoId: 'X', imagen }, win)
    assert.strictEqual(r.ok, enviados.length === 1)
  }
})

// ── El peso de la foto ───────────────────────────────────────────────────────

test('pesoKbDataUrl cuenta los bytes reales, sin el encabezado ni el relleno', () => {
  // 3 bytes → 4 caracteres base64, sin relleno.
  const tresBytes = 'data:image/jpeg;base64,' + Buffer.from([1, 2, 3]).toString('base64')
  assert.strictEqual(pesoKbDataUrl(tresBytes), 0)   // redondea a 0 KB

  const cienKb = 'data:image/jpeg;base64,' + Buffer.alloc(100 * 1024, 7).toString('base64')
  assert.strictEqual(pesoKbDataUrl(cienKb), 100)

  // Con relleno (`=`): 1 byte se codifica como 4 caracteres, 2 de ellos relleno.
  const unByte = 'data:image/jpeg;base64,' + Buffer.from([9]).toString('base64')
  assert.ok(unByte.endsWith('=='))
  assert.strictEqual(pesoKbDataUrl(unByte), 0)
})

test('pesoKbDataUrl aguanta basura sin lanzar', () => {
  assert.strictEqual(pesoKbDataUrl(''), 0)
  assert.strictEqual(pesoKbDataUrl(null), 0)
  assert.strictEqual(pesoKbDataUrl('sin coma'), 0)
})

test('la calidad del JPG está en un rango que se lee y no engorda', () => {
  assert.ok(CALIDAD_JPG_HOJA > 0.7 && CALIDAD_JPG_HOJA < 0.95, `calidad rara: ${CALIDAD_JPG_HOJA}`)
})

// ── La pantalla del pedido ───────────────────────────────────────────────────

const SRC = readFileSync(new URL('../app/dashboard/pedido/[id]/page.js', import.meta.url), 'utf8')

test('el botón de enviar al cliente SOLO se pinta con embed=1', () => {
  const i = SRC.indexOf('📤 Enviar al cliente')
  assert.ok(i > 0, 'no se encontró el botón')
  const iGuarda = SRC.lastIndexOf('{esEmbed && (', i)
  assert.ok(iGuarda > 0, 'el botón tiene que ir detrás de {esEmbed && (')
  // Y que el bloque de la guarda siga ABIERTO cuando aparece el botón: si se
  // cerró antes, el botón quedó fuera y se pintaría también en el CRM suelto.
  let nivel = 0
  for (let k = iGuarda; k < i; k++) {
    if (SRC[k] === '{') nivel++
    else if (SRC[k] === '}') nivel--
    assert.ok(nivel > 0 || k === iGuarda, 'la guarda de esEmbed se cerró antes del botón')
  }
})

test('la foto es JPG, no PNG', () => {
  // PNG por postMessage y después por WhatsApp es varias veces el mismo peso.
  const gen = readFileSync(new URL('../lib/generarPdf.js', import.meta.url), 'utf8')
  assert.ok(gen.includes("toDataURL('image/jpeg'"), 'la captura tiene que salir en JPEG')
  assert.ok(!/toDataURL\('image\/png'/.test(gen), 'quedó una captura en PNG')
})

test('no se puede apretar dos veces: el botón se deshabilita y la función corta', () => {
  assert.ok(/disabled=\{enviandoHoja\}/.test(SRC), 'al botón le falta el disabled')
  assert.ok(/if \(enviandoHoja\) return/.test(SRC), 'la función tiene que cortar si ya está enviando')
})

test('un fallo del envío se pinta en pantalla, no se traga', () => {
  const i = SRC.indexOf('async function enviarHojaAlInbox')
  assert.ok(i > 0)
  const cuerpo = SRC.slice(i, SRC.indexOf('\n  }', i))
  assert.ok(/catch/.test(cuerpo), 'falta el catch')
  assert.ok(/tipo: 'error'/.test(cuerpo), 'el catch tiene que dejar un estado de error visible')
  assert.ok(/if \(!r\.ok\) throw/.test(cuerpo), 'un envío que no salió tiene que tratarse como error')
})

test('reutiliza los mismos nodos que ya usa el PDF, no un render aparte', () => {
  // Si la foto saliera de otro render, la hoja que ve el cliente y la que se
  // imprime podrían separarse sin que nadie se entere.
  assert.ok(SRC.includes('`pdf-gracias-${i}`'), 'la captura debe usar los nodos pdf-gracias-N')
  assert.ok(SRC.includes("from '@/lib/generarPdf'"), 'la captura debe salir del helper compartido')
})
