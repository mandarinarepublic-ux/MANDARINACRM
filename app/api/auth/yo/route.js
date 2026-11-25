// GET /api/auth/yo — quién soy HOY según la base (rol, tiendas, permisos) y qué
// versión del CRM está publicada. La pantalla lo consulta al abrir y cada pocos
// minutos: así un permiso nuevo aparece sin volver a entrar, y la pestaña sabe
// cuándo hay una versión nueva. La identidad sale de la cookie firmada, nunca
// de lo que mande el navegador.
import { usuarioDeSesion } from '@/lib/auth'
import { usuarioParaCliente } from '@/lib/sesionCliente'

export const dynamic = 'force-dynamic'

export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA || ''
  const auth = await usuarioDeSesion()
  const headers = { 'Cache-Control': 'no-store' }
  if (!auth.ok) return Response.json({ error: auth.error, build }, { status: auth.status, headers })
  return Response.json({ user: usuarioParaCliente(auth.usuario), build }, { headers })
}
