export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listBandejaProduccion } from '@/lib/db/produccion'
import { registrarEvento } from '@/lib/eventos'
import { getSupabase } from '@/lib/supabase'

// La bandeja de PRODUCCIÓN.
//
// NO recibe parámetros. Nada de `?rol=ADMIN` ni `?area=`: la identidad sale de la
// COOKIE FIRMADA y el usuario se relee de la base, como hace requireAdmin. Antes
// la pantalla mandaba `?rol=ADMIN` y el servidor obedecía, así que cualquiera con
// sesión podía pedir todos los pedidos con nombres, cédulas y montos.

/**
 * Avisa que la lectura vino incompleta.
 *
 * Como mucho UN aviso por hora: si cada carga de cada operario mandara un Telegram
 * serían cien al día y dejarían de leerse. Y nunca "por flanco" (avisar solo cuando
 * cambie de estado): eso da un aviso en toda la vida — el fallo que tuvieron las
 * notificaciones push del inbox durante 17 días.
 */
async function avisarSiHaceFalta(meta) {
  // Dos motivos: faltan pedidos enteros, o a algún pedido le faltan prendas.
  if (meta.completo && !meta.pedidosIncompletos) return

  try {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data } = await getSupabase()
      .from('eventos_sistema')
      .select('id')
      .eq('fuente', 'supabase')
      .eq('nivel', 'error')
      .gte('fecha', haceUnaHora)
      .ilike('mensaje', 'La bandeja de PRODUCCION%')
      .limit(1)
    if (data && data.length > 0) return   // ya se avisó en esta hora
  } catch (e) {
    console.error('avisarSiHaceFalta: no se pudo comprobar el enfriamiento:', e?.message || e)
    // Si no se puede comprobar, se avisa igual: mejor un aviso de más que ninguno.
  }

  const motivo = !meta.completo
    ? `llegaron ${meta.pedidos} pedido(s) y la base dice que hay mas`
    : `${meta.pedidosIncompletos} pedido(s) llegaron sin todas sus prendas`

  // CON await: en serverless la instancia se congela al responder y el evento se
  // pierde justo cuando había algo que registrar. Le pasó a los 502 de Dátil, que
  // no dejaron ni una fila en crm.eventos_sistema.
  await registrarEvento({
    fuente: 'supabase',
    nivel: 'error',
    mensaje: `La bandeja de PRODUCCION se leyo INCOMPLETA: ${motivo}. Lo que falte no se esta viendo en el taller.`,
  })
}

export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) {
      return Response.json({ error: 'No autenticado' }, { status: 401 })
    }

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const { pedidos, meta } = await listBandejaProduccion(usuario)
    await avisarSiHaceFalta(meta)

    return Response.json({ pedidos, meta })
  } catch (e) {
    console.error('GET /api/produccion:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La bandeja de PRODUCCION fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
