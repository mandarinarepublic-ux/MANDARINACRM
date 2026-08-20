export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listImpresion } from '@/lib/db/impresion'
import { registrarEvento } from '@/lib/eventos'

// La cola de Impresión.
//
// La identidad sale de la cookie firmada; antes la pantalla mandaba `?rol=ADMIN`
// y el servidor obedecía. Imprimir órdenes de producción es trabajo de fábrica,
// que es transversal a las tiendas, así que NO se filtra por tienda — igual que
// Producción y Corte (ver lib/tiendasUsuario.js).
const ROLES_PERMITIDOS = ['ADMIN', 'CORTE', 'DISEÑO', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO', 'DESPACHO']

export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })
    if (!ROLES_PERMITIDOS.includes(String(usuario.ROL).toUpperCase())) {
      return Response.json({ error: 'Esta pantalla es del taller' }, { status: 403 })
    }

    const { pedidos, completo } = await listImpresion()
    return Response.json({ pedidos, completo })
  } catch (e) {
    console.error('GET /api/impresion:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La cola de Impresion fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
