// Lo común de las rutas /api/caja: quién llama, su caja y cómo responder errores.
import { usuarioDeSesion } from '@/lib/auth'
import { cajaDeResponsable } from '@/lib/db/caja'

/** { ok:true, usuario:{id,nombre}, caja } o { ok:false, res } con la respuesta lista. */
export async function contextoResponsable() {
  const auth = await usuarioDeSesion()
  if (!auth.ok) return { ok: false, res: Response.json({ error: auth.error }, { status: auth.status }) }
  const usuario = { id: auth.usuario.USUARIO_ID, nombre: auth.usuario.NOMBRE }
  const caja = await cajaDeResponsable(usuario.id)
  if (!caja) return { ok: false, res: Response.json({ error: 'No tienes una caja asignada' }, { status: 404 }) }
  return { ok: true, usuario, caja }
}

export function errorRuta(ruta, e) {
  console.error(ruta + ':', e)
  return Response.json({ error: e.message }, { status: e.status || 500 })
}

export const esHttps = (u) => typeof u === 'string' && u.startsWith('https://')
