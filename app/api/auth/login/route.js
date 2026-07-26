// validateLogin de lib/db/usuarios maneja AMBOS formatos de contraseña:
// texto plano (usuarios existentes) y bcrypt (creados tras la migración).
// El lib/auth viejo solo comparaba texto plano → rompía el login de usuarios nuevos.
import { validateLogin } from '@/lib/db/usuarios'

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
    return Response.json({ user })
  } catch (e) {
    console.error('Login error:', e)
    return Response.json({ 
      error: e.message || 'Error del servidor',
      details: e.toString()
    }, { status: 500 })
  }
}
