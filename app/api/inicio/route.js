export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'

// El panel de Inicio.
//
// Los agregados los calcula la BASE (`crm.resumen_inicio`), no el navegador.
// Antes se pedían los 690 pedidos con sus cinco tablas y se sumaba en el
// cliente — y ademas `detalle_pedido` pedía 1314 filas cuando PostgREST devuelve
// 1000 como mucho: **314 prendas ya se perdían**, falseando el conteo por área.
//
// El alcance sale de la cookie firmada, no del `?rol=` que mandaba la pantalla:
// un VENDEDOR ve lo suyo, VENDEDOR_YAW su tienda, el resto todo.
export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const rol = String(usuario.ROL || '').toUpperCase()
    // `pedidos.vendedor_id` guarda el NOMBRE en unos pedidos y el uuid en otros.
    // La función compara contra este valor, así que se manda el nombre, que es
    // lo que se escribe hoy al crear un pedido.
    const vendedor = rol === 'VENDEDOR' ? (usuario.NOMBRE || usuario.USUARIO_ID || '') : null

    const { data, error } = await getSupabase().rpc('resumen_inicio', {
      p_vendedor: vendedor,
      p_rol: rol,
    })
    if (error) throw error

    return Response.json({ resumen: data })
  } catch (e) {
    console.error('GET /api/inicio:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `El panel de Inicio fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
