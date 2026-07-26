import { cookieBorrada } from '@/lib/sesion'

// Cerrar sesión = borrar la cookie en el servidor. Antes "cerrar sesión" solo
// limpiaba localStorage, así que no cerraba nada: la identidad seguía valiendo.
export async function POST() {
  const res = Response.json({ ok: true })
  res.headers.append('Set-Cookie', cookieBorrada())
  return res
}
