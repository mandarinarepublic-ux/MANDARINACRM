// lib/inbox-supabase.js — Conversaciones de WhatsApp (schema `inbox`) vistas
// desde el CRM. SOLO server-side.
//
// Casi todo acá es lectura: el hilo del cliente dentro del pedido. La excepción
// es `registrarCapiEvent`, que ESCRIBE en `inbox.capi_events` para dejar en la
// misma bitácora que los inbox el Purchase que el CRM le manda a Meta. Se anota
// ahí y no en una tabla del CRM porque lo que importa es poder mirar las tres
// señales de una conversación juntas (LeadSubmitted, InitiateCheckout, Purchase).
//
// El getSupabase() del CRM (lib/supabase.js) está fijado al schema `crm`, así que
// acá creamos un cliente propio apuntado al schema `inbox` (misma DB, mismas creds).
// Las fotos entrantes ya vienen archivadas en media_url (bucket inbox-media) por el
// webhook de cada inbox → acá se leen directo, sin Meta.
import { createClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error('lib/inbox-supabase.js es server-only: nunca lo importes en el navegador.');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;
function getInbox() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase no configurado: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'inbox' },
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js parcha el fetch global y cachea las GET de PostgREST → forzamos
    // no-store para leer en vivo (mismo fix que el inbox).
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return _client;
}

// Teléfono → últimos 9 dígitos (quita país 593 y ceros). El CRM guarda 09xxxxxxxx
// y el inbox 593xxxxxxxxx; el sufijo de 9 dígitos matchea ambos.
const tail9 = (s) => String(s || '').replace(/\D/g, '').replace(/^593/, '').replace(/^0+/, '').slice(-9);

function toMensaje(m) {
  return {
    id:        m.wa_message_id || String(m.mensaje_id || ''),
    cuenta:    m.cuenta || '',
    telefono:  String(m.telefono || ''),
    nombre:    m.nombre || '',
    tipo:      m.tipo || 'texto',
    mensaje:   m.texto || '',
    mediaUrl:  m.media_url || '',
    mediaId:   m.media_id || '',
    direccion: m.direccion || 'ENTRANTE',
    botones:   m.botones || '',
    timestamp: m.fecha || '',
  };
}

/**
 * Conversación de WhatsApp de un celular, en AMBAS cuentas (MANDI e IND).
 * Match por últimos 9 dígitos. Devuelve { MANDI:[...], IND:[...] } cronológico asc.
 * Si el número no aparece → arrays vacíos (el panel no muestra nada).
 */
export async function getConversacion(celular, limite = 600) {
  const t9 = tail9(celular);
  const out = { MANDI: [], IND: [] };
  if (t9.length < 8) return out;

  const sb = getInbox();
  const { data, error } = await sb
    .from('mensajes')
    .select('wa_message_id, mensaje_id, cuenta, telefono, nombre, tipo, texto, media_url, media_id, direccion, botones, fecha')
    .in('cuenta', ['MANDI', 'IND'])
    .ilike('telefono', `%${t9}`)   // termina en esos 9 dígitos
    .order('fecha', { ascending: true })
    .limit(limite);
  if (error) throw error;

  for (const row of data || []) {
    if (tail9(row.telefono) !== t9) continue; // match EXACTO por la cola de 9
    const cta = row.cuenta === 'IND' ? 'IND' : 'MANDI';
    out[cta].push(toMensaje(row));
  }
  return out;
}

/** tienda del CRM → cuenta del inbox. YAW no tiene inbox propio. */
function cuentaDeTienda(tiendaId) {
  return String(tiendaId || '').toUpperCase().includes('IND') ? 'IND' : 'MANDI';
}

/**
 * ¿Este cliente llegó por un anuncio Click-to-WhatsApp?
 *
 * Devuelve el click id que Meta mandó en el primer mensaje, junto con la WABA por
 * la que entró. Es lo que convierte una venta en "esta venta la trajo tal
 * anuncio": sin el clid, Meta cobra el click y nunca se entera de que termino en
 * compra, así que sigue optimizando hacia quien abre chats en vez de quien paga.
 *
 * Se busca en la cuenta que corresponde a la tienda del pedido, no en las dos: un
 * mismo número puede haberle escrito a MANDARINA y a IND desde anuncios
 * distintos, y atribuirle a IND una venta de Mandarina sería peor que no
 * atribuir nada.
 *
 * Nunca lanza: si esto falla, la venta se manda igual sin atribución.
 */
