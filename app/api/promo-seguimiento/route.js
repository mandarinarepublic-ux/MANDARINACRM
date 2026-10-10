// La promo de la página pública /pedido. Solo ADMIN la lee y la cambia aquí;
// la página pública la lee por su lado (app/pedido/page.js).
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { limpiarPromo } from '@/lib/seguimientoPublico'
import { leerPromo, guardarPromo } from '@/lib/db/seguimiento'

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    return Response.json({ promo: limpiarPromo(await leerPromo()) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    const promo = limpiarPromo(await req.json())
    await guardarPromo(promo, auth.usuario?.NOMBRE)
    return Response.json({ ok: true, promo })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
