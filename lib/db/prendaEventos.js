// lib/db/prendaEventos.js
//
// Escritura de `crm.prenda_eventos`. La REGLA de qué eventos ocurren vive en
// `lib/prendaEventos.js` (puro, probado sin Supabase); acá solo se guardan.
//
// ⚠️ SOLO SUPABASE, sin dual-write. Sheets quedó apagado el 19-ago-2026 y esta
// tabla nace después: no existe hoja espejo que mantener. Por eso no pasa por
// `write({sheets, supabase})` — inventarle un espejo que nadie lee sería costo
// sin lector.
//
// ☠️ NO-THROW, igual que `logCambio`. Si el registro falla, el taller tiene que
// poder seguir marcando prendas. Pero el `await` NO se puede quitar: en
// serverless la instancia se congela al responder y la escritura muere justo
// cuando hay un error que registrar.

import { getSupabase } from '../supabase'

/**
 * Guarda uno o varios eventos de prenda. Nunca lanza.
 * @param {object[]|object|null} eventos
 * @returns {Promise<number>} cuántos se guardaron (0 si falló o no había nada)
 */
export async function registrarEventosPrenda(eventos) {
  const filas = (Array.isArray(eventos) ? eventos : [eventos]).filter(Boolean)
  if (filas.length === 0) return 0
  try {
    const { error } = await getSupabase().from('prenda_eventos').insert(filas)
    if (error) throw error
    return filas.length
  } catch (e) {
    console.error('prenda_eventos error:', e?.message || e)
    return 0
  }
}

/** Los eventos de UNA prenda, del más viejo al más nuevo. */
export async function eventosDeItem(itemId) {
  const { data, error } = await getSupabase()
    .from('prenda_eventos')
    .select('evento_id,item_id,pedido_id,area,estado_antes,estado_despues,fecha,usuario,origen')
    .eq('item_id', itemId)
    .order('fecha', { ascending: true })
  if (error) throw error
  return data || []
}

/** Los eventos de todas las prendas de un pedido. */
export async function eventosDePedido(pedidoId) {
  const { data, error } = await getSupabase()
    .from('prenda_eventos')
    .select('evento_id,item_id,pedido_id,area,estado_antes,estado_despues,fecha,usuario,origen')
    .eq('pedido_id', pedidoId)
    .order('fecha', { ascending: true })
  if (error) throw error
  return data || []
}
