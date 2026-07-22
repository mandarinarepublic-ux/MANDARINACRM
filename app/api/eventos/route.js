export const dynamic = 'force-dynamic'
import { getSupabase } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

// Tablero de errores — solo ADMIN.
// GET  → { eventos, salud }  (lista filtrable + resumen por fuente)
// PATCH { id, resuelto }     → marcar un error como resuelto

export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const fuente = searchParams.get('fuente')        // meta | datil | supabase | webhook
    const nivel = searchParams.get('nivel')          // error | aviso | ok
    const soloPendientes = searchParams.get('pendientes') === '1'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

    const sb = getSupabase()

    let q = sb.from('eventos_sistema').select('*').order('fecha', { ascending: false }).limit(limit)
    if (fuente) q = q.eq('fuente', fuente)
    if (nivel) q = q.eq('nivel', nivel)
    if (soloPendientes) q = q.eq('nivel', 'error').eq('resuelto', false)
    const { data: eventos, error } = await q
    if (error) throw error

    // Resumen de "salud" por fuente: último OK, último error y errores sin resolver.
    // Se calcula sobre los últimos 30 días para que sea barato.
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recientes, error: e2 } = await sb
      .from('eventos_sistema')
      .select('fuente, nivel, fecha, resuelto, mensaje')
      .gte('fecha', desde)
      .order('fecha', { ascending: false })
    if (e2) throw e2

    const salud = {}
    for (const f of ['meta', 'datil', 'supabase', 'webhook']) {
      const suyos = (recientes || []).filter(r => r.fuente === f)
      const ultimoOk = suyos.find(r => r.nivel === 'ok')
      const ultimoError = suyos.find(r => r.nivel === 'error')
      salud[f] = {
        ultimoOk: ultimoOk?.fecha || null,
        ultimoError: ultimoError?.fecha || null,
        mensajeError: ultimoError?.mensaje || null,
        erroresSinResolver: suyos.filter(r => r.nivel === 'error' && !r.resuelto).length,
      }
    }

    return Response.json({ eventos: eventos || [], salud })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { id, resuelto } = await req.json()
    if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await getSupabase()
      .from('eventos_sistema')
      .update({ resuelto: resuelto !== false })
      .eq('id', id)
    if (error) throw error

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
