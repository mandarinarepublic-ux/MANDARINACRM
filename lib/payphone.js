// lib/payphone.js — Links de pago con Payphone (API Link) desde el CRM.
//
// 10-nov-2026: misma integración que los dos inbox (wa-inbox-next / ind-inbox-next),
// misma app "Inbox Mandarina" en Payphone Developer. Acá se usa desde la pantalla
// /dashboard/link-pago: el vendedor pone celular y valor, y el link sale por el
// WhatsApp de SU celular (wa.me), no por la API de Meta.
//
// Doc: https://docs.payphone.app/api-link
//
// Credenciales SOLO por env (nunca en el código):
//   PAYPHONE_TOKEN                → el token de la app (el mismo de los inbox)
//   PAYPHONE_STORE_ID_MANDARINA   → tienda "Mandarina Republic" en Payphone
//   PAYPHONE_STORE_ID_INDSTORE    → tienda "Ind Store" en Payphone
//
// ☠️ Montos en CENTAVOS y amount = amountWithoutTax + amountWithTax + tax + service + tip,
//    exacto al centavo, o Payphone responde 400 "Validaciones fallidas".
// ☠️ clientTransactionId: máximo 15 caracteres.
// ☠️ El primer cobro de una tienda nueva lo puede rechazar el antifraude ("no pasó
//    validaciones de seguridad"); el mismo pago, minutos después, pasó.

// PowerShell mete un BOM invisible al cargar envs: el header Authorization
// revienta solo en producción. Se limpia al leer.
const limpiar = (s) => String(s || '').replace(/[^\x21-\x7E]/g, '')

const API = 'https://pay.payphonetodoesposible.com/api'

// IVA de Ecuador. El valor que escribe el vendedor YA lo incluye (decisión de
// Rodrigo, 10-nov-2026): $35 cobra $35 en total.
export const IVA = 0.15
export const HORAS_VIGENCIA = 48

/**
 * Parte un total con IVA incluido en lo que pide Payphone, en centavos. La base
 * se redondea y el IVA es lo que falta: la suma cuadra siempre al centavo.
 *   35 → { amount: 3500, amountWithTax: 3043, tax: 457 }
 */
export function desglosarIva(total, iva = IVA) {
  const amount = Math.round(Number(total) * 100)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const amountWithTax = Math.round(amount / (1 + iva))
  return { amount, amountWithTax, tax: amount - amountWithTax }
}

// El teléfono del cliente viaja dentro del clientTransactionId (base 36, 8
// caracteres + "-" + 6 al azar = 15). Es el MISMO formato que usan los inbox:
// así, cuando Payphone avise un pago hecho con un link del CRM, el inbox sabe a
// qué chat ponerle la nota verde "PAGADO".
const LARGO_TEL = 8
const MAX_TEL = 36 ** LARGO_TEL - 1

function azar(n, rnd = Math.random) {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(rnd() * 36).toString(36)
  return s
}

export function idTransaccion(telefono, rnd = Math.random) {
  const digitos = String(telefono || '').replace(/\D/g, '')
  const num = digitos ? Number(digitos) : NaN
  if (digitos.length >= 7 && Number.isSafeInteger(num) && num <= MAX_TEL) {
    return num.toString(36).padStart(LARGO_TEL, '0') + '-' + azar(6, rnd)
  }
  return 'x' + azar(14, rnd)
}

/** Lo inverso de idTransaccion: el teléfono, o '' si el id no lo trae. */
export function telefonoDeId(id) {
  const m = String(id || '').match(/^([0-9a-z]{8})-[0-9a-z]{6}$/)
  if (!m) return ''
  const n = parseInt(m[1], 36)
  return Number.isSafeInteger(n) && n > 0 ? String(n) : ''
}

