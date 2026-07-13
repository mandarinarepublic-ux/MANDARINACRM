export const dynamic = 'force-dynamic'
import { recibirMensaje } from '@/lib/db/inbox'
import { cuentaPorPhoneId } from '@/lib/whatsapp'

// Webhook de WhatsApp Cloud API (Meta). ADITIVO: no reemplaza el flujo de Make;
// se puede apuntar Meta acá directamente, o agregar en el escenario "Escucha" un
// módulo HTTP que reenvíe el mismo payload crudo a esta URL (con ?cuenta=MANDI|IND).
//
// La cuenta se resuelve por ?cuenta= (recomendado) o por el phone_number_id del
// payload (mapa WHATSAPP_PHONE_ID_MANDI / _IND).

// GET → verificación del webhook (Meta manda hub.challenge).
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected) {
    return new Response(challenge || '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

// Extrae el texto del mensaje replicando la lógica del escenario "Escucha":
// text.body → interactive.list_reply.title → referral.body → reaction.emoji →
// location (dirección o coordenadas). Agrega referral si viene de un anuncio.
function extraerTexto(msg) {
  let base =
    msg.text?.body ||
    msg.interactive?.list_reply?.title ||
    msg.interactive?.button_reply?.title ||
    msg.button?.text ||
    msg.referral?.body ||
    msg.reaction?.emoji ||
    (msg.location
      ? (msg.location.address || `📍 ${msg.location.latitude},${msg.location.longitude}`)
      : '')
  if (msg.location?.latitude) {
    base += ` | 🗺 https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`
  }
  if (msg.referral?.source_url) {
    base += ` | 📢 ${msg.referral.body || ''} → ${msg.referral.source_url}`
  }
  return base || null
}

function mediaDe(msg) {
  const m = msg.image || msg.sticker || msg.audio || msg.video || msg.document
  return m ? { url: m.url || null, id: m.id || null } : { url: null, id: null }
}

export async function POST(req) {
  let body
  try { body = await req.json() } catch { body = null }
  // Meta exige responder 200 rápido siempre (si no, reintenta y desactiva el webhook).
  try {
    const { searchParams } = new URL(req.url)
    const cuentaQuery = (searchParams.get('cuenta') || '').toUpperCase()

    const entries = body?.entry || []
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {}
        // Ignora status updates (delivered/read) — no traen messages.
        const messages = value.messages || []
        if (!messages.length) continue

        const cuenta = (cuentaQuery === 'MANDI' || cuentaQuery === 'IND')
          ? cuentaQuery
          : cuentaPorPhoneId(value.metadata?.phone_number_id)
        if (!cuenta) { console.warn('inbox/webhook: cuenta no resuelta'); continue }

        const contacto = (value.contacts || [])[0]
        const nombre = contacto?.profile?.name || null
        const waId = contacto?.wa_id || null

        for (const msg of messages) {
          const media = mediaDe(msg)
          try {
            await recibirMensaje({
              cuenta,
              telefono: msg.from,
              nombreContacto: nombre,
              waId,
              waMessageId: msg.id,
              tipo: msg.type,
              texto: extraerTexto(msg),
              mediaUrl: media.url,
              mediaId: media.id,
              contextoId: msg.context?.id || null,
              fecha: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : null,
            })
          } catch (e) {
            console.error('inbox/webhook recibirMensaje error:', e.message)
          }
        }
      }
    }
  } catch (e) {
    console.error('inbox/webhook error:', e.message)
  }
  return Response.json({ ok: true })
}
