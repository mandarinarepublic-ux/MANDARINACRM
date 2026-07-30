// lib/pauta/consultas.js
// Lecturas de Supabase para el tablero de pauta. Solo lee; no decide nada
// (las decisiones de "qué se muestra cuando falta un dato" viven en tablero.js).

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/consultas.js es server-only.')
}

import { getSupabase } from '../supabase.js'
import { VENTANA_DIAS, MIN_RESPONDIO, MIN_CONVERSO } from './constantes.js'

/** El embudo por anuncio, calculado en vivo por la función SQL `crm.pauta_embudo`. */
export async function embudoPorAnuncio({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase().rpc('pauta_embudo', {
    p_desde: desde,
    p_hasta: hasta,
    p_tienda: tienda,
    p_ventana_dias: VENTANA_DIAS,
    p_min_respondio: MIN_RESPONDIO,
    p_min_converso: MIN_CONVERSO,
  })
  if (error) throw new Error(`pauta_embudo: ${error.message}`)
  return data || []
}

/** El gasto del período, una fila por anuncio (ya sumado por día). */
export async function gastoPorAnuncio({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase()
    .from('pauta_dia').select('*')
    .eq('tienda_id', tienda).gte('fecha', desde).lte('fecha', hasta)
  if (error) throw new Error(`pauta_dia: ${error.message}`)

  const porAd = new Map()
  for (const f of data || []) {
    const a = porAd.get(f.ad_id) || {
      adId: f.ad_id, adNombre: f.ad_nombre, estado: f.estado,
      campaignId: f.campaign_id, campaignNombre: f.campaign_nombre,
      adsetId: f.adset_id, adsetNombre: f.adset_nombre,
      arteUrl: f.arte_url, arteTipo: f.arte_tipo,
      arteTexto: f.arte_texto, arteTitular: f.arte_titular,
      gasto: 0, impresiones: 0, clics: 0, conversacionesMeta: 0, valorMeta: 0,
    }
    a.gasto += Number(f.gasto || 0)
    a.impresiones += Number(f.impresiones || 0)
    a.clics += Number(f.clics || 0)
    a.conversacionesMeta += Number(f.conversaciones_meta || 0)
    a.valorMeta += Number(f.valor_meta || 0)
    // El nombre y el estado más recientes ganan.
    a.adNombre = f.ad_nombre || a.adNombre
    a.estado = f.estado || a.estado
    porAd.set(f.ad_id, a)
  }
  return [...porAd.values()]
}

/** Venta TOTAL de la tienda en el período — el denominador del MER. */
export async function ventaTotalTienda({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase()
    .from('pedidos').select('monto_total')
    .eq('tienda_id', tienda)
    .gte('fecha_pedido', `${desde}T00:00:00-05:00`)
    .lte('fecha_pedido', `${hasta}T23:59:59-05:00`)
  if (error) throw new Error(`pedidos: ${error.message}`)
  return (data || []).reduce((s, p) => s + Number(p.monto_total || 0), 0)
}

/**
 * Las tres cubetas del diseño (R4): de pauta, sin pauta, y pedidos sin chat.
 * La función `crm.pauta_cubetas` YA EXISTE en la base (con la zona horaria de
 * Ecuador ya corregida) — esta consulta solo la invoca, no la crea ni la toca.
 */
export async function contarCubetas({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase().rpc('pauta_cubetas', {
    p_desde: desde, p_hasta: hasta, p_tienda: tienda,
  })
  if (error) throw new Error(`pauta_cubetas: ${error.message}`)
  return data?.[0] || { pauta: 0, sin_pauta: 0, sin_chat: 0 }
}

/** Fecha del dato de gasto más reciente, para avisar si el cron no corrió. */
export async function ultimoDatoDeGasto(tienda) {
  const { data } = await getSupabase()
    .from('pauta_dia').select('fecha')
    .eq('tienda_id', tienda).order('fecha', { ascending: false }).limit(1)
  return data?.[0]?.fecha || null
}
