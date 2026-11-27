// lib/rastreoGuia.js — Rastreo de la guía en la web de la transportista.
//
// Pedido de Rodrigo, 27-nov-2026: un botón «Consultar» junto a la guía que abra
// el rastreo de Servientrega: https://www.servientrega.com.ec/Tracking/Index/?guia=9037827902
//
// Solo cuando de verdad se puede rastrear: transportista Servientrega (o sin
// transportista, que en este CRM es Servientrega por defecto) y un número de
// guía hecho de dígitos. En la base hay guías como «IBARRACLV» o «QUITO»
// (RETIRO_TIENDA): con esas el botón llevaría a una página vacía.
// Puro, sin React: tests/rastreo-guia.test.js.

/** URL del rastreo, o null si esa guía no se puede rastrear. */
export function urlRastreoGuia(numero, transportista = '') {
  const t = String(transportista ?? '').trim().toUpperCase()
  if (t && !t.includes('SERVIENTREGA')) return null
  const n = String(numero ?? '').replace(/[\s.-]/g, '')
  if (!/^\d{8,12}$/.test(n)) return null
  return `https://www.servientrega.com.ec/Tracking/Index/?guia=${n}`
}
