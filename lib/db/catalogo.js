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

/**
 * Orden alfabético en español ('Ñ' después de 'N', tildes donde corresponde).
 * localeCompare y no un sort crudo: con sort() por código de carácter, 'ÁRBOL'
 * o 'ÑANDÚ' se irían al final de la lista.
 */
function ordenar(lista) {
  return [...(lista || [])].sort((a, b) =>
    String(a.NOMBRE || '').localeCompare(String(b.NOMBRE || ''), 'es', { sensitivity: 'base' })
  );
}

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
        // order(): sin ORDER BY, Postgres devuelve el orden FÍSICO de la tabla
        // (y cambia tras cada modificación), así que los ~60 tipos de prenda
        // salían desordenados en el selector del pedido.
        const { data, error } = await getSupabase()
          .from('productos_catalogo')
          .select('nombre')
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        return data.map((r) => ({ NOMBRE: String(r.nombre || '').toUpperCase() }));
      },
    });
    if (!productos || productos.length === 0) return ordenar(FALLBACK);
    // Se ordena también aquí para que ambos backends (y la hoja, que va en orden
    // de carga) entreguen SIEMPRE la misma lista alfabética.
    return ordenar(productos);
  } catch (e) {
    // Igual que el GET actual: cualquier fallo → defaults, nunca romper la UI.
    return ordenar(FALLBACK);
  }
}

/**
 * Catálogo COMPLETO para la pantalla de gestión: incluye los inactivos y cuenta
 * en cuántas prendas se usó cada tipo, para que el admin sepa qué puede borrar
 * sin pensarlo y qué conviene solo desactivar.
 *
 * Solo Supabase: la hoja no permite contar usos de forma razonable y esta
 * pantalla es de administración, no del flujo de venta.
 */
export async function listCatalogoGestion() {
  const sb = getSupabase();

  const { data: cat, error } = await sb
    .from('productos_catalogo')
    .select('nombre, activo');
  if (error) throw error;

  const { data: usados, error: e2 } = await sb
    .from('detalle_pedido')
    .select('producto_nombre');
  if (e2) throw e2;

  const conteo = new Map();
  for (const d of usados || []) {
    const k = String(d.producto_nombre || '').trim().toUpperCase();
    if (k) conteo.set(k, (conteo.get(k) || 0) + 1);
  }

  // Alfabético: es como se busca un producto con la vista. El conteo de usos va
  // en cada fila y la pantalla permite reordenar por él si hace falta.
  return ordenar((cat || []).map((r) => {
    const nombre = String(r.nombre || '').toUpperCase();
    return { NOMBRE: nombre, ACTIVO: r.activo !== false, USOS: conteo.get(nombre.trim()) || 0 };
  }));
}

/** Lectura SOLO Supabase (para lecturas-sombra): tipos de prenda activos. */
export async function listCatalogoSupabase() {
  const { data, error } = await getSupabase()
    .from('productos_catalogo')
    .select('nombre')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return ordenar(data.map((r) => ({ NOMBRE: String(r.nombre || '').toUpperCase() })));
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

/** Escribe una celda de la hoja para la fila cuyo nombre coincide (col A). */
async function editarFilaSheet(nombre, { nuevoNombre, activo }) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${TAB}!A:B`,
  });
  const rows = res.data.values || [];
  const buscado = String(nombre).trim().toUpperCase();
  const idx = rows.findIndex((r) => String(r[0] || '').trim().toUpperCase() === buscado);
  if (idx < 0) return;                       // no está en la hoja: nada que hacer
  const fila = idx + 1;                       // A1 = fila 1

  if (nuevoNombre !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${TAB}!A${fila}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[String(nuevoNombre).trim().toUpperCase()]] },
    });
  }
  if (activo !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `${TAB}!B${fila}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[activo ? 'TRUE' : 'FALSE']] },
    });
  }
}

/**
 * Renombra un tipo de prenda y/o lo activa/desactiva.
 *
 * OJO: los pedidos guardan una COPIA del nombre en detalle_pedido.producto_nombre,
 * así que renombrar aquí NO reescribe el histórico — las prendas ya vendidas
 * conservan el nombre con el que se vendieron. Es a propósito: reescribir
 * pedidos cerrados sería peor.
 */
export async function updateCatalogo(nombre, { nuevoNombre, activo }) {
  const actual = String(nombre ?? '').trim().toUpperCase();
  if (!actual) throw new Error('Nombre requerido');
  const destino = nuevoNombre !== undefined ? String(nuevoNombre).trim().toUpperCase() : undefined;
  if (destino !== undefined && !destino) throw new Error('El nombre nuevo no puede estar vacío');

  await write({
    sheets: async () => editarFilaSheet(actual, { nuevoNombre: destino, activo }),
    supabase: async () => {
      const sb = getSupabase();
      // `nombre` es la PK: renombrar = insertar el nuevo y borrar el viejo.
      if (destino !== undefined && destino !== actual) {
        const { data: previo } = await sb
          .from('productos_catalogo').select('activo').eq('nombre', actual).maybeSingle();
        const { error: e1 } = await sb
          .from('productos_catalogo')
          .upsert({ nombre: destino, activo: activo !== undefined ? activo : (previo?.activo ?? true) },
                  { onConflict: 'nombre' });
        if (e1) throw e1;
        const { error: e2 } = await sb.from('productos_catalogo').delete().eq('nombre', actual);
        if (e2) throw e2;
        return;
      }
      if (activo !== undefined) {
        const { error } = await sb
          .from('productos_catalogo').update({ activo }).eq('nombre', actual);
        if (error) throw error;
      }
    },
  });
}

/**
 * Borra un tipo de prenda del catálogo.
 * Solo debería usarse con los que no se han vendido nunca; para el resto,
 * desactivar conserva la trazabilidad.
 */
export async function deleteCatalogo(nombre) {
  const limpio = String(nombre ?? '').trim().toUpperCase();
  if (!limpio) throw new Error('Nombre requerido');

  await write({
    // En la hoja se marca inactivo en vez de borrar la fila: eliminar filas
    // desplaza el resto y es más fácil de romper que de arreglar.
    sheets: async () => editarFilaSheet(limpio, { activo: false }),
    supabase: async () => {
      const { error } = await getSupabase()
        .from('productos_catalogo').delete().eq('nombre', limpio);
      if (error) throw error;
    },
  });
}
