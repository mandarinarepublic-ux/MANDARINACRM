// Fotos que el inbox le pasa al PEDIDO NUEVO (23-nov-2026).
//
// En el chat, cada foto que manda el cliente tiene «📌 Usar en pedido» → PAGO o
// PRODUCTO. Esa foto YA está guardada en nuestro Storage (inbox-media), así que
// no se vuelve a subir: viaja su URL pública y el CRM la guarda tal cual
// (`api/pedidos` deja pasar cualquier https sin resubirlo a Cloudinary).
//
//   PAGO     → comprobante de un pago por TRANSFERENCIA (paso 3). El monto lo
//              escribe el vendedor: sin monto el pedido no avanza, a propósito.
//   PRODUCTO → foto de PECHO (el frente) de un producto personalizado (paso 2),
//              con todo lo demás vacío para que lo llene el vendedor.
//
// Llega por dos caminos: en la URL (`fotoPago` / `fotoFrente`) cuando el
// formulario se abre con ese clic, o por postMessage cuando ya estaba abierto,
// para SUMAR sin borrar lo que el vendedor ya escribió.
//
// ⚠️ Por qué se valida tanto: lo que se guarde acá termina en la hoja que ve el
// cliente y en la que lee el taller. Solo se acepta una foto PÚBLICA de nuestro
// bucket del inbox; cualquier otra cosa (otro dominio, un data:, javascript:) se
// ignora en silencio.
import { esOrigenInbox } from './origenes.js'

export const TIPO_MENSAJE_FOTO = 'foto-pedido'
export const DESTINOS_FOTO = Object.freeze(['pago', 'producto'])

const HOST_STORAGE = 'piingkecjgoisnxccvaa.supabase.co'
const RUTA_INBOX = '/storage/v1/object/public/inbox-media/'

/** ¿Es una foto pública del bucket del inbox? Nunca lanza. */
export function esFotoDeInbox(url) {
  try {
    const u = new URL(String(url || ''))
    return u.protocol === 'https:' && u.hostname === HOST_STORAGE && u.pathname.startsWith(RUTA_INBOX)
  } catch {
    return false
  }
}

/** Las fotos que vienen en la URL del formulario: { pago, producto } (vacías si no sirven). */
export function fotosDeUrl(searchParams) {
  const leer = (k) => {
    const v = searchParams?.get?.(k) || ''
    return esFotoDeInbox(v) ? v : ''
  }
  return { pago: leer('fotoPago'), producto: leer('fotoFrente') }
}

/**
 * Lee un postMessage del inbox con una foto para el pedido abierto.
 * → { destino, url } o null si no es eso, o no viene de nuestro inbox.
 *
 * `ventana` es la del CRM: el mensaje tiene que venir de QUIEN NOS ENMARCA
 * (`ventana.parent`) y desde el origen exacto de un inbox nuestro.
 */
export function leerFotoPedido(e, ventana = typeof window !== 'undefined' ? window : undefined) {
  if (!e || !ventana) return null
  if (!ventana.parent || ventana.parent === ventana || e.source !== ventana.parent) return null
  if (!esOrigenInbox(e.origin)) return null
  const d = e.data
  if (!d || typeof d !== 'object' || d.tipo !== TIPO_MENSAJE_FOTO) return null
  if (!DESTINOS_FOTO.includes(d.destino)) return null
  if (!esFotoDeInbox(d.url)) return null
  return { destino: d.destino, url: d.url }
}

/**
 * Suma la foto como comprobante, SIN pisar lo que ya hay:
 *   · si esa foto ya está en algún pago, no cambia nada;
 *   · si hay un pago todavía vacío (sin monto ni foto), se usa ese y pasa a
 *     TRANSFERENCIA (es el único tipo que lleva comprobante);
 *   · si no, se agrega un pago nuevo por TRANSFERENCIA, sin monto.
 */
export function agregarFotoPago(pagos, url) {
  const lista = Array.isArray(pagos) ? pagos : []
  if (lista.some((p) => p?.fotoComprobante === url)) return lista
  const i = lista.findIndex((p) => !p?.fotoComprobante && !(parseFloat(p?.monto || 0) > 0))
  if (i >= 0) return lista.map((p, j) => (j === i ? { ...p, tipo: 'TRANSFERENCIA', fotoComprobante: url } : p))
  return [...lista, { tipo: 'TRANSFERENCIA', monto: '', notas: '', fotoComprobante: url }]
}