/** El cuerpo del POST /Links, aparte para probarlo sin red. */
export function cuerpoLink({ monto, telefono, storeId, reference, rnd }) {
  const d = desglosarIva(monto)
  if (!d) throw new Error('El valor tiene que ser un número mayor a cero')
  return {
    amount: d.amount,
    amountWithoutTax: 0,
    amountWithTax: d.amountWithTax,
    tax: d.tax,
    service: 0,
    tip: 0,
    currency: 'USD',
    clientTransactionId: idTransaccion(telefono, rnd),
    storeId,
    reference: String(reference || 'Pago').slice(0, 100),
    additionalData: String(telefono || '').replace(/\D/g, '').slice(0, 250),
    oneTime: true,
    expireIn: HORAS_VIGENCIA,
    isAmountEditable: false,
  }
}

/** La respuesta exitosa es el link pelado (a veces entre comillas JSON). */
export function leerRespuestaLink(texto) {
  let v = String(texto || '').trim()
  try { v = JSON.parse(v) } catch {}
  if (typeof v === 'string' && /^https:\/\/\S+$/.test(v.trim())) return v.trim()
  return null
}

/**
 * Qué dice Payphone de un link, a partir de GET /Sale/client/{clientTransactionId}.
 * La respuesta puede ser una venta o una lista (un link puede tener un intento
 * rechazado y después uno aprobado): manda el APROBADO si hay alguno.
 *   statusCode 3 = aprobada · 2 = cancelada/rechazada · 1 = pendiente
 * Devuelve { estado: 'PAGADO'|'RECHAZADO'|'PENDIENTE', transactionId?, tarjeta?, fecha? }
 */
export function estadoDeConsulta(data) {
  const ventas = (Array.isArray(data) ? data : data ? [data] : []).filter((v) => v && typeof v === 'object')
  const aprobada = ventas.find((v) => Number(v.statusCode) === 3 || v.transactionStatus === 'Approved')
  if (aprobada) {
    return {
      estado: 'PAGADO',
      transactionId: aprobada.transactionId != null ? String(aprobada.transactionId) : null,
      tarjeta: aprobada.cardBrand || null,
      fecha: aprobada.date || null,
    }
  }
  const rechazada = ventas.find((v) => Number(v.statusCode) === 2 || v.transactionStatus === 'Canceled')
  if (rechazada) {
    return {
      estado: 'RECHAZADO',
      transactionId: rechazada.transactionId != null ? String(rechazada.transactionId) : null,
      tarjeta: rechazada.cardBrand || null,
      fecha: null,
    }
  }
  return { estado: 'PENDIENTE', transactionId: null, tarjeta: null, fecha: null }
}

/**
 * Pregunta a Payphone por un link (por su clientTransactionId). Un 404 es
 * "nadie lo ha pagado todavía": eso es PENDIENTE, no un error.
 */
export async function consultarLink(clientTransactionId) {
  const token = limpiar(process.env.PAYPHONE_TOKEN)
  if (!token) throw new Error('Falta PAYPHONE_TOKEN en el CRM')
  const res = await fetch(`${API}/Sale/client/${encodeURIComponent(clientTransactionId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (res.status === 404) return estadoDeConsulta(null)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Payphone GET HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return estadoDeConsulta(data)
}

/** Crea el link en Payphone y devuelve la URL de pago. */
export async function crearLinkPayphone({ monto, telefono, storeId, reference }) {
  const token = limpiar(process.env.PAYPHONE_TOKEN)
  const tienda = limpiar(storeId)
  if (!token || !tienda) {
    throw new Error('Faltan credenciales Payphone en el CRM (PAYPHONE_TOKEN / PAYPHONE_STORE_ID_…)')
  }
  const body = cuerpoLink({ monto, telefono, storeId: tienda, reference })
  const res = await fetch(`${API}/Links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const texto = await res.text().catch(() => '')
  const link = res.ok ? leerRespuestaLink(texto) : null
  if (!link) {
    let detalle = texto.slice(0, 200)
    try {
      const d = JSON.parse(texto)
      const desc = (d?.errors || []).flatMap((e) => e?.errorDescriptions || [e?.message]).filter(Boolean)
      detalle = desc.length ? desc.join(' · ') : (d?.message || detalle)
    } catch {}
    throw new Error(`Payphone HTTP ${res.status}: ${detalle}`)
  }
  return { link, clientTransactionId: body.clientTransactionId }
}
