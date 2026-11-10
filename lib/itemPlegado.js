// lib/itemPlegado.js
//
// ¿Con qué forma aparece una prenda recién agregada al pedido nuevo? Puro: sin
// base, sin red, sin '@/'.
//
// Antes TODAS nacían abiertas (color, talla, fotos…): con dos o tres prendas la
// pantalla se llenaba y el resumen (total y número de prendas) quedaba muy abajo.
// Lo que viene del buscador ya trae talla, cantidad y precio elegidos, así que
// nace PLEGADO: la cabecera ya dice producto, talla, área y subtotal.
//
// ☠️ Lo que le falta algo nace ABIERTO. Es la copia de DUPLICAR (sin talla ni
// precio, a propósito): plegarla escondería justo los campos que hay que llenar.

export function nacePlegado(item) {
  if (!item) return false
  const cantidad = parseInt(item.cantidad || 0)
  const precioTxt = item.precioUnit
  const precio = precioTxt === '' || precioTxt === undefined || precioTxt === null ? NaN : parseFloat(precioTxt)
  const talla = String(item.talla || '').trim()
  return cantidad >= 1 && precio >= 0 && talla !== ''
}

/** Id estable para la `key` de React: con el índice, al duplicar o borrar, el
 *  abierto/plegado de una prenda saltaba a la vecina. */
let n = 0
export function nuevoUid() {
  n += 1
  return `it-${Date.now().toString(36)}-${n}`
}
