import { listCotizaciones, createCotizacion } from '@/lib/db/cotizaciones'
import { usuarioDeSesion } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cotizaciones — las cotizaciones de quien llama.
 * VENDEDOR/VENDEDOR_YAW → solo las suyas; ADMIN → todas.
 *
 * ⚠️ EL PERMISO LO DECIDÍA EL NAVEGADOR. Hasta el 10-sep-2026 el dueño y el rol
 * llegaban en el QUERY STRING (`?createdBy=…&rol=…`) y `listCotizaciones`
 * resolvía "ADMIN ve todas" con ese valor. O sea que cualquiera con sesión
 * —incluido un VENDEDOR_YAW— pedía `?rol=ADMIN` y se llevaba las cotizaciones
 * de TODOS, con los datos de sus clientes; y `?createdBy=<id ajeno>` traía las
 * de esa persona. El repo es público, así que el formato estaba a la vista.
 *
 * Ahora la identidad sale de la cookie firmada y se relee de la base
 * (`usuarioDeSesion`). Los parámetros de la url se IGNORAN: no se leen ni para
 * completar huecos. Si alguna pantalla los sigue mandando, sobran y no hacen
 * nada — que es exactamente lo que tienen que hacer.
 *
 * ⚠️ Los TOKENS DE MÁQUINA (`CRM_API_TOKEN`) reciben 401 acá. Pasan el
 * middleware, pero cotizaciones es un módulo de PERSONAS: `created_by` es un
 * usuario del CRM y una máquina no tiene "lo suyo". Hoy los usan los agentes de
 * WhatsApp para crear PEDIDOS y ninguno toca esta ruta (ver la lista de
 * llamadores en middleware.js). Si algún día uno la necesita, se le da
 * identidad; no se vuelve a abrir la puerta.
 */
export async function GET() {
  const quien = await usuarioDeSesion()
  if (!quien.ok) return Response.json({ error: quien.error }, { status: quien.status })

  try {
    const cotizaciones = await listCotizaciones({
      createdBy: quien.usuario.USUARIO_ID,
      rol: quien.usuario.ROL,
    })
    return Response.json({ cotizaciones })
  } catch (e) {
    console.error('GET cotizaciones error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/cotizaciones — crea una cotización. Body = objeto cotización.
 *
 * ⚠️ El DUEÑO lo pone el servidor, no el body. Antes `created_by` y
 * `created_by_nombre` viajaban en el cuerpo y se guardaban tal cual: se podía
 * crear una cotización a nombre de otro vendedor. Y como el dueño es lo único
 * que decide quién la ve después, firmar con el id ajeno era además la forma de
 * esconderla de uno mismo. Ahora se pisan con la sesión, siempre.
 */
export async function POST(req) {
  const quien = await usuarioDeSesion()
  if (!quien.ok) return Response.json({ error: quien.error }, { status: quien.status })

  try {
    const body = await req.json()
    const row = await createCotizacion({
      ...body,
      created_by: quien.usuario.USUARIO_ID,
      created_by_nombre: quien.usuario.NOMBRE,
    })
    return Response.json({ cotizacion: row })
  } catch (e) {
    console.error('POST cotizaciones error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
