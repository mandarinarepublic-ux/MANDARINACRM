// La promo de la página pública /pedido (?tienda=mandarina|ind, una por tienda). Solo ADMIN la lee y la cambia aquí;
// la página pública la lee por su lado (app/pedido/page.js).
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { limpiarPromo } from '@/lib/seguimientoPublico'
import { leerPromo, guardarPromo } from '@/lib/db/seguimiento'
import { tiendaSeguimiento } from '@/lib/tiendasSeguimiento'

const tiendaDe = (req) => tiendaSeguimiento(new URL(req.url).searchParams.get('tienda')).clave

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    return Response.json({ promo: limpiarPromo(await leerPromo(tiendaDe(req))) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    const promo = limpiarPromo(await req.json())
    await guardarPromo(promo, auth.usuario?.NOMBRE, tiendaDe(req))
    return Response.json({ ok: true, promo })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
