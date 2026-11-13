// lib/reportePagos.js — Lo puro del REPORTE DE LINKS DE PAGO (/dashboard/reporte-pagos).
//
// Pedido de Rodrigo (13-nov-2026): una pestaña SOLO ADMIN para saber si los
// links que se mandan (Payphone y dLocal Go) se están pagando, con el balance
// (cobrado · comisión · neto) y filtros de fechas, tienda y vendedor.
//
// Sin red ni Supabase: se prueba directo (tests/reporte-pagos.test.js).

// Payphone no devuelve comisión por API. Medida con el primer cobro real
// (10-nov-2026: $1 → $0,94) y coincide con lo que publica: 5 % + IVA = 5,75 %.
export const COMISION_PAYPHONE = 0.0575

export const PROVEEDORES = ['PAYPHONE', 'DLOCAL']
export const ESTADOS = ['PAGADO', 'PENDIENTE', 'RECHAZADO', 'EXPIRADO']

const r2 = (n) => Math.round(Number(n) * 100) / 100
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** dLocal status → nuestro estado. Lo desconocido NO cuenta como pagado. */
export function estadoDlocal(status) {
  switch (String(status || '').toUpperCase()) {
    case 'PAID': case 'COMPLETED': return 'PAGADO'
    case 'EXPIRED': return 'EXPIRADO'
    case 'REJECTED': case 'CANCELLED': return 'RECHAZADO'
    default: return 'PENDIENTE'
  }
}

// order_id que arma el inbox: "<telefono>-<Date.now()>". Lo demás (p. ej. un
// pedido de Shopify pagado con dLocal) no es un link nuestro.
const RE_ORDER_INBOX = /^(\d{7,15})-(\d{13})$/

/** El celular que viaja en el order_id de dLocal, o ''. */
export function celularDeOrderDlocal(orderId) {
  const m = String(orderId || '').match(RE_ORDER_INBOX)
  return m ? m[1] : ''
}

/** La tienda por la descripción del cobro (la cuenta dLocal es UNA para las dos). */
export function tiendaDeDescripcion(desc) {
  const d = String(desc || '').toUpperCase()
  if (!d) return null
  return d.includes('IND') ? 'INDSTORE' : 'MANDARINA'
}

/**
 * Un pago de dLocal (GET /v1/payments) → los campos que dLocal sabe de él.
 * Solo lo que es de dLocal: vendedor, origen y tienda ya registrados no se tocan
 * (ver camposParaActualizar).
 */
export function filaDesdeDlocal(p) {
  const estado = estadoDlocal(p?.status)
  const valor = num(p?.amount)
  const pagado = estado === 'PAGADO'
  const nombre = [p?.payer?.first_name, p?.payer?.last_name].filter(Boolean).join(' ').trim()
  return {
    proveedor: 'DLOCAL',
    client_tx_id: String(p?.order_id || p?.id || ''),
    externo_id: p?.id ? String(p.id) : null,
    creado_en: p?.created_date || null,
    valor,
    link: p?.redirect_url || '',
    celular: celularDeOrderDlocal(p?.order_id),
    tienda: tiendaDeDescripcion(p?.description),
    estado,
    pagado_en: pagado ? (p?.approved_date || p?.created_date || null) : null,
    // dLocal manda la comisión y el neto en balance_currency (USD en Ecuador).
    comision: pagado ? num(p?.balance_fee) : null,
    neto: pagado ? num(p?.balance_amount) : null,
    comision_estimada: false,
    tarjeta: p?.card?.issuer || null,
    pagador: nombre || null,
  }
}

/**
 * Qué se actualiza de una fila que YA existe con lo nuevo de dLocal. Lo que
 * pusimos nosotros (vendedor, origen) nunca se pisa; tienda/celular solo se
 * llenan si estaban vacíos. Devuelve null si no cambió nada.
 */
export function camposParaActualizar(existente, nueva) {
  const patch = {}
  for (const k of ['estado', 'pagado_en', 'comision', 'neto', 'comision_estimada', 'tarjeta', 'pagador', 'externo_id', 'transaction_id']) {
    const a = existente?.[k] ?? null
    const b = nueva?.[k] ?? null
    if (b === null) continue
    if (k === 'pagado_en' ? Date.parse(a) !== Date.parse(b) : (num(a) !== null && num(b) !== null ? num(a) !== num(b) : String(a) !== String(b))) {
      patch[k] = b
    }
  }
  for (const k of ['tienda', 'celular', 'link']) {
    if (!existente?.[k] && nueva?.[k]) patch[k] = nueva[k]
  }
  return Object.keys(patch).length ? patch : null
}

