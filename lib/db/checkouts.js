// lib/db/checkouts.js — Repositorio de crm.checkouts_tienda (SOLO Supabase).
// Cada intento de pago con tarjeta dentro de la tienda (/pagar).
// Tabla: docs/sql/2026-11-11-checkouts-tienda.sql

import { getSupabase } from '../supabase'

const COLS = [
  'id', 'creado_en', 'actualizado_en', 'tienda', 'lineas', 'cliente', 'direccion', 'descuento',
  'calculo', 'total_centavos', 'estado', 'intentos', 'payphone_tx_id', 'payphone_detalle',
  'shopify_order_id', 'shopify_order_name', 'error', 'aviso_abandono_en',
  // Transferencia en la tienda (docs/sql/2026-11-12-checkouts-transferencia.sql)
  'metodo', 'banco', 'comprobante_url', 'crm_pedido_id',
].join(',')

/** El intento de compra cuya transferencia creó este pedido del CRM (o null). */
export async function checkoutDePedido(pedidoId) {
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .select(COLS).eq('crm_pedido_id', pedidoId).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0] || null
}

export async function crearCheckout({ id, tienda, lineas }) {
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .insert({ id, tienda, lineas }).select(COLS).single()
  if (error) throw new Error(error.message)
  return data
}

export async function leerCheckout(id) {
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .select(COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function actualizarCheckout(id, patch) {
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .update({ ...patch, actualizado_en: new Date().toISOString() })
    .eq('id', id).select(COLS).single()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Pasa a CREANDO solo si estaba en `desde` (PAGANDO/COTIZADO). Es el candado
 * contra dos pestañas o dos recargas creando el pedido dos veces: la segunda no
 * encuentra la fila en ese estado y devuelve null.
 */
export async function tomarParaCrear(id, desde = ['PAGANDO', 'COTIZADO']) {
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .update({ estado: 'CREANDO', actualizado_en: new Date().toISOString() })
    .eq('id', id).in('estado', desde).select(COLS)
  if (error) throw new Error(error.message)
  return data?.[0] || null
}

/** Candidatos a carrito abandonado (el filtro fino lo hace esAbandonado). */
export async function listarPosiblesAbandonos(limite = 50) {
  const desde = new Date(Date.now() - 48 * 3600000).toISOString()
  const { data, error } = await getSupabase().from('checkouts_tienda')
    .select(COLS)
    .in('estado', ['COTIZADO', 'PAGANDO'])
    .is('aviso_abandono_en', null)
    .gte('creado_en', desde)
    .order('creado_en', { ascending: true })
    .limit(limite)
  if (error) throw new Error(error.message)
  return data || []
}
