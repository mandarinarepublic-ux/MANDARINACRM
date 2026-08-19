export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listBandejaCorte } from '@/lib/db/corte'
import { registrarEvento } from '@/lib/eventos'
import { getSupabase } from '@/lib/supabase'

// La bandeja de CORTE.
//
// NO recibe parámetros: la identidad sale de la cookie firmada. Antes la pantalla
// mandaba `?rol=ADMIN` y el servidor obedecía.
//
// Solo ADMIN y CORTE. La pantalla ya redirigía a quien no lo fuera, pero esconder
// una pantalla no es un control de acceso: la API se pedía igual.
const ROLES_PERMITIDOS = ['ADMIN', 'CORTE']

/** Un aviso por hora como mucho, por ventana de tiempo (nunca por flanco). */
async function avisarSiHaceFalta(meta) {
  if (meta.completo && !meta.pedidosIncompletos) return
  try {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data } = await getSupabase()
      .from('eventos_sistema')
      .select('id')
      .eq('fuente', 'supabase').eq('nivel', 'error')
      .gte('fecha', haceUnaHora)
      .ilike('mensaje', 'La bandeja de CORTE%')
      .limit(1)
    if (data && data.length > 0) return
  } catch (e) {
    console.error('avisarSiHaceFalta (corte):', e?.message || e)
  }

  const motivo = !meta.completo
    ? `llegaron ${meta.pedidos} pedido(s) y la base dice que hay mas`
    : `${meta.pedidosIncompletos} pedido(s) llegaron sin todas sus prendas`

  // CON await: en serverless la instancia se congela al responder y el evento se
  // pierde justo cuando había algo que registrar.
  await registrarEvento({
    fuente: 'supabase', nivel: 'error',
    mensaje: `La bandeja de CORTE se leyo INCOMPLETA: ${motivo}. Lo que falte no se esta cortando.`,
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
      return Response.json({ error: 'Esta bandeja es de corte' }, { status: 403 })
    }

    const { pedidos, meta } = await listBandejaCorte()
    await avisarSiHaceFalta(meta)

    return Response.json({ pedidos, meta })
  } catch (e) {
    console.error('GET /api/corte:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La bandeja de CORTE fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