/** Comisión y neto estimados de un pago Payphone. */
export function estimarPayphone(valor) {
  const v = num(valor)
  if (v === null) return { comision: null, neto: null }
  const comision = r2(v * COMISION_PAYPHONE)
  return { comision, neto: r2(v - comision) }
}

/**
 * Rango de fechas del filtro (días de calendario en hora de Ecuador, UTC-5,
 * sin horario de verano) → instantes ISO [desde, hasta).
 *   '2026-11-01', '2026-11-13' → 2026-11-01T05:00Z … 2026-11-14T05:00Z
 */
export function rangoEcuador(desde, hasta) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
  if (!ok(desde) || !ok(hasta)) return null
  const ini = new Date(`${desde}T05:00:00.000Z`)
  const fin = new Date(`${hasta}T05:00:00.000Z`)
  fin.setUTCDate(fin.getUTCDate() + 1)
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime()) || fin <= ini) return null
  return { desde: ini.toISOString(), hasta: fin.toISOString() }
}

/** Hoy (fecha de calendario en Ecuador), 'YYYY-MM-DD'. */
export function hoyEcuador(ahora = Date.now()) {
  return new Date(ahora - 5 * 3600000).toISOString().slice(0, 10)
}

/** Aplica los filtros que no van en la consulta (los de lista). */
export function filtrar(filas, { proveedor, tienda, vendedor, estado, origen } = {}) {
  return (filas || []).filter((f) =>
    (!proveedor || f.proveedor === proveedor)
    && (!tienda || (tienda === 'SIN_TIENDA' ? !f.tienda : f.tienda === tienda))
    && (!vendedor || (vendedor === 'SIN_VENDEDOR' ? !f.vendedor_id : String(f.vendedor_id) === String(vendedor)))
    && (!estado || f.estado === estado)
    && (!origen || f.origen === origen))
}

function bolsa() {
  return { links: 0, generado: 0, pagados: 0, cobrado: 0, comision: 0, neto: 0, pendientes: 0, monto_pendiente: 0, rechazados: 0, expirados: 0, comision_estimada: false }
}

function sumar(b, f) {
  const valor = num(f.valor) || 0
  b.links += 1
  b.generado += valor
  if (f.estado === 'PAGADO') {
    b.pagados += 1
    b.cobrado += valor
    b.comision += num(f.comision) || 0
    b.neto += num(f.neto) ?? valor
    if (f.comision_estimada) b.comision_estimada = true
  } else if (f.estado === 'RECHAZADO') b.rechazados += 1
  else if (f.estado === 'EXPIRADO') b.expirados += 1
  else { b.pendientes += 1; b.monto_pendiente += valor }
}

function cerrar(b) {
  for (const k of ['generado', 'cobrado', 'comision', 'neto', 'monto_pendiente']) b[k] = r2(b[k])
  b.tasa_pago = b.links ? Math.round((b.pagados / b.links) * 1000) / 10 : 0
  return b
}

/**
 * El balance: total y desglose por proveedor, tienda y vendedor.
 * `nombres` = { [vendedor_id]: nombre } para etiquetar.
 */
export function resumen(filas, nombres = {}) {
  const total = bolsa()
  const por = { proveedor: {}, tienda: {}, vendedor: {} }
  for (const f of filas || []) {
    sumar(total, f)
    const claves = {
      proveedor: f.proveedor || 'PAYPHONE',
      tienda: f.tienda || 'SIN_TIENDA',
      vendedor: f.vendedor_id ? String(f.vendedor_id) : 'SIN_VENDEDOR',
    }
    for (const [dim, clave] of Object.entries(claves)) {
      if (!por[dim][clave]) por[dim][clave] = bolsa()
      sumar(por[dim][clave], f)
    }
  }
  const lista = (dim, etiqueta) => Object.entries(por[dim])
    .map(([clave, b]) => ({ clave, nombre: etiqueta(clave), ...cerrar(b) }))
    .sort((a, b) => b.cobrado - a.cobrado || b.links - a.links)
  return {
    total: cerrar(total),
    proveedor: lista('proveedor', (c) => (c === 'DLOCAL' ? 'dLocal Go' : 'Payphone')),
    tienda: lista('tienda', (c) => ({ MANDARINA: 'Mandarina', INDSTORE: 'IND STORE', SIN_TIENDA: 'Sin tienda' }[c] || c)),
    vendedor: lista('vendedor', (c) => (c === 'SIN_VENDEDOR' ? 'Sin vendedor (cliente / histórico)' : (nombres[c] || `Usuario ${c}`))),
  }
}

