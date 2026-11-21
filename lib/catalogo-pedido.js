// lib/catalogo-pedido.js
//
// Las listas que ofrece el formulario de pedido: áreas y tallas. Puro: sin
// React, sin base, sin '@/', para poder probarlo solo.
//
// ☠️ POR QUÉ EXISTE (21-nov-2026): el buscador (components/pedido/BuscadorProductos.js)
// tenía 11 áreas y la prenda ya agregada (components/pedido/ItemProducto.js)
// solo 8 — sin `PREMIUM - SIN DISEÑO`, sin `ENTREGA EN TIENDA` y sin opción
// vacía. Al abrir una prenda con un área que no estaba en su lista, el <select>
// mostraba la PRIMERA (ESTAMPADO) aunque lo guardado fuera otra: la pantalla
// mentía y bastaba tocar otro campo para que nadie notara la diferencia. Una
// sola lista para las dos, y la que se guarda nunca se esconde (ver
// `opcionesConValor`).
//
// ⚠️ No es la lista de lib/areas-filtrables.js: esa es para FILTRAR bandejas y
// no lleva combinaciones. Esta es la de lo que se puede GUARDAR en un ítem.

/** Áreas que se le pueden asignar a una prenda. El orden es el del buscador. */
export const AREAS = [
  'ESTAMPADO',
  'SUBLIMACION',
  'BORDADO',
  'ESTAMPADO + SUBLIMACION',
  'ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO',
  'ESTAMPADO + SUBLIMACION + BORDADO',
  'PREMIUM - SIN DISEÑO',
  'PRODUCTO SIN DISEÑO',
  'ENTREGA EN TIENDA',
]

// Separadas para agruparlas con <optgroup>: en el celular la lista es larga y
// "12" junto a "XS" se confundía con una talla de adulto.
export const TALLAS_ADULTO = ['4XL', '3XL', '2XL', 'XL', 'L', 'M', 'S', 'XS']
export const TALLAS_NINO = ['12', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1 AÑO']
export const TALLAS = [...TALLAS_ADULTO, ...TALLAS_NINO]

/**
 * La lista + el valor guardado si no está en ella.
 *
 * Un pedido viejo (o un área que se dejó de ofrecer) trae un valor que la lista
 * de hoy no tiene. Sin esto el <select> lo pinta como la primera opción y, al
 * guardar cualquier otro cambio, se pisa en silencio.
 */
export function opcionesConValor(lista, valor) {
  const v = String(valor ?? '').trim()
  if (!v || lista.includes(v)) return lista
  return [...lista, v]
}

/** ¿El valor guardado es uno que la lista de hoy ya no ofrece? */
export function valorFueraDeLista(lista, valor) {
  const v = String(valor ?? '').trim()
  return !!v && !lista.includes(v)
}

/**
 * ¿Esta área lleva fotos del diseño?
 *
 * No las llevan las prendas sin diseño (`PRODUCTO SIN DISEÑO`,
 * `PREMIUM - SIN DISEÑO`, y cualquier otra "SIN DISEÑO" que aparezca) ni lo que
 * se entrega en tienda: ahí no hay arte que estampar y los cuatro recuadros de
 * fotos solo estorban. Antes solo se escondían con el texto exacto
 * `PRODUCTO SIN DISEÑO`.
 */
export function areaSinFotos(area) {
  const a = String(area ?? '').trim().toUpperCase()
  if (!a) return false
  return a.includes('SIN DISEÑO') || a.includes('SIN DISENO') || a === 'ENTREGA EN TIENDA'
}
