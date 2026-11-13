// lib/db/linksPago.js — Repositorio de crm.links_pago (SOLO Supabase, sin Sheets).
// Histórico de los links de pago de Payphone creados desde /dashboard/link-pago.
// Tabla: docs/sql/2026-11-10-links-pago.sql

import { getSupabase } from '../supabase'
import { estimarPayphone, camposParaActualizar } from '../reportePagos.js'

// Desde el 13-nov-2026 esta tabla registra TODOS los links (CRM + los dos inbox,
// Payphone + dLocal) para el reporte /dashboard/reporte-pagos.
// Columnas nuevas: docs/sql/2026-11-13-links-pago-reporte.sql
const COLS = [
  'id', 'creado_en', 'vendedor_id', 'vendedor_nombre', 'tienda', 'celular', 'valor',
  'link', 'client_tx_id', 'estado', 'transaction_id', 'pagado_en', 'tarjeta', 'revisado_en',
  'proveedor', 'origen', 'externo_id', 'comision', 'neto', 'comision_estimada', 'pagador',
].join(',')

/** Guarda un link recién creado. Devuelve la fila. */
export async function crearLinkPago(fila) {
  const { data, error } = await getSupabase()
    .from('links_pago')
    .insert({
      vendedor_id: fila.vendedorId,
      vendedor_nombre: fila.vendedorNombre || null,
      tienda: fila.tienda,
      celular: fila.celular,
      valor: fila.valor,
      link: fila.link,
      client_tx_id: fila.clientTxId,
    })
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Los links más recientes. `vendedorId` null = todos (solo ADMIN).
 * Tope explícito y chico: es un histórico para mirar, no un reporte. (PostgREST
 * corta en 1000 sin avisar; con `limit` 100 no se acerca.)
 */
export async function listarLinksPago({ vendedorId = null, limite = 100 } = {}) {
  let q = getSupabase()
    .from('links_pago')
    .select(COLS)
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (vendedorId) q = q.eq('vendedor_id', vendedorId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

/** Anota lo que dijo Payphone sobre un link. */
export async function actualizarEstadoLink(id, { estado, transactionId, tarjeta, pagadoEn, valor = null }) {
  const patch = { estado, revisado_en: new Date().toISOString() }
  if (transactionId) patch.transaction_id = transactionId
  if (tarjeta) patch.tarjeta = tarjeta
  if (estado === 'PAGADO') {
    patch.pagado_en = pagadoEn || new Date().toISOString()
    // Payphone no da la comisión por API: se ESTIMA y se marca como estimada.
    if (valor != null) Object.assign(patch, estimarPayphone(valor), { comision_estimada: true })
  }
  const { data, error } = await getSupabase()
    .from('links_pago')
    .update(patch)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── REPORTE (/dashboard/reporte-pagos, solo ADMIN) ──────────────────────────

const PAGINA = 1000

/**
 * Todos los links de un rango [desde, hasta) por fecha de creación o de pago.
 * ☠️ PostgREST corta en 1000 filas sin avisar: se pagina con .range() ordenando
 * por algo TOTAL (fecha + id), si no las páginas se pisan.
 */
export async function listarLinksRango({ desde, hasta, por = 'creado' }) {
  const col = por === 'pagado' ? 'pagado_en' : 'creado_en'
  const filas = []
  for (let ini = 0; ini < 50000; ini += PAGINA) {
    const { data, error } = await getSupabase()
      .from('links_pago')
      .select(COLS)
      .gte(col, desde)
      .lt(col, hasta)
      .order(col, { ascending: false })
      .order('id', { ascending: false })
      .range(ini, ini + PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < PAGINA) break
  }
  return filas
}

/** Links Payphone que todavía pueden cambiar (para preguntarle a Payphone). */
export async function linksPayphonePendientes({ desdeIso, limite = 25 }) {
  const { data, error } = await getSupabase()
    .from('links_pago')
    .select(COLS)
    .eq('proveedor', 'PAYPHONE')
    .eq('estado', 'PENDIENTE')
    .gte('creado_en', desdeIso)
    .order('revisado_en', { ascending: true, nullsFirst: true })
    .limit(limite)
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Mete los pagos de dLocal en la tabla: si el link ya estaba registrado (por el
 * inbox) se ACTUALIZA solo lo que es de dLocal; si no, se crea con origen DLOCAL.
 * Sin upsert a propósito: merge-duplicates pone en NULL lo que no se manda
 * (así se perdió el arte en pauta_dia) y acá se pisarían vendedor y origen.
 * Devuelve { nuevos, actualizados, iguales }.
 */
export async function guardarPagosDlocal(filasDlocal) {
  // client_tx_id es UNIQUE: si dLocal trae dos pagos con el mismo order_id
  // (un reintento), se queda el PAGADO; si no, el último que llegó.
  const unicos = new Map()
  for (const f of filasDlocal || []) {
    if (!f?.client_tx_id) continue
    const prev = unicos.get(f.client_tx_id)
    if (!prev || prev.estado !== 'PAGADO') unicos.set(f.client_tx_id, f)
  }
  const conId = [...unicos.values()]
  const out = { nuevos: 0, actualizados: 0, iguales: 0 }
  if (!conId.length) return out
  const sb = getSupabase()
  const existentes = new Map()
  // Tope de 200 ids por petición: una URL con ~1000 ids revienta (Bad Request).
  for (let i = 0; i < conId.length; i += 200) {
    const ids = conId.slice(i, i + 200).map((f) => f.client_tx_id)
    const { data, error } = await sb.from('links_pago').select(COLS).in('client_tx_id', ids)
    if (error) throw new Error(error.message)
    for (const e of data || []) existentes.set(e.client_tx_id, e)
  }
  const nuevos = []
  for (const f of conId) {
    const e = existentes.get(f.client_tx_id)
    if (!e) {
      nuevos.push({ ...f, origen: 'DLOCAL', revisado_en: new Date().toISOString(), creado_en: f.creado_en || new Date().toISOString() })
      continue
    }
    const patch = camposParaActualizar(e, f)
    if (!patch) { out.iguales++; continue }
    const { error } = await sb.from('links_pago').update({ ...patch, revisado_en: new Date().toISOString() }).eq('id', e.id)
    if (error) throw new Error(error.message)
    out.actualizados++
  }
  for (let i = 0; i < nuevos.length; i += 200) {
    const lote = nuevos.slice(i, i + 200).map((f) => ({ ...f, link: f.link || '', celular: f.celular || '', tienda: f.tienda || '', valor: f.valor ?? 0 }))
    const { error } = await sb.from('links_pago').insert(lote)
    if (error) throw new Error(error.message)
    out.nuevos += lote.length
  }
  return out
}
