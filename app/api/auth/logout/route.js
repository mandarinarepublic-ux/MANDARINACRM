import { COOKIE_SESION } from '@/lib/sesion'

// Cerrar sesión = borrar la cookie del servidor. Antes "cerrar sesión" solo
// limpiaba localStorage, así que no cerraba nada: la identidad seguía siendo
// aceptada por la API.
export async function POST() {
  const res = Response.json({ ok: true })
  res.headers.append(
    'Set-Cookie',
    `${COOKIE_SESION}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  )
  return res
}
