// lib/whatsapp.js
// Integración con Meta WhatsApp Cloud API (graph.facebook.com), por cuenta.
// Server-only. Se configura por env vars; si faltan, el envío queda INACTIVO
// (la app solo persiste el mensaje en Supabase, sin mandarlo por WhatsApp).
//
// ENV por cuenta (MANDI / IND):
//   WHATSAPP_PHONE_ID_MANDI / WHATSAPP_PHONE_ID_IND   → phone_number_id de Meta
//   WHATSAPP_TOKEN_MANDI / WHATSAPP_TOKEN_IND         → token (o WHATSAPP_TOKEN compartido)
//   WHATSAPP_VERIFY_TOKEN                             → verificación del webhook
//   WHATSAPP_GRAPH_VERSION (opcional, default v22.0)

const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';

function cfg(cuenta) {
  const C = String(cuenta || '').toUpperCase();
  const phoneId = process.env[`WHATSAPP_PHONE_ID_${C}`];
  const token = process.env[`WHATSAPP_TOKEN_${C}`] || process.env.WHATSAPP_TOKEN;
  return { phoneId, token, enabled: Boolean(phoneId && token) };
}

/** ¿Está configurado el envío por WhatsApp para esta cuenta? */
export function envioActivo(cuenta) {
  return cfg(cuenta).enabled;
}

/** Resuelve la cuenta ('MANDI'|'IND') a partir del phone_number_id del webhook. */
export function cuentaPorPhoneId(phoneId) {
  if (!phoneId) return null;
  if (String(process.env.WHATSAPP_PHONE_ID_MANDI || '') === String(phoneId)) return 'MANDI';
  if (String(process.env.WHATSAPP_PHONE_ID_IND || '') === String(phoneId)) return 'IND';
  return null;
}

/**
 * Envía un mensaje de texto por WhatsApp (Cloud API). Solo funciona dentro de la
 * ventana de 24 h de atención al cliente; fuera de ella Meta exige plantilla.
 * @returns {Promise<{enviado:boolean, waMessageId?:string, motivo?:string}>}
 */
export async function enviarWhatsAppTexto({ cuenta, telefono, texto }) {
  const { phoneId, token, enabled } = cfg(cuenta);
  if (!enabled) return { enviado: false, motivo: 'envío no configurado' };
  const to = String(telefono || '').replace(/\D/g, '');
  if (!to || !texto) return { enviado: false, motivo: 'faltan telefono o texto' };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { enviado: false, motivo: data?.error?.message || `HTTP ${res.status}` };
    return { enviado: true, waMessageId: data?.messages?.[0]?.id || null };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}
