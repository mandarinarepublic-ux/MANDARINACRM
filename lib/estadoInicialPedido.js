// lib/estadoInicialPedido.js
//
// Con qué estado NACE un pedido. Puro: sin base, sin red, sin '@/'.
//
// ☠️ CASO REAL (9-nov-2026). Un pedido cuyas prendas son TODAS "ENTREGA EN
// TIENDA" (venta de mostrador: el cliente se lleva la prenda en el acto) nacía
// EN_FABRICA, y de ahí no salía nunca:
//   · el auto-avance a DESPACHO solo corre cuando alguien cambia el subestado
//     de una prenda, y una prenda ENTREGADO_TIENDA nace terminada: nadie la toca
//   · la cola de Impresión trae todo EN_FABRICA → se imprimía una hoja de
//     producción sin nada que producir (40 de 46 pedidos así, impresos)
//   · se quedaba para siempre en pendientes hasta que alguien lo cerraba a mano
//     (8 acumulados al 9-nov)
//
// Ahora nace COMPLETADO: no entra a Impresión, Producción, Corte ni Despacho.
// Un pedido MIXTO (una prenda de tienda + otras que se fabrican) sigue naciendo
// EN_FABRICA: ahí sí hay trabajo para el taller.

export const AREA_ENTREGA_TIENDA = 'ENTREGA EN TIENDA'

/** ¿Esta prenda se entrega en el mostrador (no pasa por el taller)? */
export function esEntregaEnTienda(item) {
  return String(item?.area || '').trim().toUpperCase() === AREA_ENTREGA_TIENDA
}

/**
 * 'COMPLETADO' si TODAS las prendas son de entrega en tienda; si no, 'EN_FABRICA'.
 * Sin prendas → 'EN_FABRICA' (nunca se cierra solo un pedido vacío: `.every()`
 * sobre un arreglo vacío da true, y esa mina ya está armada en el auto-avance).
 */
export function estadoInicialPedido(items) {
  const lista = Array.isArray(items) ? items.filter(Boolean) : []
  if (lista.length === 0) return 'EN_FABRICA'
  return lista.every(esEntregaEnTienda) ? 'COMPLETADO' : 'EN_FABRICA'
}
