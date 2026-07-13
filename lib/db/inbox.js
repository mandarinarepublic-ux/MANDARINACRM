// lib/db/inbox.js
// Repositorio del INBOX de WhatsApp (schema `inbox`): conversaciones + mensajes
// de las DOS cuentas (IND y MANDI, distinguidas por la columna `cuenta`).
// Estructura basada en las hojas reales CONTACTOS + MENSAJES del bot de ventas.
//
// NO es dual-write: el inbox en Supabase es greenfield. El backfill y el wiring
// de la app del inbox vienen aparte; este repo es la capa de datos reutilizable.
//
// Unión con el CRM: por teléfono (vista crm.cliente_conversacion) y/o por
// id_venta (link directo al pedido, campo que ya trae CONTACTOS).

import { getSupabase, getSupabaseInbox } from '../supabase';

// ─── CONVERSACIONES ──────────────────────────────────────────────────────────

/** Lista de conversaciones (panel del inbox), más reciente primero. */
export async function listConversaciones({ cuenta, soporte, humano, limit = 100 } = {}) {
  let q = getSupabaseInbox()
    .from('conversaciones')
    .select('*')
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (cuenta) q = q.eq('cuenta', cuenta);
  if (soporte) q = q.eq('soporte', soporte);
  if (humano) q = q.eq('humano', humano);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Una conversación por id, o null. */
export async function getConversacion(conversacionId) {
  const { data, error } = await getSupabaseInbox()
    .from('conversaciones')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Busca la conversación por (cuenta, telefono); si no existe la crea. Devuelve la
 * fila completa. Al crear puede setear nombre/alias/wa_id; NO los pisa si ya existe.
 */
export async function upsertConversacion({ cuenta, telefono, nombreContacto, alias, waId, canal } = {}) {
  if (!cuenta || !telefono) throw new Error('cuenta y telefono requeridos');
  const db = getSupabaseInbox();

  const insertRow = { cuenta, telefono };
  if (nombreContacto) insertRow.nombre_contacto = nombreContacto;
  if (alias) insertRow.alias = alias;
  if (waId) insertRow.wa_id = waId;
  if (canal) insertRow.canal = canal;

  const { error: upErr } = await db
    .from('conversaciones')
    .upsert(insertRow, { onConflict: 'cuenta,telefono', ignoreDuplicates: true });
  if (upErr) throw upErr;

  const { data, error } = await db
    .from('conversaciones')
    .select('*')
    .eq('cuenta', cuenta)
    .eq('telefono', telefono)
    .single();
  if (error) throw error;
  return data;
}

/** Marca la conversación como leída (no_leidos = 0). */
export async function marcarLeidas(conversacionId) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones').update({ no_leidos: 0 }).eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/** Cambia el estado de soporte (ATENDIDO | ARCHIVADO | ...). */
export async function setSoporte(conversacionId, soporte) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones').update({ soporte }).eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/** Fija quién atiende: 'IA' (bot) o el nombre del agente humano. */
export async function setHumano(conversacionId, humano) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones').update({ humano: humano || null }).eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/** Vincula la conversación con un pedido del CRM (ID_VENTA). */
export async function setIdVenta(conversacionId, idVenta) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones').update({ id_venta: idVenta || null }).eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/**
 * Actualiza ultimo_mensaje_at y (opcional) incrementa no_leidos.
 * Incremento leer+sumar (no atómico); suficiente por la baja concurrencia por chat.
 */
async function bumpConversacion(conversacionId, { fecha, incrementarNoLeidos = false } = {}) {
  const db = getSupabaseInbox();
  const patch = { ultimo_mensaje_at: fecha || new Date().toISOString() };
  if (incrementarNoLeidos) {
    const { data } = await db.from('conversaciones').select('no_leidos').eq('conversacion_id', conversacionId).single();
    patch.no_leidos = (data?.no_leidos || 0) + 1;
  }
  const { error } = await db.from('conversaciones').update(patch).eq('conversacion_id', conversacionId);
  if (error) throw error;
}

// ─── MENSAJES ────────────────────────────────────────────────────────────────

/** Hilo de una conversación, cronológico (viejo → nuevo). */
export async function listMensajes(conversacionId, { limit = 300 } = {}) {
  const { data, error } = await getSupabaseInbox()
    .from('mensajes')
    .select('*')
    .eq('conversacion_id', conversacionId)
    .order('fecha', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Inserta un mensaje. Idempotente por `mensajeId` (el ID uuid del sistema): si ya
 * existe, devuelve el existente sin duplicar (clave para reintentos del webhook).
 * NO actualiza la conversación; para eso usar recibirMensaje/enviarMensaje.
 */
export async function addMensaje(conversacionId, opts = {}) {
  const {
    mensajeId, cuenta, telefono, nombre, direccion, tipo, texto,
    mediaUrl, mediaId, respuestaIa, fotoIa, contextoId, fecha,
  } = opts;
  if (!conversacionId) throw new Error('conversacionId requerido');
  if (!['IN', 'OUT'].includes(direccion)) throw new Error("direccion debe ser 'IN' o 'OUT'");
  const db = getSupabaseInbox();

  if (mensajeId) {
    const { data: existente } = await db
      .from('mensajes').select('*').eq('mensaje_id', mensajeId).maybeSingle();
    if (existente) return existente; // idempotente
  }

  const row = {
    conversacion_id: conversacionId,
    cuenta: cuenta ?? null,
    telefono: telefono ?? null,
    nombre: nombre ?? null,
    direccion,
    tipo: tipo ?? null,
    texto: texto ?? null,
    media_url: mediaUrl ?? null,
    media_id: mediaId ?? null,
    respuesta_ia: respuestaIa ?? null,
    foto_ia: fotoIa ?? null,
    contexto_id: contextoId ?? null,
  };
  if (mensajeId) row.mensaje_id = mensajeId;
  if (fecha) row.fecha = fecha;

  const { data, error } = await db.from('mensajes').insert(row).select().single();
  if (error) throw error;
  return data;
}

// ─── FLUJOS DE ALTO NIVEL ────────────────────────────────────────────────────

/**
 * Mensaje ENTRANTE (webhook): asegura la conversación, inserta el mensaje IN,
 * actualiza ultimo_mensaje_at e incrementa no_leidos.
 * @returns {Promise<{ conversacion, mensaje }>}
 */
export async function recibirMensaje({ cuenta, telefono, nombreContacto, waId, canal, mensajeId, tipo, texto, mediaUrl, mediaId, contextoId, fecha } = {}) {
  const conversacion = await upsertConversacion({ cuenta, telefono, nombreContacto, waId, canal });
  const mensaje = await addMensaje(conversacion.conversacion_id, {
    mensajeId, cuenta, telefono, nombre: nombreContacto,
    direccion: 'IN', tipo, texto, mediaUrl, mediaId, contextoId, fecha,
  });
  await bumpConversacion(conversacion.conversacion_id, {
    fecha: mensaje?.fecha || fecha, incrementarNoLeidos: true,
  });
  return { conversacion, mensaje };
}

/**
 * Mensaje SALIENTE (agente o IA responde). Acepta conversacionId, o (cuenta,
 * telefono). No toca no_leidos. `respuestaIa` marca respuesta generada por el bot.
 * @returns {Promise<{ conversacionId, mensaje }>}
 */
export async function enviarMensaje({ conversacionId, cuenta, telefono, nombreContacto, mensajeId, tipo, texto, mediaUrl, mediaId, respuestaIa, contextoId, fecha } = {}) {
  let convId = conversacionId;
  if (!convId) {
    const conv = await upsertConversacion({ cuenta, telefono, nombreContacto });
    convId = conv.conversacion_id;
  }
  const mensaje = await addMensaje(convId, {
    mensajeId, cuenta, telefono, nombre: nombreContacto,
    direccion: 'OUT', tipo, texto, mediaUrl, mediaId, respuestaIa, contextoId, fecha,
  });
  await bumpConversacion(convId, { fecha: mensaje?.fecha || fecha });
  return { conversacionId: convId, mensaje };
}

// ─── PUENTE CON EL CRM ───────────────────────────────────────────────────────

/** Conversaciones con el cliente del CRM adjunto (vista crm.cliente_conversacion). */
export async function conversacionesConCliente({ cuenta, limit = 100 } = {}) {
  let q = getSupabase()
    .from('cliente_conversacion')
    .select('*')
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (cuenta) q = q.eq('cuenta', cuenta);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Conversaciones de WhatsApp de un cliente del CRM (por cliente_id, vía teléfono). */
export async function conversacionesDeCliente(clienteId) {
  if (!clienteId) return [];
  const { data, error } = await getSupabase()
    .from('cliente_conversacion')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

/** Conversación vinculada a un pedido por ID_VENTA (link directo). */
export async function conversacionPorVenta(idVenta) {
  if (!idVenta) return null;
  const { data, error } = await getSupabaseInbox()
    .from('conversaciones').select('*').eq('id_venta', idVenta).maybeSingle();
  if (error) throw error;
  return data || null;
}
