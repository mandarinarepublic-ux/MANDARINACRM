// lib/db/cotizaciones.js — Repositorio de COTIZACIONES.
// Tabla NUEVA `crm.cotizaciones`, SOLO en Supabase (no hay espejo en Sheets).
// getSupabase() ya apunta al schema `crm` con service_role (ver lib/supabase.js).
// Las cotizaciones viven aparte de los pedidos y NUNCA entran a producción.

import { getSupabase } from '../supabase'

// Columnas escribibles de crm.cotizaciones (whitelist: evita inyectar claves
// que solo existen en el cliente, como `id` en create o campos temporales).
const COLS = [
  'numero', 'fecha', 'tienda', 'estado',
  'cliente_nombre', 'cliente_cedula', 'cliente_tel', 'cliente_email',
  'productos',
  'descuento', 'subtotal', 'iva_monto', 'total',
  'validez_dias', 'entrega_dias', 'anticipo_pct',
  'condiciones_pago', 'tiempo_produccion', 'beneficios', 'notas',
  'created_by', 'created_by_nombre',
]

function pick(obj) {
  const out = {}
  for (const k of COLS) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

/**
 * Lista de cotizaciones. VENDEDOR ve solo las suyas (created_by); ADMIN ve todas.
 * @param {{ createdBy?:string, rol?:string }} opts
 */
export async function listCotizaciones({ createdBy, rol } = {}) {
  let q = getSupabase()
    .from('cotizaciones')
    .select('*')
    .order('created_at', { ascending: false })

  // Solo ADMIN ve todas. Cualquier otro rol (VENDEDOR, VENDEDOR_YAW) se limita a las suyas.
  if (rol !== 'ADMIN') {
    if (!createdBy) return [] // sin dueño identificado → nada
    q = q.eq('created_by', createdBy)
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Una cotización por id. */
export async function getCotizacion(id) {
  const { data, error } = await getSupabase()
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/** Crea una cotización. Devuelve la fila creada (con id). */
export async function createCotizacion(data) {
  const { data: row, error } = await getSupabase()
    .from('cotizaciones')
    .insert(pick(data))
    .select('*')
    .single()
  if (error) throw error
  return row
}

/** Actualiza una cotización por id. Devuelve la fila actualizada. */
export async function updateCotizacion(id, patch) {
  const { data: row, error } = await getSupabase()
    .from('cotizaciones')
    .update(pick(patch))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return row
}
