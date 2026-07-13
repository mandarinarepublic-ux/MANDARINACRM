export const dynamic = 'force-dynamic'
import { recibirMensaje } from '@/lib/db/inbox'

// POST /api/inbox/webhook → registra un mensaje ENTRANTE de WhatsApp.
//
// El parsing EXACTO del payload depende del proveedor (Meta Cloud API, Make, etc.).
// Este endpoint espera un payload YA NORMALIZADO. Cuando definamos el proveedor, se
// agrega aquí (o en un adaptador previo) la traducción del formato crudo + la
// verificación de firma/token del proveedor.
//
// Body normalizado esperado:
//   { cuenta:'IND'|'MANDI', telefono, nombre?, waId?, mensajeId?, tipo?, texto?,
//     mediaUrl?, mediaId?, contextoId?, fecha? }
export async function POST(req) {
  try {
    const b = await req.json()
    if (!b.cuenta || !b.telefono) {
      return Response.json({ error: 'cuenta y telefono requeridos' }, { status: 400 })
    }
    const { conversacion, mensaje } = await recibirMensaje({
      cuenta: b.cuenta,
      telefono: b.telefono,
      nombreContacto: b.nombre,
      waId: b.waId,
      mensajeId: b.mensajeId,
      tipo: b.tipo,
      texto: b.texto,
      mediaUrl: b.mediaUrl,
      mediaId: b.mediaId,
      contextoId: b.contextoId,
      fecha: b.fecha,
    })
    return Response.json({
      ok: true,
      conversacionId: conversacion.conversacion_id,
      mensajeId: mensaje?.mensaje_id || null,
    })
  } catch (e) {
    console.error('POST inbox/webhook error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
