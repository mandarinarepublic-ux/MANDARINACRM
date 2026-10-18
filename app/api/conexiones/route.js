export const dynamic = 'force-dynamic'
import { getSupabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { estadoEfectivo, ordenarParaPanel, resumen } from '@/lib/conexiones'

// GET → { conexiones, resumen }  — las luces del tablero de /dashboard/errores.
// Las escribe la rutina de Claude (7:00 y 15:00); ver lib/conexiones.js.
export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await getSupabase().from('conexiones_estado').select('*')
    if (error) throw error

    const ahora = Date.now()
    const conexiones = ordenarParaPanel((data || []).map(f => estadoEfectivo(f, ahora)))
    return Response.json({ conexiones, resumen: resumen(conexiones) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
