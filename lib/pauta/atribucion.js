// lib/pauta/atribucion.js
// Lógica pura del tablero de pauta: no sabe de HTTP ni de base de datos, así
// que se prueba entera sin levantar nada (scripts/test-pauta.mjs).

import { FECHA_PISO, TIENDAS } from './constantes.js'

/**
 * Teléfono → últimos 9 dígitos. El CRM guarda 09xxxxxxxx y el inbox
 * 593xxxxxxxxx; el sufijo de 9 emparejan ambos. Mismo criterio que
 * lib/inbox-supabase.js, que ya lo usa para el chat dentro del pedido.
 */
export function tail9(telefono) {
  return String(telefono || '').replace(/\D/g, '').replace(/^593/, '').replace(/^0+/, '').slice(-9)
}

/** Cuenta del inbox ('IND'|'MANDI') → tienda del CRM ('INDSTORE'|'MANDARINA'|null). */
export function tiendaDeCuenta(cuenta) {
  return TIENDAS.find((t) => t.cuentaInbox === cuenta)?.id || null
}

/**
 * ¿El pedido cae dentro de la ventana de atribución?
 * Un pedido ANTERIOR al primer contacto no cuenta: ese cliente ya compraba
 * antes de ver el anuncio y no es mérito de la pauta.
 */
export function dentroDeVentana(primerContacto, fechaPedido, dias) {
  const inicio = new Date(primerContacto).getTime()
  const pedido = new Date(fechaPedido).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(pedido)) return false
  if (pedido < inicio) return false
  return pedido - inicio < dias * 24 * 60 * 60 * 1000
}

/**
 * Regla R1: de qué anuncio es la persona. Si llegó por varios, gana el ÚLTIMO
 * anterior al pedido — mismo criterio que Meta, para que las dos columnas de
 * ROAS sean comparables. Sin pedido, gana el más reciente.
 * En caso de empate de fecha, gana el que venga primero en el array (sort estable).
 */
export function ultimoAnuncioAntesDe(referrals, fechaPedido) {
  if (!Array.isArray(referrals) || referrals.length === 0) return null
  const tope = fechaPedido ? new Date(fechaPedido).getTime() : Infinity
  const candidatos = referrals
    .filter((r) => r?.adId && new Date(r.fecha).getTime() <= tope)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  return candidatos[0]?.adId ?? null
}

/**
 * ROAS = venta ÷ gasto. Devuelve null si no hay gasto conocido.
 * NUNCA Infinity: un anuncio sin gasto mapeado daría ROAS infinito y la
 * pantalla mentiría justo donde más caro sale creerle.
 */
export function roasDe(venta, gasto) {
  const g = Number(gasto)
  if (!Number.isFinite(g) || g <= 0) return null
  return Number(venta || 0) / g
}

/**
 * Cuánto se aleja lo verificable de lo que promete Meta, como fracción.
 * -0,75 = el CRM solo ve el 25% de lo que Meta atribuye.
 */
export function brechaRoas(roasMeta, roasCrm) {
  if (roasMeta == null || roasCrm == null) return null
  if (!Number.isFinite(roasMeta) || roasMeta <= 0) return null
  return (roasCrm - roasMeta) / roasMeta
}

/** Ninguna consulta puede pedir datos de pauta anteriores al piso. */
export function recortarFechaPiso(desde) {
  return !desde || desde < FECHA_PISO ? FECHA_PISO : desde
}
