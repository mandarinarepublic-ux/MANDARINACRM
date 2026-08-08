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
 * Le avisa al inbox que enmarcó esta pantalla. Si no hay padre reconocible, no
 * hace nada: es normal cuando la pantalla se usa suelta, sin iframe.
 *
 * `ventana` se inyecta para poder probarlo; en la app se llama sin argumentos.
 */
export function avisarPedidoCreado({ pedidoId, montoTotal, url }, ventana = typeof window !== 'undefined' ? window : undefined) {
  if (!ventana) return
  const destino = origenDelPadre(ventana.document?.referrer)
  if (!esOrigenInbox(destino)) return
  ventana.parent?.postMessage({ tipo: 'pedido-creado', pedidoId, montoTotal, url }, destino)
}