/**
 * ¿Este cliente tiene conversación, y vino de un anuncio?
 *
 * Es el hermano de getCtwaDeCliente: aquel solo sirve para el CAPI y devuelve
 * null si no hay click id. Este devuelve la conversación aunque NO venga de
 * pauta, porque para clasificar la venta importa la diferencia entre "escribió
 * por su cuenta" y "no escribió nunca".
 */
export async function getChatDeCliente(celular, tiendaId) {
  try {
    const t9 = tail9(celular);
    if (t9.length < 8) return null;

    const sb = getInbox();
    const { data, error } = await sb
      .from('conversaciones')
      .select('telefono, ctwa_clid, ctwa_source_id, ctwa_captured_at')
      .eq('cuenta', cuentaDeTienda(tiendaId))
      .ilike('telefono', `%${t9}`);
    if (error) throw error;

    const fila = (data || []).find((r) => tail9(r.telefono) === t9);
    if (!fila) return null;

    return {
      telefono: fila.telefono,
      ctwaClid: fila.ctwa_clid || null,
      adId: fila.ctwa_source_id || null,
    };
  } catch (e) {
    console.error('[inbox] getChatDeCliente:', e.message);
    return null;
  }
}

export async function getCtwaDeCliente(celular, tiendaId) {
  try {
    const t9 = tail9(celular);
    if (t9.length < 8) return null;

    const sb = getInbox();
    const { data, error } = await sb
      .from('conversaciones')
      .select('telefono, ctwa_clid, ctwa_phone_id, ctwa_captured_at')
      .eq('cuenta', cuentaDeTienda(tiendaId))
      .not('ctwa_clid', 'is', null)
      .ilike('telefono', `%${t9}`);
    if (error) throw error;

    // La cola de 9 con ilike puede traer de más (un número más largo que termine
    // igual); el match exacto lo hace tail9, como en getConversacion.
    const fila = (data || []).find((r) => tail9(r.telefono) === t9);
    if (!fila?.ctwa_clid) return null;

    return {
      ctwaClid:   fila.ctwa_clid,
      phoneId:    fila.ctwa_phone_id || '',
      capturadoEn: fila.ctwa_captured_at || '',
    };
  } catch (e) {
    console.error('[inbox] getCtwaDeCliente:', e.message);
    return null;
  }
}

/**
 * WABA → dataset de Meta donde se reciben los eventos de esa cuenta de WhatsApp.
 *
 * Los datasets los da de alta el inbox (lib/capi.js los resuelve contra la Graph
 * API y los guarda). Acá SOLO se leen: si falta uno, el Purchase se queda en el
 * pixel y queda anotado el motivo, en vez de inventar un destino.
 */
export async function getDatasetDeWaba(wabaId) {
  try {
    if (!wabaId) return null;
    const sb = getInbox();
    const { data, error } = await sb
      .from('capi_datasets')
      .select('dataset_id')
      .eq('waba_id', String(wabaId))
      .maybeSingle();
    if (error) throw error;
    return data?.dataset_id || null;
  } catch (e) {
    console.error('[inbox] getDatasetDeWaba:', e.message);
    return null;
  }
}

/**
 * Pedido web SIN PAGAR → aviso interno resaltado en el chat del cliente, en el
 * inbox de la tienda, y el chat a PENDIENTES.
 *
 * - Si el cliente ya tiene chat en esa cuenta, va ahí, por el número por el que
 *   escribió la última vez (`conversaciones.phone_id`).
 * - Si no, se crea el chat (IA apagada) en el número principal de la tienda.
 *
 * ☠️ Va con dirección INTERNO, nunca ENTRANTE: un entrante pondría
 * `ultimo_entrante_at` y abriría una ventana de 24 h que no existe. Por eso la
 * bandeja se pone en PENDIENTE a mano y SIN tocar `ultimo_entrante_at`.
 *
 * Idempotente por `wa_message_id` (uno por pedido). NUNCA lanza: devuelve
 * { ok, motivo } para que el webhook lo deje anotado.
 */
