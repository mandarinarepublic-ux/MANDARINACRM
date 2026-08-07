// validateLogin de lib/db/usuarios maneja AMBOS formatos de contraseña:
// texto plano (usuarios existentes) y bcrypt (creados tras la migración).
// El lib/auth viejo solo comparaba texto plano → rompía el login de usuarios nuevos.
import { validateLogin } from '@/lib/db/usuarios'
import { firmarSesion, cookieSesion, secretoSesion } from '@/lib/sesion'

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
    // La respuesta sigue devolviendo el usuario (la UI lo usa para pintar nombre
    // y menús), pero eso ya NO es la credencial: la credencial es la cookie
    // firmada, que el navegador no puede leer ni alterar.
    const secreto = secretoSesion()
    if (!secreto) {
      console.error('[login] falta SESSION_SECRET: no se puede emitir la sesión')
      return Response.json({ error: 'Servidor sin sesión configurada' }, { status: 503 })
    }

    // validateLogin devuelve { id, nombre, codigo, email, rol, areas, tiendas }.
    // En la sesión va lo mínimo: quién es. El rol que manda sigue siendo el de la
    // base, que se relee en cada acción sensible (requireAdmin).
    const token = await firmarSesion({ id: user.id, rol: user.rol }, secreto)

    // El host lo decide quién responde, no COOKIE_DOMINIO: el CRM vive en dos
    // hosts (el nuevo crm.apps.mandarinaec.com y el viejo mandarina-pro-sales.vercel.app)
    // y solo el primero puede llevar el Domain compartido. Ver dominioCookie().
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
    const res = Response.json({ user })
    res.headers.append('Set-Cookie', cookieSesion(token, host))
    return res
  } catch (e) {
    console.error('Login error:', e)
    return Response.json({ 
      error: e.message || 'Error del servidor',
      details: e.toString()
    }, { status: 500 })
  }
}
