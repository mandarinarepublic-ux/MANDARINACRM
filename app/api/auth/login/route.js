import { validateLogin } from '@/lib/auth'

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
