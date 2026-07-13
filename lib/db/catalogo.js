// lib/db/catalogo.js
// Repositorio del CATÁLOGO de tipos de prenda (tabla `productos_catalogo`, PK=nombre).
// Reemplaza lo que hoy hace app/api/productos/route.js detrás del switch DATA_BACKEND.
//
// ⚠️ Lectura Sheets: la hoja PRODUCTOS_CATALOGO tiene el HEADER en la fila 0 (A1),
// NO el triple offset de readSheet() (que salta 3 filas). Por eso NO se usa readSheet:
// se lee A:B directo y se replica exactamente la detección de header de productos/route.js.

import { getSheets } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write } from './_backend';

const TAB = 'PRODUCTOS_CATALOGO';

// Mismos defaults hardcodeados que hoy devuelve el GET de productos/route.js
// cuando la hoja está vacía (o falla la lectura).
const FALLBACK = [
  { NOMBRE: 'CAMISETA NORMAL' },
  { NOMBRE: 'CAMISETA OVERSIZE' },
  { NOMBRE: 'CHAQUETA' },
  { NOMBRE: 'BUZO' },
  { NOMBRE: 'HOODIE' },
  { NOMBRE: 'POLO' },
  { NOMBRE: 'CAMISETA SELECCIÓN' },
  { NOMBRE: 'PLANCHA DTF' },
];

/** Lee PRODUCTOS_CATALOGO!A:B con header en fila 0 (igual que productos/route.js). */
async function readCatalogoSheet() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${TAB}!A:B`,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  // Si la fila 0 es el header (col A = 'NOMBRE'), los datos arrancan en la fila 1.
  let dataRows = rows;
  if (rows[0][0]?.toUpperCase() === 'NOMBRE') {
    dataRows = rows.slice(1);
  }

  return dataRows
    .filter((r) => r[0] && r[0].trim())          // tiene nombre
    .map((r) => ({ NOMBRE: r[0].trim().toUpperCase(), ACTIVO: r[1] || 'TRUE' }))
    .filter((p) => p.ACTIVO !== 'FALSE')          // excluye inactivos
    .map((p) => ({ NOMBRE: p.NOMBRE }));
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/**
 * Lista de tipos de prenda activos → [{ NOMBRE }]. Si viene vacío (o falla),
 * cae al mismo fallback hardcodeado de hoy para que la UI nunca quede sin opciones.
 */
export async function listCatalogo() {
  try {
    const productos = await read({
      sheets: async () => readCatalogoSheet(),
      supabase: async () => {
        const { data, error } = await getSupabase()
          .from('productos_catalogo')
          .select('nombre')
          .eq('activo', true);
        if (error) throw error;
        return data.map((r) => ({ NOMBRE: String(r.nombre || '').toUpperCase() }));
      },
    });
    if (!productos || productos.length === 0) return FALLBACK;
    return productos;
  } catch (e) {
    // Igual que el GET actual: cualquier fallo → defaults, nunca romper la UI.
    return FALLBACK;
  }
}

/** Lectura SOLO Supabase (para lecturas-sombra): tipos de prenda activos. */
export async function listCatalogoSupabase() {
  const { data, error } = await getSupabase()
    .from('productos_catalogo')
    .select('nombre')
    .eq('activo', true);
  if (error) throw error;
  return data.map((r) => ({ NOMBRE: String(r.nombre || '').toUpperCase() }));
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/** Agrega un tipo de prenda al catálogo (nombre en MAYÚSCULAS, activo=true). */
export async function addCatalogo(nombre) {
  const limpio = String(nombre ?? '').trim().toUpperCase();
  if (!limpio) throw new Error('Nombre requerido');

  await write({
    // Sheets: append [NOMBRE, 'TRUE'] — idéntico al POST de productos/route.js.
    sheets: async () => {
      const sheets = await getSheets();
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: `${TAB}!A:A`,
        valueInputOption: 'RAW',
        requestBody: { values: [[limpio, 'TRUE']] },
      });
    },
    // Supabase: upsert por PK (nombre) → idempotente si ya existía.
    supabase: async () => {
      const { error } = await getSupabase()
        .from('productos_catalogo')
        .upsert({ nombre: limpio, activo: true }, { onConflict: 'nombre' });
      if (error) throw error;
    },
  });
}
