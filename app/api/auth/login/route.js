// validateLogin de lib/db/usuarios maneja AMBOS formatos de contraseña:
// texto plano (usuarios existentes) y bcrypt (creados tras la migración).
// El lib/auth viejo solo comparaba texto plano → rompía el login de usuarios nuevos.
import { validateLogin } from '@/lib/db/usuarios'
import { COOKIE_SESION, firmarSesion, opcionesCookie, secretoSesion } from '@/lib/sesion'

export async function POST(req) {
  try {
    const { email, password, username } = await req.json()
    const identifier = username || email
    if (!identifier || !password) {
      return Response.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 })
    }
    const user = await validateLogin(identifier, password)
    if (!user) {
      return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 })
    }

    // La respuesta sigue devolviendo el usuario (la UI lo guarda para pintar
    // nombre y menús), pero eso ya NO es la credencial: la credencial es la
    // cookie firmada, que el navegador no puede leer ni alterar.
    const secreto = secretoSesion()
    if (!secreto) {
      console.error('[login] falta SESSION_SECRET: no se puede emitir la sesión')
      return Response.json({ error: 'Servidor sin sesión configurada' }, { status: 503 })
    }

    // validateLogin devuelve { id, nombre, codigo, email, rol, areas, tiendas }.
    // En la sesión solo va lo mínimo: quién es y con qué rol entró. El rol que
    // manda es SIEMPRE el de la base (se vuelve a leer en cada acción sensible).
    const token = await firmarSesion({ id: user.id, rol: user.rol }, secreto)

    const res = Response.json({ user })
    res.headers.append(
      'Set-Cookie',
      serializarCookie(COOKIE_SESION, token, opcionesCookie()),
    )
    return res
  } catch (e) {
    console.error('Login error:', e)
    return Response.json({
      error: e.message || 'Error del servidor',
      details: e.toString()
    }, { status: 500 })
  }
}

/** Arma la cabecera Set-Cookie a mano (Response.json no expone cookies()). */
function serializarCookie(nombre, valor, opts) {
  const partes = [`${nombre}=${valor}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`]
  if (opts.httpOnly) partes.push('HttpOnly')
  if (opts.secure) partes.push('Secure')
  if (opts.sameSite) partes.push(`SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`)
  return partes.join('; ')
}
