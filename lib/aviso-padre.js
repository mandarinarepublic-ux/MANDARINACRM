// Avisarle al inbox que el pedido ya está creado.
//
// El inbox nos tiene dentro de un iframe y necesita el número del pedido para
// dejar su nota `📦` y marcar el chat como venta. La vía es postMessage.
//
// ⚠️ El destino NO puede ser '*': eso le entrega el pedido a cualquiera que nos
// haya enmarcado. Y tampoco puede venir de un parámetro de la URL, porque
// entonces lo elige quien arma el enlace. Se saca del `document.referrer`, que
// lo pone el navegador, y se valida contra la lista blanca de lib/origenes.js.
// ⚠️ Import RELATIVO, no `@/lib/origenes`: el alias solo lo entiende el bundler
// de Next y `node --test` carga este archivo directo. Ver la nota en volver.js.
import { esOrigenInbox } from './origenes.js'

/** El origen (protocolo + host) de una URL, o '' si no se puede leer. */
export function origenDelPadre(referrer) {
  try {
    return new URL(String(referrer || '')).origin
  } catch {
    return ''
  }
}

/**
 * Redondea el monto a dos decimales, que es como se habla de plata.
 *
 * El total sale de sumar floats (`precioUnit × cantidad`) y eso arrastra la
 * basura de la coma flotante: 19.90 × 3 da 59.699999999999996, y así saldría
 * impreso en la nota del inbox, que NO se puede editar. De paso, `toFixed(2)`
 * evita que 42.5 se muestre sin el segundo decimal.
 *
 * Si llega algo que no es un número (undefined, null, texto), se devuelve tal
 * cual: redondear a ciegas convertiría el vacío en 0, y un pedido de $0 en la
 * nota es peor que un dato ausente.
 */
function montoRedondeado(montoTotal) {
  const n = Number(montoTotal)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : montoTotal
}

/**
 * Le avisa al inbox que enmarcó esta pantalla. Si no hay padre reconocible, no
 * hace nada: es normal cuando la pantalla se usa suelta, sin iframe.
 *
 * `ventana` se inyecta para poder probarlo; en la app se llama sin argumentos.
 */
export function avisarPedidoCreado(datos, ventana = typeof window !== 'undefined' ? window : undefined) {
  // ⚠️ Esta función NO puede lanzar, nunca, pase lo que pase.
  //
  // La llama la pantalla de nuevo-pedido justo después de que el pedido ya se
  // grabó. Si lanzara, el error subiría hasta el `catch` que pinta el banner
  // rojo de "error al crear" y la navegación al pedido no ocurriría: el vendedor
  // creería que falló, lo reintentaría, y el pedido quedaría DUPLICADO.
  //
  // Avisar es lo último y lo menos importante de todo el flujo. Que se pierda un
  // aviso es un problema; que se cobre dos veces, no.
  try {
    avisar(datos, ventana)
  } catch (e) {
    try { console.error('[aviso-padre] falló el aviso del pedido:', e) } catch {}
  }
}

/**
 * Le pasa al inbox la hoja del pedido ya convertida en foto, para que se la mande
 * al cliente por WhatsApp sin que el vendedor salga del chat.
 *
 * Mismo canal y misma validación de destino que el aviso del pedido creado: al
 * origen exacto del padre, NUNCA a '*'. Acá pesa todavía más, porque el mensaje
 * lleva la hoja entera del cliente (nombre, dirección, celular, lo que compró).
 *
 * ⚠️ A diferencia de `avisarPedidoCreado`, esta función NO puede fallar en
 * silencio: si no se envía, el vendedor cree que el cliente ya tiene su hoja y el
 * cliente nunca la recibe. Por eso devuelve `{ ok, motivo }` en vez de tragarse
 * el problema — pero tampoco lanza, para que un fallo del navegador no reviente
 * la pantalla del pedido.
 */
export function enviarHojaPedido(
  { pedidoId, imagen } = {},
  ventana = typeof window !== 'undefined' ? window : undefined,
) {
  try {
    if (!ventana) return { ok: false, motivo: 'esta pantalla no está abierta en un navegador' }
    if (!pedidoId) return { ok: false, motivo: 'falta el número del pedido' }
    // El formato se valida acá y no allá: el inbox recibe esto de un iframe y no
    // tiene por qué confiar en que sea una foto.
    if (typeof imagen !== 'string' || !imagen.startsWith('data:image/jpeg;base64,')) {
      return { ok: false, motivo: 'la hoja no quedó como una foto JPG válida' }
    }

    const referrer = ventana.document?.referrer
    const destino = origenDelPadre(referrer)
    if (!esOrigenInbox(destino)) {
      return {
        ok: false,
        motivo: `quien abrió esta pantalla no es un inbox nuestro (referrer: ${referrer || 'vacío'})`,
      }
    }

    // Sin padre no hay a quién mandarle nada. Pasa cuando la sesión venció y el
    // rodeo por el login terminó abriendo la pantalla suelta, en su propia
    // pestaña: el referrer sigue diciendo "inbox" pero ya no hay iframe.
    const padre = ventana.parent
    if (!padre || padre === ventana || typeof padre.postMessage !== 'function') {
      return { ok: false, motivo: 'esta pantalla ya no está dentro del inbox' }
    }

    padre.postMessage({ tipo: 'hoja-pedido', pedidoId, imagen }, destino)
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e?.message || 'el navegador rechazó el envío' }
  }
}

function avisar({ pedidoId, montoTotal, url }, ventana) {
  // Sin ventana estamos en el servidor. No es un problema y no se avisa.
  if (!ventana) return
  const referrer = ventana.document?.referrer
  const destino = origenDelPadre(referrer)
  if (!esOrigenInbox(destino)) {
    // Que el silencio deje rastro. Un aviso que no sale es indistinguible de uno
    // que sí salió, y eso es justo lo que haría indiagnosticable el caso real:
    // si la sesión del CRM está vencida, el rodeo por el login puede devolverte
    // a esta pantalla sin `embed=1` y el pedido se crea sin que el inbox se
    // entere nunca. A esta función solo se la llama en modo embed, así que
    // llegar acá siempre es algo que alguien debería poder ver en la consola.
    const consola = ventana.console || (typeof console !== 'undefined' ? console : null)
    consola?.warn?.(
      `[aviso-padre] NO se avisó del pedido: quien enmarca no es un inbox nuestro (referrer: ${referrer || 'vacío'})`,
    )
    return
  }
  ventana.parent?.postMessage(
    { tipo: 'pedido-creado', pedidoId, montoTotal: montoRedondeado(montoTotal), url },
    destino,
  )
}
