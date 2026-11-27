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
    ...detalleDlocal(p),
  }
}

const txt = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())

/**
 * Todo lo que dLocal sabe de quién pagó (27-nov-2026). Lo que no venga queda en
 * null y camposParaActualizar NO lo pisa.
 */
export function detalleDlocal(p) {
  if (!p || typeof p !== 'object') return {}
  const payer = p.payer || {}
  const card = p.card || {}
  const nombre = [payer.first_name, payer.last_name].filter(Boolean).join(' ').trim() || txt(payer.name) || txt(card.holder_name)
  return {
    pagador_nombre: txt(nombre),
    pagador_email: txt(payer.email),
    pagador_telefono: txt(payer.phone),
    pagador_documento: txt(payer.document),
    tarjeta_tipo: txt(card.type || p.payment_method_type),
    tarjeta_ultimos: txt(card.last4),
    autorizacion: txt(p.authorization_code),
    datos_pasarela: p,
  }
}

/**
 * Todo lo que Payphone sabe de quién pagó, de una venta de GET /Sale/{id} o
 * /Sale/client/{id} (27-nov-2026). Payphone NO da el nombre de forma fija: se
 * prueba con los campos donde lo manda según la versión de su API, y la
 * respuesta COMPLETA queda en datos_pasarela por si sale en otro lado.
 */
export function detallePayphone(v) {
  if (!v || typeof v !== 'object') return {}
  return {
    pagador_nombre: txt(v.cardHolderName || v.cardHolder || v.holderName || v.optionalParameter4),
    pagador_email: txt(v.email),
    pagador_telefono: txt(v.phoneNumber),
    pagador_documento: txt(v.document || v.documentId),
    tarjeta_tipo: txt(v.cardType),
    tarjeta_ultimos: txt(v.lastDigits),
    autorizacion: txt(v.authorizationCode),
    datos_pasarela: v,
  }
}

// Las columnas del pagador (en este orden se pintan y se buscan).
export const CAMPOS_PAGADOR = [
  'pagador_nombre', 'pagador_email', 'pagador_telefono', 'pagador_documento',
  'tarjeta_tipo', 'tarjeta_ultimos', 'autorizacion',
]

/**
 * Qué se actualiza de una fila que YA existe con lo nuevo de dLocal. Lo que
 * pusimos nosotros (vendedor, origen) nunca se pisa; tienda/celular solo se
 * llenan si estaban vacíos. Devuelve null si no cambió nada.
 */