/** Retiros de dLocal (GET /v1/settlements) → lo que se muestra. */
export function filaRetiroDlocal(s) {
  return {
    id: String(s?.settlement_id || ''),
    fecha: s?.date || null,
    pagado_en: s?.payment_date || null,
    solicitado: num(s?.requested_amount),
    comision: num(s?.settlement_fee),
    transferido: num(s?.transfer_amount),
    banco: s?.bank_name || null,
    estado: s?.status || null,
  }
}

// Un link de Payphone vence a las 48 h, pero Payphone nunca avisa "vencido": un
// PENDIENTE más viejo que eso ya no se va a pagar y cuenta como EXPIRADO.
export const HORAS_VIGENCIA_PAYPHONE = 48

export function estadoEfectivo(f, ahora = Date.now()) {
  if (f?.proveedor === 'PAYPHONE' && f?.estado === 'PENDIENTE'
      && ahora - Date.parse(f.creado_en) > HORAS_VIGENCIA_PAYPHONE * 3600000) return 'EXPIRADO'
  return f?.estado || 'PENDIENTE'
}

// ── Payphone: traer pagos que NO quedaron registrados ───────────────────────
// Los links que salieron del inbox antes del 13-nov no se guardaron en ningún
// lado. Payphone no los lista, pero sí:
//   - la "consulta por lotes" (aprobados de los últimos ~3 días, 5 llamadas/día)
//   - GET /api/Sale/{transactionId} (uno por uno, con el # que se ve en el panel)
// El monto se toma SIEMPRE de GET /Sale, en CENTAVOS (como lo usa ya el cobro
// de la tienda). El de la consulta por lotes la doc lo muestra como "2.00" y
// no dice la unidad: no se usa.

const RE_ID_PAYPHONE = /^([0-9a-z]{8})-[0-9a-z]{6}$/

/** El celular que va codificado en el clientTransactionId (mismo formato que lib/payphone.js). */
export function celularDeClientTx(id) {
  const m = String(id || '').match(RE_ID_PAYPHONE)
  if (!m) return ''
  const n = parseInt(m[1], 36)
  return Number.isSafeInteger(n) && n > 0 ? String(n) : ''
}

/** Una venta de GET /api/Sale/{id} → la fila. null si no sirve. */
export function filaDesdeVentaPayphone(v) {
  if (!v || typeof v !== 'object') return null
  const clientTx = String(v.clientTransactionId || '').trim()
  const centavos = Number(v.amount)
  if (!clientTx || !Number.isFinite(centavos)) return null
  const aprobada = Number(v.statusCode) === 3 || v.transactionStatus === 'Approved'
  const rechazada = Number(v.statusCode) === 2 || v.transactionStatus === 'Canceled'
  const estado = aprobada ? 'PAGADO' : rechazada ? 'RECHAZADO' : 'PENDIENTE'
  const valor = r2(centavos / 100)
  const tiendaTxt = `${v.storeName || ''} ${v.reference || ''}`.toUpperCase()
  const fecha = v.date && !Number.isNaN(Date.parse(v.date)) ? new Date(v.date).toISOString() : null
  const est = aprobada ? estimarPayphone(valor) : { comision: null, neto: null }
  return {
    proveedor: 'PAYPHONE',
    client_tx_id: clientTx,
    transaction_id: v.transactionId != null ? String(v.transactionId) : null,
    creado_en: fecha,
    valor,
    link: '',
    celular: celularDeClientTx(clientTx) || String(v.phoneNumber || '').replace(/\D/g, ''),
    tienda: tiendaTxt.trim() ? (tiendaTxt.includes('IND') ? 'INDSTORE' : 'MANDARINA') : null,
    estado,
    pagado_en: aprobada ? fecha : null,
    comision: est.comision,
    neto: est.neto,
    comision_estimada: aprobada,
    tarjeta: v.cardBrand || null,
    pagador: v.email || null,
  }
}

/** Los # de transacción de la consulta por lotes (lo único que se usa de ella). */
export function idsDeLotePayphone(data) {
  const lista = Array.isArray(data) ? data : []
  return [...new Set(lista.map((x) => x?.idTransaction).filter((x) => x != null).map(String))]
}

/** Un # de transacción escrito a mano ("#93507187", "93 507 187") → '93507187' o null. */
export function normalizarTransaccion(s) {
  const d = String(s || '').replace(/\D/g, '')
  return d.length >= 5 && d.length <= 15 ? d : null
}
