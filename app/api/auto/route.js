// AUTO: configuración de los mensajes informativos por etapa (?tienda=mandarina|ind).
// Solo ADMIN. Aquí solo se guarda: el envío por WhatsApp va aparte.
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { armarPanel, limpiarMensaje, TIENDAS_AUTO } from '@/lib/autoMensajes'
import { listarAutoMensajes, guardarAutoMensaje } from '@/lib/db/autoMensajes'

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  const tienda = new URL(req.url).searchParams.get('tienda') || 'mandarina'
  if (!TIENDAS_AUTO.includes(tienda)) return Response.json({ error: 'Tienda inválida' }, { status: 400 })
  try {
    return Response.json({ mensajes: armarPanel(tienda, await listarAutoMensajes(tienda)) })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  const r = limpiarMensaje(await req.json().catch(() => null))
  if (r.error) return Response.json({ error: r.error }, { status: 400 })
  try {
    const fila = await guardarAutoMensaje(r.valor, auth.usuario?.NOMBRE)
    return Response.json({ ok: true, mensaje: armarPanel(fila.tienda, [fila])[fila.etapa] })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
