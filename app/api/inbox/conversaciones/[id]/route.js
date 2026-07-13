export const dynamic = 'force-dynamic'
import { getConversacion, listMensajes, marcarLeidas, setSoporte, setHumano, setIdVenta } from '@/lib/db/inbox'

// GET /api/inbox/conversaciones/[id] → { conversacion, mensajes }  (el hilo completo)
export async function GET(req, { params }) {
  try {
    const { id } = params
    const conversacion = await getConversacion(id)
    if (!conversacion) return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
    const mensajes = await listMensajes(id)
    return Response.json({ conversacion, mensajes })
  } catch (e) {
    console.error('GET inbox/conversacion error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/inbox/conversaciones/[id] → marcar leída / cambiar soporte / humano / vincular venta
// body: { leer?, soporte?, humano?, idVenta? }
export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    if (body.leer) await marcarLeidas(id)
    if (body.soporte !== undefined) await setSoporte(id, body.soporte)
    if (body.humano !== undefined) await setHumano(id, body.humano)
    if (body.idVenta !== undefined) await setIdVenta(id, body.idVenta)
    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH inbox/conversacion error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
