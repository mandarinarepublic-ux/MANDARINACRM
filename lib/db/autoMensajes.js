// lib/db/autoMensajes.js — repositorio de AUTO (crm.auto_mensajes).
// Solo Supabase: Sheets está apagado desde el 19-ago y esto es nuevo.
import { getSupabase } from '../supabase'

const COLS = 'tienda,etapa,activo,texto,media_url,media_tipo,actualizado_en,actualizado_por'

export async function listarAutoMensajes(tienda) {
  const { data, error } = await getSupabase().from('auto_mensajes').select(COLS).eq('tienda', tienda)
  if (error) throw error
  return data || []
}

/** Se mandan TODAS las columnas: un upsert parcial pone en NULL lo que no viaja. */
export async function guardarAutoMensaje(m, usuario) {
  const { data, error } = await getSupabase().from('auto_mensajes').upsert({
    tienda: m.tienda,
    etapa: m.etapa,
    activo: m.activo,
    texto: m.texto,
    media_url: m.media_url,
    media_tipo: m.media_tipo,
    actualizado_en: new Date().toISOString(),
    actualizado_por: usuario || 'SISTEMA',
  }, { onConflict: 'tienda,etapa' }).select(COLS).single()
  if (error) throw error
  return data
}
