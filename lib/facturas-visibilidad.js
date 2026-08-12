// lib/facturas-visibilidad.js
// ¿Se muestra el botón de emitir factura, y de qué color?
//
// Esto vivía suelto en el JSX de la pantalla del pedido y preguntaba por
// `pedido.EMITIR_FACTURA`, un campo que NADIE escribe: la API devuelve
// `FACTURA_SOLICITADA`. Resultado: `undefined === 'TRUE'` es falso siempre y el
// botón no se dibujó ni una vez desde que existe. Acá se puede probar.

/** ¿El pedido YA tiene factura? Mirar las DOS columnas. */
export function yaFacturado(pedido) {
  return Boolean(pedido?.FACTURA_ID || pedido?.FACTURA_PDF_URL)
}

/**
 * ¿Se pidió factura al crear el pedido?
 *
 * Se compara en mayúsculas y pasando por String a propósito: hoy `boolStr`
 * devuelve 'TRUE'/'FALSE', pero si mañana llega un booleano real o un 'true'
 * en minúscula, una comparación cruda apagaría la pantalla sin avisar.
 */
export function pidioFactura(pedido) {
  return String(pedido?.FACTURA_SOLICITADA ?? '').toUpperCase() === 'TRUE'
}

/**
 * Qué botón corresponde:
 *   'PENDIENTE' → pidió factura y falta. Amarillo, visible: algo falta.
 *   'OPCIONAL'  → no pidió factura y no la tiene. Gris: es una decisión nueva.
 *   null        → ya está facturado, o el usuario no es ADMIN.
 *
 * Que devuelva null cuando ya hay factura es lo que impide emitir una SEGUNDA
 * al SRI desde la pantalla. El candado de verdad igual está en el servidor
 * (app/api/factura/emitir/route.js): esconder un botón no protege de un doble
 * toque ni de una pestaña vieja.
 */
export function botonFactura(pedido, rol) {
  if (!pedido) return null
  if (rol !== 'ADMIN') return null
  if (yaFacturado(pedido)) return null
  return pidioFactura(pedido) ? 'PENDIENTE' : 'OPCIONAL'
}
