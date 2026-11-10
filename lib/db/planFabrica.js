// lib/db/planFabrica.js
//
// La lista "QUÉ SE HACE HOY" del Plan de fábrica (crm.plan_fabrica).
// ☠️ Solo guarda la lista del día. NUNCA toca crm.pedidos ni detalle_pedido.

import { getSupabase } from '../supabase'

/** Ids del plan de ese día, en orden. */
export async function getPlan(fecha) {
  const sb = getSupabase()
  const { data, error } = await sb.from('plan_fabrica')
    .select('pedido_id,orden').eq('fecha', fecha).order('orden', { ascending: true })
  if (error) throw error
  return (data || []).map((r) => r.pedido_id)
}

/** El último plan ANTERIOR a ese día (para traer lo que quedó pendiente). */
export async function getPlanAnterior(fecha) {
  const sb = getSupabase()
  const { data, error } = await sb.from('plan_fabrica')
    .select('fecha').lt('fecha', fecha).order('fecha', { ascending: false }).limit(1)
  if (error) throw error
  const f = data?.[0]?.fecha
  if (!f) return null
  return { fecha: f, ids: await getPlan(f) }
}

/** Reemplaza la lista del día por `ids` (en ese orden). */
export async function guardarPlan(fecha, ids, usuario) {
  const sb = getSupabase()
  const borrar = await sb.from('plan_fabrica').delete().eq('fecha', fecha)
  if (borrar.error) throw borrar.error
  if (!ids.length) return
  const filas = ids.map((pedido_id, orden) => ({ fecha, pedido_id, orden, agregado_por: usuario || null }))
  const { error } = await sb.from('plan_fabrica').insert(filas)
  if (error) throw error
}
