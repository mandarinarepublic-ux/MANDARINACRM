export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listBandejaDespacho } from '@/lib/db/despacho'
import { registrarEvento } from '@/lib/eventos'
import { getSupabase } from '@/lib/supabase'

// La bandeja de DESPACHO: solo lo que todavía no ha salido.
//
// NO recibe parámetros: la identidad sale de la cookie firmada. Antes la pantalla
// mandaba `?rol=ADMIN` y el servidor obedecía.
//
// Solo ADMIN y DESPACHO. Es la pantalla desde la que se cierra un pedido y se
// registra una guía; no tiene por qué verla el resto del taller.
const ROLES_PERMITIDOS = ['ADMIN', 'DESPACHO']

/** Mismo criterio que en producción: un aviso por hora como mucho, por ventana. */
async function avisarSiHaceFalta(meta) {
  if (meta.completo) return
  try {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data } = await getSupabase()
      .from('eventos_sistema')
      .select('id')
      .eq('fuente', 'supabase').eq('nivel', 'error')
      .gte('fecha', haceUnaHora)
      .ilike('mensaje', 'La bandeja de DESPACHO%')
      .limit(1)
    if (data && data.length > 0) return
  } catch (e) {
    console.error('avisarSiHaceFalta (despacho):', e?.message || e)
  }

  // CON await: en serverless la instancia se congela al responder y el evento se
  // pierde justo cuando había algo que registrar.
  await registrarEvento({
    fuente: 'supabase', nivel: 'error',
    mensaje: `La bandeja de DESPACHO se leyo INCOMPLETA: llegaron ${meta.pedidos} pedido(s) y la base dice que hay mas. Lo que falte no se esta despachando.`,
  })
}

export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })
    if (!ROLES_PERMITIDOS.includes(String(usuario.ROL).toUpperCase())) {
      return Response.json({ error: 'Esta bandeja es de despacho' }, { status: 403 })
    }

    const { pedidos, meta } = await listBandejaDespacho()
    await avisarSiHaceFalta(meta)

    return Response.json({ pedidos, meta })
  } catch (e) {
    console.error('GET /api/despacho:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La bandeja de DESPACHO fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