export async function avisarPedidoEnInbox({ tiendaId, telefono, nombre, waMessageId, texto, direccion, tipo, canalPorDefecto }) {
  try {
    const t9 = tail9(telefono);
    if (t9.length < 9) return { ok: false, motivo: 'sin celular usable' };
    const cuenta = cuentaDeTienda(tiendaId);
    const sb = getInbox();

    const { data: ya } = await sb.from('mensajes').select('mensaje_id').eq('wa_message_id', waMessageId).limit(1);
    if (ya?.length) return { ok: true, duplicado: true };

    const { data: convs, error: eConv } = await sb
      .from('conversaciones')
      .select('conversacion_id, telefono, phone_id')
      .eq('cuenta', cuenta)
      .ilike('telefono', `%${t9}`);
    if (eConv) throw eConv;
    let conv = (convs || []).find((r) => tail9(r.telefono) === t9) || null;
    const nueva = !conv;

    if (!conv) {
      const { data: creada, error: eIns } = await sb
        .from('conversaciones')
        .upsert(
          { cuenta, telefono, nombre_contacto: nombre || null, estado: 'PENDIENTE', modo_ia: 'HUMANO', phone_id: canalPorDefecto },
          { onConflict: 'cuenta,telefono', ignoreDuplicates: true },
        )
        .select('conversacion_id, telefono, phone_id');
      if (eIns) throw eIns;
      conv = creada?.[0] || null;
      if (!conv) {
        // Otro proceso la creó en el mismo instante: se relee.
        const { data: otra } = await sb.from('conversaciones')
          .select('conversacion_id, telefono, phone_id').eq('cuenta', cuenta).eq('telefono', telefono).limit(1);
        conv = otra?.[0] || null;
      }
      if (!conv) throw new Error('no se pudo crear la conversación');
    }

    const phoneId = conv.phone_id || canalPorDefecto;
    const ahora = new Date().toISOString();

    const { error: eMsg } = await sb.from('mensajes').insert({
      conversacion_id: conv.conversacion_id,
      cuenta,
      telefono: conv.telefono,
      nombre: nombre || null,
      direccion,
      tipo,
      texto,
      phone_id: phoneId,
      wa_message_id: waMessageId,
      fecha: ahora,
      raw: { origen: 'shopify', aviso: tipo },
    });
    if (eMsg) {
      if (eMsg.code === '23505') return { ok: true, duplicado: true }; // reintento simultáneo
      throw eMsg;
    }

    // A PENDIENTES, con un no leído más para que salte a la vista.
    const { data: filaB } = await sb.from('bandeja').select('no_leidos')
      .eq('cuenta', cuenta).eq('telefono', conv.telefono).eq('phone_id', phoneId).limit(1);
    const { error: eBand } = await sb.from('bandeja').upsert(
      {
        cuenta, telefono: conv.telefono, phone_id: phoneId,
        estado: 'PENDIENTE',
        no_leidos: (filaB?.[0]?.no_leidos || 0) + 1,
        ultimo_mensaje_at: ahora,
        actualizado_en: ahora,
      },
      { onConflict: 'cuenta,telefono,phone_id' },
    );
    if (eBand) throw eBand;

    // `conversaciones.estado` lo siguen leyendo IND y el CRM como respaldo.
    await sb.from('conversaciones')
      .update({ estado: 'PENDIENTE', ultimo_mensaje_at: ahora })
      .eq('conversacion_id', conv.conversacion_id);

    return { ok: true, nueva, telefono: conv.telefono, phoneId, cuenta };
  } catch (e) {
    console.error('[inbox] avisarPedidoEnInbox:', e.message);
    return { ok: false, motivo: String(e?.message || e).slice(0, 160) };
  }
}

/**
 * Deja el Purchase en la misma bitácora que usan los inbox para sus señales.
 *
 * NUNCA lanza: el evento ya se le mandó a Meta cuando esto corre, así que un
 * fallo de bitácora no puede tumbar la creación del pedido. Devuelve true/false
 * solo para poder decirlo en el log del CRM.
 */
export async function registrarCapiEvent({
  cuenta, telefono, eventId, ctwaClid, wabaId, value, httpStatus, metaResponse,
}) {
  try {
    const sb = getInbox();
    const { error } = await sb.from('capi_events').insert({
      cuenta,
      telefono: String(telefono || ''),
      event_name: 'Purchase',
      event_id: eventId,
      ctwa_clid: ctwaClid,
      waba_id: String(wabaId),
      value: value ?? null,
      http_status: httpStatus ?? null,
      meta_response: metaResponse ?? null,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    // El UNIQUE de (cuenta, event_id) rebota si el pedido ya se reportó: no es
    // un fallo, es el dedupe haciendo su trabajo cuando alguien reenvía.
    console.error('[inbox] registrarCapiEvent:', e.message);
    return false;
  }
}
