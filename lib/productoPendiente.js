// Producto "a medio agregar" en el paso 2 del pedido nuevo.
//
// 17-nov-2026: el vendedor llenaba un 2.º o 3.er producto y daba "Siguiente"
// sin tocar "+ Agregar al pedido". El paso 2 se desmonta al avanzar, así que
// ese producto se perdía EN SILENCIO y el pedido salía con menos prendas.
//
// Ahora cada formulario abierto reporta lo que tiene escrito y, al dar
// Siguiente:
//   - completo           → se agrega solo
//   - a medias           → NO avanza y dice qué falta (perderlo es peor que frenar)
//   - vacío / sin tocar  → se ignora (el form de YAW siempre está abierto)
//
// Las reglas de "completo" son LAS MISMAS que las del botón "+ Agregar al
// pedido" de cada formulario: si cambian allá, cambian acá (mismas funciones).

/** Lo que le falta a un producto de Shopify, con los nombres que ve el vendedor. */
export function faltantesShopify({ color, talla, area, detalle, cantidad, precio }) {
  return [
    !color && 'Color',
    !talla && 'Talla',
    !area && 'Área',
    !(Number(cantidad) >= 1) && 'Cantidad',
    !(Number(precio) > 0) && 'Precio',
    !detalle && 'Detalle',
  ].filter(Boolean)
}

/** Lo que le falta a un producto personalizado. */
export function faltantesPersonalizado({ nombre, color, talla, area, detalle, cantidad, precio }) {
  return [
    !nombre && 'Nombre',
    !color && 'Color',
    !talla && 'Talla',
    !area && 'Área',
    !(parseInt(cantidad || 0) >= 1) && 'Cantidad',
    !(parseFloat(precio || 0) > 0) && 'Precio',
    !detalle && 'Detalle',
  ].filter(Boolean)
}

/** ¿El vendedor escribió algo en el personalizado? (si no, no hay nada que perder) */
export function personalizadoTocado({ nombre, color, talla, area, detalle, cantidad, precio }, fotos = {}) {
  return Boolean(
    nombre || color || talla || area || detalle ||
    Number(cantidad) > 0 || Number(precio) > 0 ||
    Object.values(fotos || {}).some(Boolean)
  )
}

/**
 * Decide qué hacer con los formularios abiertos al dar "Siguiente".
 * @param {Array<{item, faltan: string[], tocado: boolean} | null>} pendientes
 * @returns {{ agregar: object[], error: string | null }}
 */
export function resolverPendientes(pendientes) {
  const agregar = []
  const incompletos = []
  for (const p of pendientes || []) {
    if (!p || !p.tocado) continue
    if (!p.faltan || p.faltan.length === 0) agregar.push(p.item)
    else incompletos.push(p)
  }
  if (incompletos.length > 0) {
    const p = incompletos[0]
    const nombre = p.item?.productoNombre ? ` (${p.item.productoNombre})` : ''
    return {
      agregar: [],
      error: `⚠️ Tienes un producto sin agregar${nombre}. Falta: ${p.faltan.join(', ')}. Complétalo, o quítalo con ✕ si no va en el pedido.`,
    }
  }
  return { agregar, error: null }
}
