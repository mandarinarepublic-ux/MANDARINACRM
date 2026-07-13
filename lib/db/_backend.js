// lib/db/_backend.js
// Núcleo de la capa de repositorios. Decide de dónde LEER y a dónde ESCRIBIR
// según DATA_BACKEND, e implementa el patrón de doble escritura (dual-write).
//
// Modelo:
//  - DATA_BACKEND = 'sheets' (default) | 'supabase'  → fuente de verdad para LECTURAS
//    y escritura PRIMARIA (debe tener éxito o se lanza el error al usuario).
//  - El OTRO backend, si está configurado, recibe una escritura ESPEJO best-effort
//    (se registra en consola si falla, pero NUNCA rompe la operación del usuario).
//  Así:
//    sheets  + supabase configurado  → Sheets manda, Supabase se llena en paralelo (Fase 3).
//    supabase + sheets disponible    → Supabase manda, Sheets queda como respaldo (Fase 5).

import { supabaseConfigured } from '../supabase';

export const BACKEND = process.env.DATA_BACKEND === 'supabase' ? 'supabase' : 'sheets';

/** ¿Las LECTURAS salen de Supabase? */
export function readsFromSupabase() {
  return BACKEND === 'supabase';
}

/**
 * Ejecuta una escritura respetando el patrón dual-write.
 * @param {Object} impls  { sheets: async()=>T, supabase: async()=>T }
 * @returns el resultado de la escritura PRIMARIA (la del backend de verdad).
 *
 * La primaria (BACKEND) se await-ea y sus errores se propagan.
 * La secundaria se corre best-effort (no bloquea, no lanza).
 */
export async function write({ sheets, supabase }) {
  const primaryKey = BACKEND;                     // 'sheets' | 'supabase'
  const secondaryKey = BACKEND === 'sheets' ? 'supabase' : 'sheets';
  const primary = primaryKey === 'sheets' ? sheets : supabase;
  const secondary = secondaryKey === 'sheets' ? sheets : supabase;

  // La secundaria de Supabase sólo corre si hay credenciales.
  const secondaryEnabled =
    typeof secondary === 'function' &&
    (secondaryKey === 'sheets' ? true : supabaseConfigured());

  const result = await primary();               // ⚠️ debe tener éxito

  if (secondaryEnabled) {
    // best-effort: no await bloqueante del usuario, pero sí capturamos errores.
    Promise.resolve()
      .then(() => secondary())
      .catch((e) => {
        console.warn(`[dual-write] escritura espejo a "${secondaryKey}" falló:`, e?.message || e);
      });
  }

  return result;
}

/** Elige la implementación de LECTURA según el backend activo. */
export async function read({ sheets, supabase }) {
  return BACKEND === 'supabase' ? supabase() : sheets();
}

// ─── Coerciones Sheets(string) ⇄ Postgres(tipos reales) ──────────────────────

/** 'TRUE'/'FALSE'/'1'/'si' → boolean. */
export function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ' || s === 'YES';
}

/** boolean → 'TRUE'/'FALSE' (formato de la hoja). */
export function boolStr(v) {
  return v ? 'TRUE' : 'FALSE';
}

/** CSV 'A, B , C' → ['A','B','C'] (para columnas text[]). */
export function csvToArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ['A','B'] o CSV → 'A,B' (para escribir en la hoja). */
export function arrayToCsv(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(',');
  return String(v ?? '');
}

/** string/num → number (o null si vacío/NaN). */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Meses del formato de Sheets (formatFecha): "14Jun2026 20:53:00"
const _MESES = { Ene: '01', Feb: '02', Mar: '03', Abr: '04', May: '05', Jun: '06',
  Jul: '07', Ago: '08', Sep: '09', Oct: '10', Nov: '11', Dic: '12' };

/**
 * Convierte una fecha a algo que Postgres `timestamptz` acepta (ISO string) o null.
 * Maneja los formatos que conviven en el CRM:
 *  - '' / null / undefined            → null
 *  - ISO ('2026-06-14T20:53:00Z' etc) → tal cual (Postgres lo parsea)
 *  - Ecuador 'DDMonYYYY HH:MM:SS'      → 'YYYY-MM-DDTHH:MM:SS-05:00'
 *    (formatFecha imprime hora de pared de Ecuador = UTC-5)
 *  - solo fecha 'YYYY-MM-DD'           → tal cual
 * Si no puede parsear, devuelve null (mejor null que romper el insert).
 */
export function toTimestamp(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;

  // Formato Ecuador: 14Jun2026 20:53:00  (o sin hora)
  const m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, d, monRaw, y, hh = '00', mm = '00', ss = '00'] = m;
    const mon = _MESES[monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase()];
    if (mon) {
      const dd = d.padStart(2, '0');
      return `${y}-${mon}-${dd}T${hh.padStart(2, '0')}:${mm}:${ss}-05:00`;
    }
  }

  // ISO / YYYY-MM-DD / cualquier cosa que Date entienda → normaliza a ISO.
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    // Si ya venía como ISO/fecha válida, devolver el string original evita
    // corrimientos de zona; solo caemos a toISOString si hace falta normalizar.
    return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s) ? s : parsed.toISOString();
  }
  return null;
}
