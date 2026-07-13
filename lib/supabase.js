// lib/supabase.js
// Cliente de Supabase SOLO para el lado servidor (usa la service_role key).
// La service_role IGNORA RLS, por eso NUNCA debe llegar al navegador.
//
// La app apunta al schema `crm` por defecto (las 11 tablas del CRM viven ahí).
// Todo el acceso pasa por lib/db/* → estos repos deciden backend según DATA_BACKEND.

import { createClient } from '@supabase/supabase-js';

// Guard defensivo: si esto se importa en un bundle de cliente, fallar ruidosamente.
if (typeof window !== 'undefined') {
  throw new Error('lib/supabase.js es server-only: nunca lo importes en componentes de cliente.');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;

/**
 * Devuelve un singleton del cliente Supabase (service_role, schema `crm`).
 * Lanza sólo si se INTENTA usar sin credenciales, para no romper el arranque
 * cuando DATA_BACKEND=sheets y Supabase aún no está configurado.
 */
export function getSupabase() {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase no configurado: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. ' +
      'Defínelas en Vercel y en .env.local (ver .env.example).'
    );
  }

  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'crm' },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

/** true si hay credenciales de Supabase disponibles (útil para dual-write condicional). */
export function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}
