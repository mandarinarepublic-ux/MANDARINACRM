export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listHistorial, TAMANO_PAGINA } from '@/lib/db/historial'
import { registrarEvento } from '@/lib/eventos'
import { contextoDeError } from '@/lib/detalle-evento'

// El Historial, de a páginas.
//
// La identidad sale de la cookie firmada: el alcance de cada rol (un VENDEDOR
// solo lo suyo, YAW solo su tienda, las tiendas asignadas) se aplica en la
// consulta. Antes la pantalla pedía `?rol=ADMIN` y escondía en el navegador lo
// que no tocaba — esconder no es restringir, la API devolvía todo igual.
//
// Los FILTROS sí vienen del navegador (estado, tienda, pago, fechas, búsqueda):
// esos no deciden qué puede ver nadie, solo qué quiere ver.
export async function GET(req) {
  // Contexto para el cuadro de errores. Antes un fallo aquí solo decía "falló
  // al cargar" y reconstruir el caso costaba varias consultas a la base (el 416
  // del Historial, 4-sep-2026). Ahora el evento lleva quién, con qué filtros y
  // el código. Se declara FUERA del try para que el catch lo alcance.
  let usuario = null
  const params = Object.fromEntries(new URL(req.url).searchParams)
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const resultado = await listHistorial({
      usuario,
      pagina:   searchParams.get('pagina'),
      estado:   searchParams.get('estado'),
      tienda:   searchParams.get('tienda'),
      pago:     searchParams.get('pago'),
      desde:    searchParams.get('desde'),
      hasta:    searchParams.get('hasta'),
      busqueda: searchParams.get('q'),
      area:     searchParams.get('area'),
    })

    return Response.json({ ...resultado, tamanoPagina: TAMANO_PAGINA })
  } catch (e) {
    console.error('GET /api/historial:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `El Historial fallo al cargar: ${e.message}`,
      detalle: contextoDeError({ error: e, ruta: '/api/historial', usuario, params }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
