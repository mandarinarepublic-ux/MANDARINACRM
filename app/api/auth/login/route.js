import { validateLogin } from '@/lib/auth'

export async function POST(req) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return Response.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
    }
    const user = await validateLogin(email, password)
    if (!user) {
      return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 })
    }
    return Response.json({ user })
  } catch (e) {
    console.error('Login error:', e)
    return Response.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
