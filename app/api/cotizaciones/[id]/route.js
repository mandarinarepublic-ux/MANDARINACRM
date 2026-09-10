import { getCotizacion, updateCotizacion } from '@/lib/db/cotizaciones'
import { usuarioDeSesion } from '@/lib/auth'
import { esEstadoValido, faltantesCotizacion } from '@/lib/cotizacion'

export const dynamic = 'force-dynamic'

/**
 * Trae la cotización SOLO si quien llama tiene derecho a verla.
 *
 * ⚠️ NO HABÍA NINGUNA COMPROBACIÓN. Hasta el 10-sep-2026 estas dos rutas
 * cargaban la fila por id y la devolvían —o la escribían— a cualquiera con
 * sesión. La lista sí separaba "cada quien ve lo suyo", pero bastaba tener un
 * id para saltarse esa separación entera: leer la cotización de otro vendedor,
 * con los datos de su cliente, o editarle los precios sin que nadie se entere.
 *
 * ⚠️ Sin permiso responde 'no encontrada' (404), NO 403. Un 403 confirmaría que
 * ese id existe, y probar ids hasta que uno deje de dar 404 es justo el mapa que
 * no hay que regalar. Para quien no es dueño, la cotización simplemente no está.
 */
async function cotizacionPermitida(id) {
  const quien = await usuarioDeSesion()
  if (!quien.ok) return quien

  let row
  try {
    row = await getCotizacion(id)
  } catch (e) {
    console.error('cotizacionPermitida: fallo leyendo la cotización:', e?.message || e)
    return { ok: false, status: 500, error: e.message }
  }

  const noEstá = { ok: false, status: 404, error: 'no encontrada' }
  if (!row) return noEstá

  const esAdmin = quien.usuario.ROL === 'ADMIN'
  const esSuya = row.created_by && row.created_by === quien.usuario.USUARIO_ID
  if (!esAdmin && !esSuya) return noEstá

  return { ok: true, usuario: quien.usuario, row }
}

// GET /api/cotizaciones/[id] — una cotización.
export async function GET(_req, { params }) {
  const permiso = await cotizacionPermitida(params.id)
  if (!permiso.ok) return Response.json({ error: permiso.error }, { status: permiso.status })
  return Response.json({ cotizacion: permiso.row })
}

/**
 * PATCH /api/cotizaciones/[id] — actualiza una cotización.
 *
 * ⚠️ El DUEÑO no se puede cambiar. `created_by` está en la whitelist de columnas
 * escribibles (lib/db/cotizaciones.js) porque el POST lo necesita, así que un
 * PATCH podría reasignar la cotización a otra persona — y el dueño es lo único
 * que decide quién la ve. Se pisa con el de la fila, que ya se leyó para
 * comprobar el permiso.
 *
 * ⚠️ El NÚMERO tampoco. Lo asigna el servidor al crear, secuencial y único
 * (ver createCotizacion); si el PATCH lo dejara pasar, un vendedor podría
 * ponerle a mano el de otra cotización y el índice único respondería con un
 * error críptico —o peor, con el índice caído, dos iguales otra vez—. Se pisa
 * con el de la fila.
 *
 * El ESTADO se valida acá y no solo en el CHECK de la base, para responder un
 * 400 que se entienda en vez de un 500 con el texto del constraint.
 */
export async function PATCH(req, { params }) {
  const permiso = await cotizacionPermitida(params.id)
  if (!permiso.ok) return Response.json({ error: permiso.error }, { status: permiso.status })

  try {
    const patch = await req.json()
    if (patch.estado !== undefined && !esEstadoValido(patch.estado)) {
      return Response.json({ error: `estado inválido: ${patch.estado}` }, { status: 400 })
    }
    // Solo si el patch toca cliente o prendas: un cambio de estado solo
    // (`{ estado }`) no puede quedar bloqueado por cómo esté el resto de la
    // fila. Se valida lo que QUEDARÍA guardado, no el patch suelto.
    if ('cliente_nombre' in patch || 'productos' in patch) {
      const faltan = faltantesCotizacion({ ...permiso.row, ...patch })
      if (faltan.length) return Response.json({ error: `Faltan datos: ${faltan.join(' y ')}` }, { status: 400 })
    }
    const row = await updateCotizacion(params.id, {
      ...patch,
      numero: permiso.row.numero,
      created_by: permiso.row.created_by,
      created_by_nombre: permiso.row.created_by_nombre,
    })
    return Response.json({ cotizacion: row })
  } catch (e) {
    console.error('PATCH cotizacion error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
