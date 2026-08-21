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

/**
 * ⚠️ Quien tiene el permiso VENTAS ve SOLO LO SUYO, aunque su rol esté en
 * VEN_TODO.
 *
 * Los de DISEÑO pueden vender desde el 21-ago-2026, y su rol está en esa lista
 * porque en Producción necesitan ver todo el taller. Pero esta pantalla se llama
 * "Mis Pedidos": si les devolviera los 70 pedidos en fábrica, el nombre sería
 * mentira y no encontrarían la venta que acaban de tomar.
 */
const tieneVentas = (usuario) =>
  (Array.isArray(usuario?.ACCESOS) ? usuario.ACCESOS : []).includes('VENTAS')

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
      verTodo: VEN_TODO.includes(rol) && !tieneVentas(usuario),
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
