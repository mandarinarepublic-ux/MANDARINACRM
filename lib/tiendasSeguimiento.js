// lib/tiendasSeguimiento.js
//
// Las tiendas que tienen página pública de seguimiento. Lo que cambia de una a
// otra vive AQUÍ y solo aquí: qué pedidos busca, marca, colores, WhatsApp, a
// qué tienda vuelve el cliente y quién puede enmarcarla.
//
// Mandarina en mandarinaec.com/pedido → CRM /pedido      (9-oct-2026)
// IND       en indlovers.com/pedido   → CRM /pedido/ind  (10-oct-2026)

import { ORIGENES_TIENDA, ORIGENES_TIENDA_IND } from './origenes.js'

export const TIENDAS_SEGUIMIENTO = Object.freeze({
  mandarina: Object.freeze({
    clave: 'mandarina',
    tiendaId: 'MANDARINA',
    nombre: 'Mandarina Republic',
    corto: 'Mandarina',
    logo: '/logos/logo_mandarina_240.png',
    ejemplo: 'MAN-JAC-6308',
    wa: '593983745757',
    web: 'https://www.mandarinaec.com',
    origenes: ORIGENES_TIENDA,
    promoClave: 'promo_mandarina',
    // Sin colores: usa los de seguimiento.module.css (naranja).
    colores: null,
  }),
  ind: Object.freeze({
    clave: 'ind',
    tiendaId: 'INDSTORE',
    nombre: 'Ind Store',
    corto: 'Ind Store',
    logo: '/logos/logo_indstore.png',
    ejemplo: 'IND-XAV-6302',
    wa: '593999953326',
    web: 'https://indlovers.com',
    origenes: ORIGENES_TIENDA_IND,
    promoClave: 'promo_indstore',
    // El rosado de IND (el mismo de las cotizaciones, lib/tiendaTheme.js).
    colores: Object.freeze({ naranja: '#E91E8C', 'naranja-osc': '#c2185b', 'naranja-cla': '#f06292' }),
  }),
})

/** Lo desconocido o vacío es Mandarina (la página que ya existía). */
export function tiendaSeguimiento(clave) {
  return TIENDAS_SEGUIMIENTO[String(clave || '').toLowerCase()] || TIENDAS_SEGUIMIENTO.mandarina
}
