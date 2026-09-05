export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { getUsuarioById } from '@/lib/db/usuarios'
import { sesionActual } from '@/lib/auth'
import { logCambio } from '@/lib/pedidos'
import { registrarEvento } from '@/lib/eventos'
import { contextoDeError } from '@/lib/detalle-evento'

// Marcar (o desmarcar) que una factura pedida NO se va a emitir.
//
// POR QUÉ EXISTE. El cuadro de errores cuenta los pedidos que pidieron factura y
// no la tienen. Es un detector de silencio y funciona —así se vieron los 13 días
// en que Make dejó de emitir— pero algunos de esos pedidos no se van a facturar
// nunca. Sin forma de sacarlos, el contador se queda clavado en un número que
// nadie va a bajar, y un contador que nunca baja se deja de mirar. Ahí muere el
// detector.
//
// ☠️ NO apaga `factura_solicitada`. Que el cliente la pidió es un HECHO; no
// emitirla es una DECISIÓN nuestra. Apagar la primera para conseguir el efecto de
// la segunda borraría el hecho.
//
// Solo ADMIN: sacar un pedido de la vigilancia fiscal no es una acción de taller.
export async function POST(req) {
  let usuario = null
  let body = {}
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    body = await req.json().catch(() => ({}))
    const pedidoId = String(body.pedidoId ?? '').trim()
    // `descartada` explícito, nunca un toggle a ciegas: si dos personas tocan el
    // mismo botón a la vez, un toggle deja el estado al azar.
    const descartada = body.descartada !== false

    if (!pedidoId) return Response.json({ error: 'Falta el pedido' }, { status: 400 })

    const sesion = await sesionActual()
    usuario = sesion?.id ? await getUsuarioById(sesion.id) : null
    const quien = usuario?.NOMBRE || usuario?.USUARIO_ID || 'ADMIN'

    const sb = getSupabase()

    // Se lee antes para no marcar lo que no existe y para dejar el log honesto.
    const { data: antes, error: errLeer } = await sb
      .from('pedidos')
      .select('pedido_id, factura_solicitada, factura_id, factura_descartada')
      .eq('pedido_id', pedidoId)
      .maybeSingle()
    if (errLeer) throw errLeer
    if (!antes) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // Una factura YA emitida no se descarta: ahí no hay nada pendiente que sacar,
    // y permitirlo daría a entender que se anuló algo en el SRI. No se anula nada.
    if (antes.factura_id && descartada) {
      return Response.json({ error: 'Ese pedido ya tiene factura emitida' }, { status: 409 })
    }

    const { error } = await sb
      .from('pedidos')
      .update({
        factura_descartada: descartada,
        factura_descartada_por: descartada ? quien : null,
        factura_descartada_at: descartada ? new Date().toISOString() : null,
      })
      .eq('pedido_id', pedidoId)
    if (error) throw error

    // Queda en la Bitácora del pedido: es una decisión de negocio, y dentro de
    // tres meses alguien va a preguntar por qué este pedido no se facturó.
    await logCambio(
      pedidoId, 'FACTURA_DESCARTADA',
      antes.factura_descartada ? 'DESCARTADA' : 'PENDIENTE',
      descartada ? 'DESCARTADA' : 'PENDIENTE',
      quien,
    ).catch(() => {})

    return Response.json({ ok: true, pedidoId, descartada })
  } catch (e) {
    console.error('POST /api/factura/descartar:', e)
    await registrarEvento({
      fuente: 'datil', nivel: 'error',
      mensaje: `No se pudo cambiar el descarte de factura: ${e.message}`,
      pedidoId: body?.pedidoId,
      detalle: contextoDeError({ error: e, ruta: '/api/factura/descartar', usuario, params: body }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
