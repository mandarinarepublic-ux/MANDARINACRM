export const dynamic = 'force-dynamic'
import { enviarMensaje, getConversacion } from '@/lib/db/inbox'
import { envioActivo, enviarWhatsAppTexto } from '@/lib/whatsapp'
import { requireUser, authError } from '@/lib/inboxAuth'

// POST /api/inbox/conversaciones/[id]/mensajes → enviar mensaje SALIENTE (agente/IA)
// body: { texto, tipo?, mediaUrl?, autor?, respuestaIa?, contextoId? }
//
// Si el envío por Meta está configurado (env por cuenta) y hay texto, se manda por
// WhatsApp y se guarda su wamid. Si no, solo se persiste en Supabase (como antes).
export async function POST(req, { params }) {
  const auth = await requireUser(req)
  if (!auth.ok) return authError(auth)
  try {
    const { id } = params
    const b = await req.json()
    if (!b.texto && !b.mediaUrl) return Response.json({ error: 'texto o mediaUrl requerido' }, { status: 400 })

    const conv = await getConversacion(id)
    if (!conv) return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })

    let whatsapp = { enviado: false, motivo: 'envío no configurado' }
    if (b.texto && envioActivo(conv.cuenta)) {
      whatsapp = await enviarWhatsAppTexto({ cuenta: conv.cuenta, telefono: conv.telefono, texto: b.texto })
    }

    const { mensaje } = await enviarMensaje({
      conversacionId: id,
      tipo: b.tipo,
      texto: b.texto,
      mediaUrl: b.mediaUrl,
      nombreContacto: auth.user?.nombre || b.autor,
      respuestaIa: b.respuestaIa,
      contextoId: b.contextoId,
      waMessageId: whatsapp.waMessageId,
    })
    return Response.json({ ok: true, mensaje, whatsapp })
  } catch (e) {
    console.error('POST inbox mensajes error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
