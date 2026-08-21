export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listMisPedidos } from '@/lib/db/mis-pedidos'
import { registrarEvento } from '@/lib/eventos'

// "Mis pedidos".
//
// Quién es se saca de la cookie firmada, NO de `?vendedor=&vendedorId=&rol=`
// como antes: esos tres parámetros los ponía el navegador, así que cualquiera
// podía pedir los pedidos de otro vendedor cambiando la URL.
//
// ADMIN y los roles de taller ven todo lo que está en fábrica; los vendedores,
// solo lo suyo.
const VEN_TODO = ['ADMIN', 'CORTE', 'DISEÑO', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO', 'DESPACHO']

export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const rol = String(usuario.ROL || '').toUpperCase()
    const { pedidos, completo } = await listMisPedidos({
      nombre: usuario.NOMBRE,
      id: usuario.USUARIO_ID,
      verTodo: VEN_TODO.includes(rol),
    })

    return Response.json({ pedidos, completo })
  } catch (e) {
    console.error('GET /api/mis-pedidos:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `Mis pedidos fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
