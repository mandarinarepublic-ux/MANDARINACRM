// lib/db/productosShopify.js
// Repositorio del catálogo Shopify sincronizado (tabla `productos_shopify`,
// PK compuesta = tienda + id). Reemplaza la lectura de app/api/shopify/products/route.js
// y la escritura (reemplazo total por tienda) de app/api/shopify/sync/route.js.
//
// ⚠️ Lectura Sheets: la hoja PRODUCTOS_SHOPIFY tiene el HEADER en la fila 0 (A1),
// NO el offset de readSheet(). Se lee A:G directo replicando shopify/products/route.js.
//
// Columnas de la hoja (orden fijo, = HEADER del sync):
//   A TIENDA · B ID · C TITLE · D PRICE · E VARIANTS(CSV) · F IMAGE · G ACTIVO

import { getSheets } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write, csvToArray, toNum, toBool } from './_backend';

const TAB = 'PRODUCTOS_SHOPIFY';
const HEADER = ['TIENDA', 'ID', 'TITLE', 'PRICE', 'VARIANTS', 'IMAGE', 'ACTIVO'];

// Igual que el sync: permite alojar el catálogo en otro spreadsheet sin tocar código.
function sheetId() {
  return process.env.PRODUCTOS_SHEET_ID || process.env.SHEET_ID;
}

/**
 * Arma el shape de producto que consume la UI, idéntico al de hoy.
 * @param tienda / id / title / image  strings
 * @param price   string (default '35.00' si viene vacío — igual que hoy)
 * @param variants array de tallas ya normalizado
 */
function toProduct({ tienda, id, title, price, variants, image }) {
  const precio = price || '35.00';
  const tallas = variants || [];
  return {
    id: id || title,
    title,
    price: precio,
    image: image || null,
    variants: tallas.map((t) => ({ id: `${id}_${t}`, title: t, price: precio })),
    options: [{ name: 'Talla', values: tallas }],
    tags: '',
    tienda,
  };
}

/** Lee PRODUCTOS_SHOPIFY!A:G con header en fila 0 y aplica los mismos filtros de hoy. */
async function readProductosShopifySheet({ tienda, q }) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${TAB}!A:G`,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];

  // Salta el header si está presente.
  let dataRows = rows;
  if (rows[0][0]?.toUpperCase() === 'TIENDA') {
    dataRows = rows.slice(1);
  }

  return dataRows
    .filter((r) => {
      if (!r[2]) return false;                                                   // sin título
      if (r[6] === 'FALSE') return false;                                        // inactivo
      if (tienda && r[0]?.toUpperCase() !== tienda.toUpperCase()) return false;  // otra tienda
      if (q && !r[2]?.toLowerCase().includes(q.toLowerCase())) return false;     // no matchea query
      return true;
    })
    .map((r) =>
      toProduct({
        tienda: r[0],
        id: r[1],
        title: r[2],
        price: r[3],
        variants: csvToArray(r[4]),
        image: r[5],
      })
    );
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/**
 * Productos Shopify filtrados por tienda y/o query (subcadena en el título).
 * Devuelve el MISMO shape que hoy. Si no hay resultados devuelve [] (el fallback
 * hardcodeado sigue viviendo en la ruta, no aquí).
 */
export async function listProductosShopify({ tienda, q } = {}) {
  return read({
    sheets: async () => readProductosShopifySheet({ tienda, q }),
    supabase: async () => {
      let query = getSupabase()
        .from('productos_shopify')
        .select('*')
        .eq('activo', true);
      if (tienda) query = query.ilike('tienda', tienda);      // match case-insensitive
      if (q) query = query.ilike('title', `%${q}%`);          // subcadena, igual que hoy
      const { data, error } = await query;
      if (error) throw error;
      return data.map((r) =>
        toProduct({
          tienda: r.tienda,
          id: r.id,
          title: r.title,
          // price es numeric en Postgres → string para conservar el shape de hoy.
          price: r.price !== null && r.price !== undefined ? String(r.price) : '',
          variants: r.variants || [],
          image: r.image,
        })
      );
    },
  });
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/**
 * Reemplaza el catálogo de las tiendas SINCRONIZADAS, preservando las que NO
 * lo fueron (equivalente al sync actual: un fallo de una tienda no borra la otra).
 *
 * @param {Array<Array>} rows  filas frescas en orden de HEADER:
 *        [TIENDA, ID, TITLE, PRICE, VARIANTS(CSV), IMAGE, ACTIVO('TRUE'/'FALSE')]
 *        (exactamente lo que devuelve fetchShopifyProducts).
 * @param {{ tiendasSincronizadas: string[] }} opts  ids de tienda que sí respondieron.
 */
export async function replaceProductosShopify(rows, { tiendasSincronizadas } = {}) {
  const sincronizadas = tiendasSincronizadas || [];
  const syncedUpper = new Set(sincronizadas.map((id) => String(id).toUpperCase()));

  await write({
    // Sheets: preservar filas de tiendas NO sincronizadas + clear A:G + reescribir.
    sheets: async () => {
      const sheets = await getSheets();
      const spreadsheetId = sheetId();

      // Preservar las filas de las tiendas que NO se sincronizaron esta vez.
      let preservadas = [];
      try {
        const prev = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A:G` });
        const prevRows = prev.data.values || [];
        const dataRows = prevRows[0]?.[0]?.toUpperCase() === 'TIENDA' ? prevRows.slice(1) : prevRows;
        preservadas = dataRows.filter((r) => r[0] && !syncedUpper.has(String(r[0]).toUpperCase()));
      } catch (e) {
        console.warn('No se pudo leer la hoja previa para preservar filas:', e.message);
      }

      const finalRows = [...rows, ...preservadas];

      // Reemplazo del tab: limpiar A:G y reescribir header + filas (frescas + preservadas).
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TAB}!A:G` });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER, ...finalRows] },
      });
    },
    // Supabase: borrar filas de las tiendas sincronizadas + insertar las nuevas.
    // (Las tiendas NO sincronizadas se preservan solas al no tocarse sus filas.)
    supabase: async () => {
      const db = getSupabase();

      if (sincronizadas.length > 0) {
        const { error: delErr } = await db
          .from('productos_shopify')
          .delete()
          .in('tienda', sincronizadas);
        if (delErr) throw delErr;
      }

      // Fila (array en orden HEADER) → objeto con tipos reales de Postgres.
      const registros = rows.map((r) => ({
        tienda: r[0],
        id: r[1],
        title: r[2],
        price: toNum(r[3]),          // numeric
        variants: csvToArray(r[4]),  // text[]
        image: r[5] || null,
        activo: r[6] !== undefined ? toBool(r[6]) : true,
      }));

      if (registros.length > 0) {
        const { error: insErr } = await db.from('productos_shopify').insert(registros);
        if (insErr) throw insErr;
      }
    },
  });
}
