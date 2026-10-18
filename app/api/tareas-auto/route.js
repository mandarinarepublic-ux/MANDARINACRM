export const dynamic = 'force-dynamic'
import { getSupabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

// GET → { tareas, corridas } — el panel de /dashboard/tareas (solo ADMIN).
// Las corridas las escribe CADA rutina de Claude al terminar (ver lib/tareas-auto.js).
const DIAS = 60

export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const sb = getSupabase()
    const desde = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString()
    const [t, c] = await Promise.all([
      sb.from('tareas_auto').select('*').order('orden'),
      // ☠️ PostgREST corta en 1000 sin avisar: 3 tareas × 2/día × 60 días ≈ 360, con aviso si se acerca.
      sb.from('tareas_auto_corridas')
        .select('id, tarea_id, inicio, fin, estado, resumen, url')
        .gte('inicio', desde).order('inicio', { ascending: false }).order('id', { ascending: false })
        .range(0, 999),
    ])
    if (t.error) throw t.error
    if (c.error) throw c.error
    if ((c.data || []).length >= 1000) console.warn('[/api/tareas-auto] llegó a 1000 corridas: hay que paginar')
    return Response.json({ tareas: t.data || [], corridas: c.data || [], dias: DIAS })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
