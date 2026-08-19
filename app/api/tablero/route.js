export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listTablero } from '@/lib/db/tablero'
import { registrarEvento } from '@/lib/eventos'

// El Tablero de flujo.
//
// La identidad sale de la cookie firmada. El acceso por tienda se aplica en la
// consulta y solo a los roles de venta — el trabajo de fábrica es transversal
// (quien borda, borda para las dos tiendas), así que a producción, corte,
// impresión y despacho NO se les filtra: hacerlo los dejaría sin ver su trabajo.
// Mismo criterio que lib/tiendasUsuario.js.
const ROLES_POR_TIENDA = ['VENDEDOR', 'VENDEDOR_YAW']

function tiendasDe(usuario) {
  const rol = String(usuario?.ROL ?? '').toUpperCase()
  if (rol === 'ADMIN' || !ROLES_POR_TIENDA.includes(rol)) return []
  const t = usuario?.TIENDAS
  const lista = Array.isArray(t) ? t : String(t ?? '').split(',')
  return lista.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
}

export async function GET(req) {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const resultado = await listTablero({
      tiendas: tiendasDe(usuario),
      incluirCerrados: searchParams.get('cerrados') === '1',
    })

    return Response.json(resultado)
  } catch (e) {
    console.error('GET /api/tablero:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `El Tablero fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
