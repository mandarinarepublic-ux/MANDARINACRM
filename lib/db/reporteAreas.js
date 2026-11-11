// lib/db/reporteAreas.js
//
// Lo que cada diseñador marcó como LISTO, por día (crm.prenda_eventos).
// ☠️ Pagina: PostgREST corta en 1000 filas sin avisar.
// No cuenta AUTO_CIERRE (eso lo hace el sistema al cerrar el pedido, no la persona).

import { getSupabase } from '../supabase'

const AREAS = ['BORDADO', 'SUBLIMACION', 'ESTAMPADO']

export function areaBase(a) {
  const s = String(a || '').toUpperCase()
  return AREAS.find((x) => s.includes(x.slice(0, 4))) || null
}

export async function reporteListos(desdeIso) {
  const sb = getSupabase()
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('prenda_eventos')
      .select('evento_id,item_id,pedido_id,area,estado_despues,fecha,usuario,origen')
      .gte('fecha', desdeIso).eq('estado_despues', 'LISTO')
      .order('evento_id', { ascending: true }).range(desde, desde + 999)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const usuarios = await sb.from('usuarios').select('usuario_id,nombre')
  if (usuarios.error) throw usuarios.error
  const nombre = Object.fromEntries((usuarios.data || []).map((u) => [u.usuario_id, u.nombre]))
  return filas
    .filter((f) => f.origen !== 'AUTO_CIERRE' && areaBase(f.area))
    .map((f) => ({ ...f, area: areaBase(f.area), nombre: nombre[f.usuario] || f.usuario || '—' }))
}
