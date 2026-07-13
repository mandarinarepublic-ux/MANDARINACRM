// lib/db/inbox.js
// Repositorio del INBOX de WhatsApp (schema `inbox`): conversaciones + mensajes
// de las DOS cuentas (IND y MANDI, distinguidas por la columna `cuenta`).
//
// A diferencia de los repos del CRM, este NO es dual-write: el inbox en Supabase
// es nuevo (greenfield). El backfill desde el sistema actual y el wiring de la app
// del inbox vienen después; este repo es la capa de datos reutilizable para ambos.
//
// La unión con el CRM (mostrar el hilo de WhatsApp junto al cliente/pedido) se
// resuelve con la vista `crm.cliente_conversacion` (join por teléfono normalizado),
// que se lee con el cliente del schema `crm` (getSupabase()).

import { getSupabase, getSupabaseInbox } from '../supabase';

// ─── CONVERSACIONES ──────────────────────────────────────────────────────────

/** Lista de conversaciones (para el panel del inbox), más reciente primero. */
export async function listConversaciones({ cuenta, estado, limit = 100 } = {}) {
  let q = getSupabaseInbox()
    .from('conversaciones')
    .select('*')
    .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (cuenta) q = q.eq('cuenta', cuenta);
  if (estado) q = q.eq('estado', estado);
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
 * fila completa. NO pisa el nombre_contacto existente (solo lo setea al crear).
 */
export async function upsertConversacion({ cuenta, telefono, nombreContacto } = {}) {
  if (!cuenta || !telefono) throw new Error('cuenta y telefono requeridos');
  const db = getSupabaseInbox();

  const insertRow = { cuenta, telefono };
  if (nombreContacto) insertRow.nombre_contacto = nombreContacto;

  // Inserta si no existe (unique cuenta+telefono); si ya existe, no toca nada.
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
    .from('conversaciones')
    .update({ no_leidos: 0 })
    .eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/** Cambia el estado (ABIERTA | CERRADA | ARCHIVADA). */
export async function cambiarEstado(conversacionId, estado) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones')
    .update({ estado })
    .eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/** Asigna la conversación a un agente/vendedor. */
export async function asignar(conversacionId, agente) {
  const { error } = await getSupabaseInbox()
    .from('conversaciones')
    .update({ asignado_a: agente || null })
    .eq('conversacion_id', conversacionId);
  if (error) throw error;
}

/**
 * Actualiza ultimo_mensaje_at y (opcional) incrementa no_leidos.
 * Nota: el incremento es leer+sumar (no atómico); suficiente por la baja
 * concurrencia por conversación. Si hiciera falta, migrar a un RPC atómico.
 */
async function bumpConversacion(conversacionId, { fecha, incrementarNoLeidos = false } = {}) {
  const db = getSupabaseInbox();
  const patch = { ultimo_mensaje_at: fecha || new Date().toISOString() };
  if (incrementarNoLeidos) {
    const { data } = await db
      .from('conversaciones')
      .select('no_leidos')
      .eq('conversacion_id', conversacionId)
      .single();
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
 * Inserta un mensaje. Idempotente por `waMessageId`: si ya existe uno con ese id
 * de WhatsApp, devuelve el existente sin duplicar (clave para reintentos del webhook).
 * NO actualiza la conversación; para eso usar recibirMensaje/enviarMensaje.
 */
export async function addMensaje(conversacionId, opts = {}) {
  const { direccion, tipo, texto, mediaUrl, waMessageId, estado, autor, fecha } = opts;
  if (!conversacionId) throw new Error('conversacionId requerido');
  if (!['IN', 'OUT'].includes(direccion)) throw new Error("direccion debe ser 'IN' o 'OUT'");
  const db = getSupabaseInbox();

  if (waMessageId) {
    const { data: existente } = await db
      .from('mensajes')
      .select('*')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();
    if (existente) return existente; // ya estaba → idempotente
  }

  const row = {
    conversacion_id: conversacionId,
    direccion,
    tipo: tipo || 'texto',
    texto: texto ?? null,
    media_url: mediaUrl ?? null,
    wa_message_id: waMessageId ?? null,
    estado: estado ?? null,
    autor: autor ?? null,
  };
  if (fecha) row.fecha = fecha;

  const { data, error } = await db.from('mensajes').insert(row).select().single();
  if (error) throw error;
  return data;
}

// ─── FLUJOS DE ALTO NIVEL ────────────────────────────────────────────────────

/**
 * Mensaje ENTRANTE (webhook de WhatsApp): asegura la conversación, inserta el
 * mensaje IN, actualiza ultimo_mensaje_at e incrementa no_leidos.
 * @returns {Promise<{ conversacion, mensaje }>}  mensaje = null si fue duplicado.
 */
export async function recibirMensaje({ cuenta, telefono, nombreContacto, tipo, texto, mediaUrl, waMessageId, fecha } = {}) {
  const conversacion = await upsertConversacion({ cuenta, telefono, nombreContacto });
  const mensaje = await addMensaje(conversacion.conversacion_id, {
    direccion: 'IN', tipo, texto, mediaUrl, waMessageId,
    autor: nombreContacto || telefono, fecha,
  });
  await bumpConversacion(conversacion.conversacion_id, {
    fecha: mensaje?.fecha || fecha,
    incrementarNoLeidos: true,
  });
  return { conversacion, mensaje };
}

/**
 * Mensaje SALIENTE (agente responde). Acepta conversacionId directo, o
 * (cuenta, telefono) para resolver/crear la conversación. No toca no_leidos.
 * @returns {Promise<{ conversacionId, mensaje }>}
 */
export async function enviarMensaje({ conversacionId, cuenta, telefono, nombreContacto, tipo, texto, mediaUrl, waMessageId, autor, estado, fecha } = {}) {
  let convId = conversacionId;
  if (!convId) {
    const conv = await upsertConversacion({ cuenta, telefono, nombreContacto });
    convId = conv.conversacion_id;
  }
  const mensaje = await addMensaje(convId, {
    direccion: 'OUT', tipo, texto, mediaUrl, waMessageId, autor,
    estado: estado || 'enviado', fecha,
  });
  await bumpConversacion(convId, { fecha: mensaje?.fecha || fecha });
  return { conversacionId: convId, mensaje };
}

// ─── PUENTE CON EL CRM (vista de unión por teléfono) ─────────────────────────

/**
 * Conversaciones con el cliente del CRM adjunto (si el teléfono matchea).
 * Lee la vista crm.cliente_conversacion (schema crm).
 */
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

/**
 * Las conversaciones de WhatsApp de un cliente del CRM (para mostrar el hilo
 * junto al pedido/cliente). `clienteId` = crm.clientes.cliente_id.
 */
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
