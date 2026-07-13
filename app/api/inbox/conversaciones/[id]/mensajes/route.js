export const dynamic = 'force-dynamic'
import { enviarMensaje } from '@/lib/db/inbox'

// POST /api/inbox/conversaciones/[id]/mensajes → enviar mensaje SALIENTE (agente/IA)
// body: { texto, tipo?, mediaUrl?, autor?, respuestaIa?, contextoId? }
// NOTA: solo persiste el mensaje en Supabase. El envío real por WhatsApp (llamar a
// la API del proveedor) es responsabilidad de la integración de salida.
export async function POST(req, { params }) {
  try {
    const { id } = params
    const b = await req.json()
    if (!b.texto && !b.mediaUrl) return Response.json({ error: 'texto o mediaUrl requerido' }, { status: 400 })
    const { mensaje } = await enviarMensaje({
      conversacionId: id,
      tipo: b.tipo,
      texto: b.texto,
      mediaUrl: b.mediaUrl,
      nombreContacto: b.autor,       // autor del mensaje saliente (agente)
      respuestaIa: b.respuestaIa,
      contextoId: b.contextoId,
    })
    return Response.json({ ok: true, mensaje })
  } catch (e) {
    console.error('POST inbox mensajes error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