export function camposParaActualizar(existente, nueva) {
  const patch = {}
  for (const k of ['estado', 'pagado_en', 'comision', 'neto', 'comision_estimada', 'tarjeta', 'pagador', 'externo_id', 'transaction_id', ...CAMPOS_PAGADOR, 'datos_pasarela']) {
    const a = existente?.[k] ?? null
    const b = nueva?.[k] ?? null
    if (b === null) continue
    // ☠️ Un objeto con String() da "[object Object]" y nunca cambiaría.
    if (k === 'datos_pasarela') { if (JSON.stringify(a) !== JSON.stringify(b)) patch[k] = b; continue }
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
    ...detallePayphone(v),
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

// ── TABLERO DE ARRIBA: ¿cuánta plata hay en cada pasarela? ─────────────────
// Pedido de Rodrigo (13-nov-2026): a primera vista, el dinero disponible.
// Ninguna de las dos da el saldo por API, así que se CALCULA:
//   dLocal   = neto de TODO lo pagado − lo que salió en retiros al banco.
//              Lo pagado en los últimos 7 días se separa como "por liberar"
//              (dLocal deposita a 7 días).
//   Payphone = neto ESTIMADO de todo lo cobrado (links + tienda web). Payphone
//              no informa por API cuánto ya depositó al banco: NO se resta.

export const DIAS_LIBERACION_DLOCAL = 7

// Un retiro que se canceló, se rechazó o falló no sacó la plata de la cuenta.
const RETIRO_NO_CUENTA = ['CANCELLED', 'REJECTED', 'FAILED']

export function saldos({ filas = [], retiros = [], tiendaWeb = null, ahora = Date.now() } = {}) {
  const corte = ahora - DIAS_LIBERACION_DLOCAL * 86400000
  const d = { neto: 0, por_liberar: 0, retirado: 0, retiros_en_curso: 0, pagos: 0 }
  const p = { neto: 0, cobrado: 0, pagos: 0, hoy: 0 }
  const inicioHoy = Date.parse(`${hoyEcuador(ahora)}T05:00:00.000Z`)
  for (const f of filas) {
    if (f?.estado !== 'PAGADO') continue
    const valor = num(f.valor) || 0
    const neto = num(f.neto) ?? valor
    if (f.proveedor === 'DLOCAL') {
      d.pagos++
      d.neto += neto
      if (Date.parse(f.pagado_en || f.creado_en) > corte) d.por_liberar += neto
    } else {
      p.pagos++
      p.cobrado += valor
      p.neto += neto
      if (Date.parse(f.pagado_en || f.creado_en) >= inicioHoy) p.hoy += valor
    }
  }
  for (const r of retiros || []) {
    if (RETIRO_NO_CUENTA.includes(String(r?.estado || '').toUpperCase())) continue
    const monto = num(r?.solicitado) ?? num(r?.transferido) ?? 0
    d.retirado += monto
    if (!['COMPLETED', 'DELIVERED'].includes(String(r?.estado || '').toUpperCase())) d.retiros_en_curso += monto
  }
  if (tiendaWeb) {
    p.pagos += tiendaWeb.pagos || 0
    p.cobrado += tiendaWeb.cobrado || 0
    p.neto += tiendaWeb.neto ?? (tiendaWeb.cobrado || 0)
  }
  const saldo = d.neto - d.retirado
  const dlocal = {
    saldo: r2(saldo),
    disponible: r2(Math.max(0, saldo - d.por_liberar)),
    por_liberar: r2(Math.min(d.por_liberar, Math.max(0, saldo))),
    neto_total: r2(d.neto),
    retirado: r2(d.retirado),
    retiros_en_curso: r2(d.retiros_en_curso),
    pagos: d.pagos,
  }
  const payphone = { neto: r2(p.neto), cobrado: r2(p.cobrado), pagos: p.pagos, hoy: r2(p.hoy), estimado: true }
  return { dlocal, payphone, total: r2(dlocal.saldo + payphone.neto) }
}

// ── Depósitos de Payphone anotados a mano (19-nov-2026) ──────────────────────
/**
 * Valida lo que escribe el ADMIN. Devuelve { ok, datos } o { ok:false, error }.
 * `hoy` = YYYY-MM-DD de Ecuador (no se aceptan depósitos del futuro).
 */
export function validarDeposito({ fecha, monto, nota } = {}, hoy = hoyEcuador()) {
  const f = String(fecha || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) return { ok: false, error: 'Elige la fecha del depósito' }
  if (f > hoy) return { ok: false, error: 'La fecha no puede ser futura' }
  if (f < '2025-01-01') return { ok: false, error: 'Fecha demasiado vieja' }
  const m = Number(String(monto ?? '').replace(',', '.'))
  if (!Number.isFinite(m) || m <= 0) return { ok: false, error: 'Escribe el monto del depósito (mayor a 0)' }
  if (m > 100000) return { ok: false, error: 'Monto demasiado alto: revísalo' }
  return { ok: true, datos: { fecha: f, monto: r2(m), nota: String(nota || '').trim().slice(0, 200) || null } }
}

/** Suma los depósitos y calcula lo que queda en Payphone. Puede salir negativo (estimación). */
export function saldoPayphone(netoCobrado, depositos = []) {
  const depositado = r2((depositos || []).reduce((s, d) => s + (num(d?.monto) || 0), 0))
  return { depositado, saldo: r2((num(netoCobrado) || 0) - depositado), depositos: (depositos || []).length }
}

// ── BUSCADOR del reporte (27-nov-2026) ───────────────────────────────────────

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Lo escrito → palabras. «099 816 5125» es UNA palabra (un celular), no tres. */
export function palabrasBusqueda(q) {
  // Solo espacios y guiones: el punto es decimal («198.50» es un valor).
  return sinTildes(q).trim()
    .replace(/\+(?=\d)/g, '')
    .replace(/(\d)[\s-]+(?=\d)/g, '$1')
    .split(/\s+/).filter(Boolean)
}

/**
 * ¿La fila coincide con lo escrito? Busca en TODO lo que se sabe del pago:
 * celular (por los últimos 9 dígitos, da igual 099… o 593…), nombre del cliente
 * (el de la pasarela y el del CRM/inbox), email, cédula, últimos 4 dígitos,
 * # de transacción, autorización, vendedor, tarjeta y valor.
 * Cada palabra tiene que aparecer en algún campo. Texto vacío → true.
 */
export function coincideBusqueda(f, q) {
  const palabras = palabrasBusqueda(q)
  if (!palabras.length) return true
  const valor = num(f?.valor)
  const campos = [
    f?.celular, f?.pagador, ...CAMPOS_PAGADOR.map((k) => f?.[k]), f?.cliente_nombre, f?.vendedor, f?.vendedor_nombre,
    f?.transaction_id, f?.client_tx_id, f?.externo_id, f?.tarjeta, f?.tienda,
    valor !== null ? valor.toFixed(2) : null,
  ].filter((c) => c !== null && c !== undefined && String(c) !== '').map(sinTildes)
  return palabras.every((p) => {
    // Un celular escrito con 0 adelante (099…) o con 593: se compara la cola de 9.
    if (/^\d{9,13}$/.test(p)) {
      const cola = p.slice(-9)
      return campos.some((c) => c.replace(/\D/g, '').includes(cola))
    }
    const q2 = /^\d+,\d{1,2}$/.test(p) ? p.replace(',', '.') : p   // «198,50» = «198.50»
    return campos.some((c) => c.includes(q2))
  })
}
