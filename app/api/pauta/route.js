// app/api/pauta/route.js
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { armarTablero } from '@/lib/pauta/tablero'
import { TIENDAS, FECHA_PISO } from '@/lib/pauta/constantes'
import { hoyEcuador } from '@/lib/parseFecha'

// El tablero de pauta. SOLO ADMIN: acá se ve el gasto y el margen del negocio.
//
// La frontera de seguridad es esta ruta, no la pantalla. requireAdmin relee el
// usuario de la base con el id de la cookie firmada: nunca cree lo que diga el
// navegador sobre su propio rol.
export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const tienda = searchParams.get('tienda') || TIENDAS[0].id
  const desde = searchParams.get('desde') || FECHA_PISO
  const hasta = searchParams.get('hasta') || hoyEcuador()

  // Nunca dejar que un parámetro cualquiera llegue hasta la base: solo las
  // tiendas que pautean (ver lib/pauta/constantes.js).
  if (!TIENDAS.some((t) => t.id === tienda)) {
    return Response.json({ error: `Tienda desconocida: ${tienda}` }, { status: 400 })
  }

  try {
    return Response.json(await armarTablero({ tienda, desde, hasta }))
  } catch (e) {
    console.error('/api/pauta:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
