import { cookieBorrada } from '@/lib/sesion'

// Cerrar sesión = borrar la cookie en el servidor. Antes "cerrar sesión" solo
// limpiaba localStorage, así que no cerraba nada: la identidad seguía valiendo.
export async function POST(req) {
  // Mismo host que en login: solo así la cookie que borra coincide con la que
  // el navegador realmente guardó. Ver dominioCookie() en lib/sesion.js.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const res = Response.json({ ok: true })
  res.headers.append('Set-Cookie', cookieBorrada(host))
  return res
}
