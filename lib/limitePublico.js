// lib/limitePublico.js — Tope de envíos a /api/publico/pago (12-nov-2026).
//
// El recuadro de pago de la tienda es PÚBLICO: sin tope, un script puede crear
// compras sin fin, martillar a Shopify con cálculos o subir fotos y crear pedidos
// retenidos en el CRM. Se cuenta por IP (y por compra) en ventanas fijas.
//
// ☠️ Topes GENEROSOS por IP: en Ecuador muchos celulares de Claro/Movistar salen a
// internet por la MISMA IP (CGNAT). Un tope apretado frenaría a clientes reales.
// ☠️ Si el contador falla (Supabase caído), DEJA PASAR: el tope nunca puede ser
// la razón por la que no se vende.
//
// El conteo vive en la base (crm.limites_publicos + crm.sumar_limite, atómico)
// porque la ruta corre en varias funciones de Vercel a la vez.
// SQL: docs/sql/2026-11-12-limite-pago-publico.sql

import { createHash } from 'node:crypto'
import { getSupabase } from './supabase.js'

// ip: por IP cada 10 minutos · compra: por compra cada 60 minutos.
// `estado` NO está: la pantalla lo consulta en bucle mientras paga.
export const TOPES = {
  iniciar:       { ip: 60 },
  cotizar:       { ip: 60, compra: 25 },
  transferencia: { ip: 60, compra: 40 },
  intento:       { ip: 40, compra: 15 },
  comprobante:   { ip: 12, compra: 6 },
}
export const MINUTOS_IP = 10
export const MINUTOS_COMPRA = 60

export const MENSAJE_TOPE = 'Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentar, o escríbenos por WhatsApp.'

/** La IP del cliente según Vercel (x-real-ip la pone Vercel; el cliente no la puede falsear). */
export function ipDe(req) {
  const h = (k) => String(req?.headers?.get?.(k) || '').trim()
  const real = h('x-real-ip')
  if (real) return real
  const primera = h('x-forwarded-for').split(',')[0].trim()
  return primera || 'sin-ip'
}

/** Inicio de la ventana de N minutos que contiene `ms` (ISO). */
export function ventanaDe(ms, minutos) {
  const largo = minutos * 60000
  return new Date(Math.floor(ms / largo) * largo).toISOString()
}

/** Clave del contador. La IP va como hash: la tabla no guarda datos de nadie. */
export function claveDe(tipo, valor, accion) {
  const hash = createHash('sha256').update(`mandarina-pago|${tipo}|${valor}`).digest('hex').slice(0, 24)
  return `${accion}:${tipo}:${hash}`
}

/** ¿El conteo pasó el tope? Un conteo desconocido (contador caído) no excede. */
export function excede(cuenta, tope) {
  return typeof cuenta === 'number' && cuenta > tope
}

async function sumar(clave, ventana) {
  try {
    const { data, error } = await getSupabase().rpc('sumar_limite', { p_clave: clave, p_ventana: ventana })
    if (error) throw new Error(error.message)
    return typeof data === 'number' ? data : null
  } catch (e) {
    console.error('[limitePublico] contador caído, se deja pasar:', e.message)
    return null
  }
}

/**
 * Cuenta este envío y dice si pasa. `checkoutId` es opcional (no existe al iniciar).
 * → { ok: true } | { ok: false, motivo: 'ip' | 'compra' }
 */
export async function revisarLimite({ req, accion, checkoutId = null, ahora = Date.now() }) {
  const tope = TOPES[accion]
  if (!tope) return { ok: true }
  const cuentas = await Promise.all([
    sumar(claveDe('ip', ipDe(req), accion), ventanaDe(ahora, MINUTOS_IP)),
    tope.compra && checkoutId
      ? sumar(claveDe('compra', checkoutId, accion), ventanaDe(ahora, MINUTOS_COMPRA))
      : Promise.resolve(null),
  ])
  if (excede(cuentas[0], tope.ip)) return { ok: false, motivo: 'ip' }
  if (tope.compra && excede(cuentas[1], tope.compra)) return { ok: false, motivo: 'compra' }
  return { ok: true }
}
