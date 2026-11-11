// lib/db/linksPago.js — Repositorio de crm.links_pago (SOLO Supabase, sin Sheets).
// Histórico de los links de pago de Payphone creados desde /dashboard/link-pago.
// Tabla: docs/sql/2026-11-10-links-pago.sql

import { getSupabase } from '../supabase'

const COLS = [
  'id', 'creado_en', 'vendedor_id', 'vendedor_nombre', 'tienda', 'celular', 'valor',
  'link', 'client_tx_id', 'estado', 'transaction_id', 'pagado_en', 'tarjeta', 'revisado_en',
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
export async function actualizarEstadoLink(id, { estado, transactionId, tarjeta, pagadoEn }) {
  const patch = { estado, revisado_en: new Date().toISOString() }
  if (transactionId) patch.transaction_id = transactionId
  if (tarjeta) patch.tarjeta = tarjeta
  if (estado === 'PAGADO') patch.pagado_en = pagadoEn || new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('links_pago')
    .update(patch)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data
}
