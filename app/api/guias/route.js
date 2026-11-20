export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { consultarGuias } from '@/lib/db/consulta-guias'
import { registrarEvento } from '@/lib/eventos'
import { contextoDeError } from '@/lib/detalle-evento'

// 🚚 Consultar guías (20-nov-2026): GET /api/guias?q=…  — solo lectura.
// La identidad sale de la cookie firmada y el alcance es el del Historial
// (lib/db/consulta-guias.js). El navegador solo manda QUÉ busca.
export async function GET(req) {
  let usuario = null
  const params = Object.fromEntries(new URL(req.url).searchParams)
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })
    usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const q = String(params.q ?? '').slice(0, 80)
    return Response.json(await consultarGuias({ usuario, q }))
  } catch (e) {
    console.error('GET /api/guias:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La consulta de guias fallo: ${e.message}`,
      detalle: contextoDeError({ error: e, ruta: '/api/guias', usuario, params }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
