import { NextResponse } from 'next/server'
import { COOKIE_SESION, verificarSesion, secretoSesion } from '@/lib/sesion'

// ── La puerta de entrada del CRM ──────────────────────────────────────────────
// Antes: TODA la API estaba abierta. `GET /api/clientes?all=1` devolvía la base
// completa de clientes (nombre, cédula, celular, dirección) a cualquiera que
// conociera la URL de producción, y `PATCH /api/pedidos/[id]` permitía escribir
// sin ser nadie.
//
// Ahora, para entrar a /api hay que ser una de dos cosas:
//   1. Una PERSONA con sesión: cookie firmada al hacer login (el navegador la
//      manda sola en cada petición del mismo origen).
//   2. Una MÁQUINA con token: `Authorization: Bearer $CRM_API_TOKEN`. Lo usan
//      los agentes de WhatsApp (mandi-agent / indx-agent) para crear pedidos.
//
// Las rutas de abajo quedan fuera porque no pueden tener sesión, y cada una se
// defiende sola (o no tiene nada que proteger).

const RUTAS_PUBLICAS = [
  '/api/auth/login',       // sin esto nadie podría entrar nunca
  '/api/auth/logout',      // borrar la cookie no necesita permiso
  '/api/factura-callback', // lo llama Dátil/Make desde fuera, no un usuario
  '/api/shopify/sync',     // el cron de Vercel; valida su propio CRON_SECRET
  '/api/cron/pauta',       // el cron de Vercel; valida su propio CRON_SECRET
]

function esPublica(pathname) {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + '/'))
}

function tokenDeMaquina(req) {
  const esperado = String(process.env.CRM_API_TOKEN || '').replace(/[^\x21-\x7E]/g, '')
  if (!esperado) return false
  const cabecera = req.headers.get('authorization') || ''
  const recibido = cabecera.replace(/^Bearer\s+/i, '').replace(/[^\x21-\x7E]/g, '')
  // Comparación de largo constante: el tiempo de respuesta no delata aciertos.
  if (recibido.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < recibido.length; i++) dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i)
  return dif === 0
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  const esApi = pathname.startsWith('/api/')

  if (esApi && esPublica(pathname)) return NextResponse.next()

  const secreto = secretoSesion()

  // Sin SESSION_SECRET no se puede verificar nada. Se cierra la API antes que
  // dejarla abierta creyendo que está protegida; las páginas siguen pasando para
  // no encerrar a nadie fuera por un despiste de configuración.
  if (!secreto) {
    console.error('[middleware] falta SESSION_SECRET: la API queda cerrada')
    if (esApi) {
      return NextResponse.json({ error: 'Servidor sin sesión configurada' }, { status: 503 })
    }
    return NextResponse.next()
  }

  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secreto)

  if (sesion) return NextResponse.next()
  if (esApi && tokenDeMaquina(req)) return NextResponse.next()

  if (esApi) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Una página sin sesión va al login, recordando a dónde quería ir.
  //
  // Con la QUERY incluida, no solo la ruta. Antes se guardaba `pathname` pelado
  // y eso perdía los parámetros: quien abría PEDIDO MANUAL desde el inbox con la
  // cookie vencida volvía a `/dashboard/nuevo-pedido` sin `embed=1`, sin
  // `celular` y sin `nombre`. O sea: sin precarga, con el menú entero metido en
  // el panel del inbox y —lo grave— creando el pedido sin avisarle a nadie.
  //
  // Sigue siendo una ruta interna: empieza por '/' y todo lo que venga después
  // del '?' es query, así que no puede cambiar de host. `searchParams.set`
  // codifica el valor, y `volverSeguro` lo revisa igual antes de usarlo.
  const login = new URL('/', req.url)
  if (pathname !== '/') login.searchParams.set('volver', pathname + req.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
}
