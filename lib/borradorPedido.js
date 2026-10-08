// lib/borradorPedido.js — El borrador del Pedido Nuevo. Regla pura, sin
// navegador ni base, para poder probarla sola. La pantalla es
// app/dashboard/nuevo-pedido/page.js.
//
// ☠️ POR QUÉ EXISTE (7-oct-2026): en el celular, bajar con el dedo desde arriba
// es "refrescar la página" para el navegador. El vendedor perdía el pedido a
// medio llenar (cliente, prendas, fotos, pagos) y tenía que volver a meter todo.
// Se guarda mientras se llena y, al volver, se pregunta si recuperarlo.

export const VERSION_BORRADOR = 1

/** Más viejo que esto, no se ofrece: un pedido de ayer ya no es "el que estaba llenando". */
export const VIGENCIA_MS = 12 * 60 * 60 * 1000

/** La llave en localStorage: por usuario y, dentro del inbox, por cliente. */
export function llaveBorrador(usuarioId, { embed = false, celular = '' } = {}) {
  const base = `mp_borrador_pedido:${usuarioId || 'anonimo'}`
  // En el inbox cada chat es un cliente distinto: el borrador de uno no puede
  // aparecer al abrir el pedido de otro.
  return embed ? `${base}:inbox:${celular || 'sin-celular'}` : base
}

const esDataUrl = (v) => typeof v === 'string' && v.startsWith('data:')

/**
 * ¿Hay trabajo que se perdería? Lo que llega precargado (nombre y celular desde
 * el inbox, el cliente fijo de YAW) NO cuenta: eso no costó nada escribirlo.
 */
export function hayTrabajo(estado) {
  if (!estado) return false
  const c = estado.cliente || {}
  return (estado.items?.length || 0) > 0
    || Boolean(String(c.cedula || '').trim())
    || Boolean(String(c.email || '').trim())
    || Boolean(String(estado.notasVendedor || '').trim())
    || (estado.pagos || []).some(p => parseFloat(p?.monto || 0) > 0)
}

/**
 * Lo que se guarda. Las fotos de las prendas ya están subidas (son URLs); el
 * comprobante de pago viaja en base64 y puede pesar varios MB, más que todo el
 * espacio de localStorage: se quita y se avisa que hay que volver a subirlo.
 */
export function armarBorrador(estado, ahora = Date.now()) {
  let sinComprobante = false
  const pagos = (estado.pagos || []).map((p) => {
    if (esDataUrl(p?.fotoComprobante)) {
      sinComprobante = true
      const { fotoComprobante, ...resto } = p
      return resto
    }
    return p
  })
  return {
    v: VERSION_BORRADOR,
    guardado: ahora,
    sinComprobante,
    datos: {
      tienda: estado.tienda,
      clienteId: estado.clienteId ?? null,
      cliente: estado.cliente,
      tipoId: estado.tipoId,
      emitirFactura: estado.emitirFactura,
      usarMapa: estado.usarMapa,
      items: estado.items || [],
      pagos,
      direccionTexto: estado.direccionTexto || '',
      latitud: estado.latitud ?? null,
      longitud: estado.longitud ?? null,
      fechaEntrega: estado.fechaEntrega,
      notasVendedor: estado.notasVendedor || '',
      step: estado.step || 1,
      sucursalIdVendido: estado.sucursalIdVendido ?? null,
    },
  }
}

/** El borrador leído, si sirve; null si no existe, es de otra versión, está vencido o roto. */
export function borradorVigente(texto, ahora = Date.now()) {
  if (!texto) return null
  let b
  try { b = JSON.parse(texto) } catch { return null }
  if (!b || b.v !== VERSION_BORRADOR || typeof b.guardado !== 'number' || !b.datos) return null
  if (ahora - b.guardado > VIGENCIA_MS || ahora < b.guardado - 60_000) return null
  if (!hayTrabajo(b.datos)) return null
  return b
}

/** "hace 5 min", "hace 2 h". */
export function haceCuanto(guardado, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - guardado) / 60000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.round(min / 60)} h`
}

/** Una línea para reconocer el pedido: "MARÍA PÉREZ · 3 prendas · $85.00". */
export function resumenBorrador(b) {
  const d = b?.datos || {}
  const partes = []
  const nombre = String(d.cliente?.nombre || '').trim()
  if (nombre) partes.push(nombre)
  const n = d.items?.length || 0
  if (n) partes.push(`${n} ${n === 1 ? 'prenda' : 'prendas'}`)
  const total = (d.items || []).reduce((s, i) => s + (parseFloat(i?.precioUnit || 0) * parseInt(i?.cantidad || 1)), 0)
  if (total > 0) partes.push(`$${total.toFixed(2)}`)
  return partes.join(' · ') || 'Pedido sin terminar'
}
