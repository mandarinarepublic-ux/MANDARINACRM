// lib/metaCapi.js
// Envío del evento Purchase a la Conversions API de Meta, DIRECTO desde el CRM.
//
// Antes esto pasaba por un webhook de Make ("CAPI_MANDARINA Y INDSTORE CONECTADO
// A CRM"): el CRM mandaba los datos del cliente en claro, Make los hasheaba y los
// reenviaba a Meta. Este módulo hace exactamente lo mismo sin intermediario, para
// poder dar de baja esa suscripción.
//
// Se replica el comportamiento del escenario al pie de la letra para no alterar
// el matching que Meta ya venía haciendo:
//   - SHA-256 de email/teléfono/nombre/apellido/cédula/ciudad
//   - email, nombre, apellido y ciudad en minúsculas y recortados
//   - country siempre 'EC'
//   - event_name 'Purchase', action_source 'chat' (la venta se cierra por WhatsApp)
//   - event_id = PEDIDO_ID, que además deduplica contra el pixel de la web
//   - currency USD, value = monto total, order_id = PEDIDO_ID
//
// Mejora sobre Make: el teléfono se normaliza a formato internacional sin '+'
// (593…) ANTES de hashear. Make hasheaba lo que le llegara, así que un número
// guardado como '0991234567' generaba un hash que Meta nunca podía emparejar.

import crypto from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

/** SHA-256 en hexadecimal, o undefined si el valor viene vacío. */
function hash(valor) {
  const v = String(valor ?? '').trim()
  if (!v) return undefined
  return crypto.createHash('sha256').update(v).digest('hex')
}

/** Igual que hash() pero pasando a minúsculas primero (email, nombre, ciudad). */
function hashLower(valor) {
  const v = String(valor ?? '').trim().toLowerCase()
  if (!v) return undefined
  return crypto.createHash('sha256').update(v).digest('hex')
}

/**
 * Teléfono ecuatoriano a formato internacional sin '+' ni separadores, que es lo
 * que Meta espera antes del hash: '099 123 4567' → '593991234567'.
 */
export function normalizarTelefono(valor) {
  let t = String(valor ?? '').replace(/\D/g, '')
  if (!t) return ''
  if (t.startsWith('593')) return t
  if (t.startsWith('0')) return '593' + t.slice(1)
  if (t.length === 9) return '593' + t          // sin el 0 inicial
  return t
}

/** ¿A qué pixel va cada tienda? Mismo criterio que el router de Make. */
export function pixelDeTienda(tiendaId) {
  const esInd = String(tiendaId || '').toUpperCase().includes('IND')
  return esInd
    ? process.env.META_PIXEL_INDSTORE
    : process.env.META_PIXEL_MANDARINA
}

/** ¿Está configurado el envío directo? Si no, el llamador puede usar Make. */
export function capiConfigurado() {
  return Boolean(
    process.env.META_CAPI_TOKEN &&
    (process.env.META_PIXEL_MANDARINA || process.env.META_PIXEL_INDSTORE)
  )
}

/**
 * Envía el Purchase a Meta. No lanza nunca: devuelve {ok, error} para que el
 * llamador decida, porque esto no debe impedir que se registre una venta.
 */
export async function enviarPurchase({ pedidoId, tiendaId, cliente, montoTotal }) {
  const pixelId = pixelDeTienda(tiendaId)
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return { ok: false, error: 'CAPI no configurado' }

  const userData = {
    em: hashLower(cliente?.email),
    ph: hash(normalizarTelefono(cliente?.celular)),
    fn: hashLower(cliente?.nombre),
    // El CRM guarda el nombre completo en un solo campo; Make mandaba apellido
    // vacío y aquí se mantiene igual para no cambiar el matching.
    ln: undefined,
    ct: hashLower(cliente?.ciudad),
    external_id: hash(cliente?.cedula),
    country: hashLower('EC'),
  }
  // Meta rechaza las claves con valor nulo.
  for (const k of Object.keys(userData)) if (!userData[k]) delete userData[k]

  const evento = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: pedidoId,                    // deduplica contra el pixel del sitio
    action_source: 'chat',                 // la venta se cierra por WhatsApp
    user_data: userData,
    custom_data: {
      currency: 'USD',
      value: Number(parseFloat(montoTotal || 0).toFixed(2)),
      order_id: pedidoId,
    },
  }

  try {
    const res = await fetch(`${GRAPH}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [evento], access_token: token }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // El detalle de Meta es lo único que permite diagnosticar un token vencido
      // o un pixel mal puesto: sin esto el fallo es invisible.
      const detalle = body?.error?.message || `HTTP ${res.status}`
      console.error(`META CAPI ${pedidoId} (pixel ${pixelId}): ${detalle}`)
      return { ok: false, error: detalle }
    }
    return { ok: true, recibidos: body?.events_received ?? 0, pixelId }
  } catch (e) {
    console.error(`META CAPI ${pedidoId}: ${e.message}`)
    return { ok: false, error: e.message }
  }
}
