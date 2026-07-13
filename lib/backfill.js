// lib/backfill.js
// Lógica de backfill Sheets → Supabase (schema `crm`), pensada para correr DENTRO
// del runtime de Vercel (donde los secretos GOOGLE_* / SUPABASE_* SÍ están, aunque
// Vercel no los deje descargar por CLI).
//
// Lee con el cliente autenticado de lib/sheets (getSheets) y escribe con getSupabase().
// Idempotente: upsert por PK; logs_pedidos = replace (borra+inserta).
// Reutiliza las coerciones de lib/db/_backend para no divergir de los repos.

import bcrypt from 'bcryptjs';
import { getSheets } from './sheets';
import { getSupabase } from './supabase';
import { toTimestamp, toBool, csvToArray, toNum } from './db/_backend';

const SHEET_ID = process.env.SHEET_ID;

async function hashPw(stored) {
  const s = String(stored ?? '');
  if (/^\$2[aby]\$/.test(s)) return s;       // ya bcrypt → conservar
  return bcrypt.hash(s, 10);                  // texto plano → hashear
}

/**
 * Lee una hoja y devuelve filas {HEADER: valor, _raw:[celdas]}.
 * Estructura real de las hojas: fila título (0), headers (1), DESCRIPCIÓN (2),
 * datos (3+) — EXCEPTO logs/catalogo/shopify (header en 0) y sucursal (header en 1
 * sin descripción). `descRow=true` salta la fila de descripción.
 * Headers se recortan (trim) porque alguno trae espacios (p.ej. 'NOTAS_AREA ').
 */
async function readSheetRobust(sheets, name, headerKey, pkCol, descRow = false) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A:AZ`,
  });
  const rows = res.data.values || [];
  const h = rows.findIndex((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() === headerKey));
  if (h < 0) return [];
  const headers = rows[h].map((c) => String(c ?? '').trim());
  const pkIdx = headers.indexOf(pkCol);
  const dataStart = h + 1 + (descRow ? 1 : 0);   // salta la fila de descripción si aplica
  return rows.slice(dataStart)
    .filter((r) => Array.isArray(r) && String(r[pkIdx] ?? '').trim() !== '')
    .map((r) => {
      const o = { _raw: r };
      headers.forEach((hd, i) => { o[hd] = r[i] !== undefined && r[i] !== null ? String(r[i]) : ''; });
      return o;
    });
}

// ─── Definición de tablas (orden = respeta FKs) ───────────────────────────────
const TABLES = [
  {
    name: 'usuarios', sheet: 'USUARIOS', headerKey: 'USUARIO_ID', pkCol: 'USUARIO_ID', conflict: 'usuario_id', descRow: true,
    map: async (r) => ({
      usuario_id: r.USUARIO_ID, nombre: r.NOMBRE || '', codigo: r.CODIGO || null,
      email: r.EMAIL || null, username: r.USERNAME || null, password_hash: await hashPw(r.PASSWORD_HASH),
      rol: r.ROL || 'VENDEDOR', areas: csvToArray(r.AREAS), tiendas: csvToArray(r.TIENDAS),
      activo: toBool(r.ACTIVO), fecha: toTimestamp(r.FECHA_CREADO),
    }),
  },
  {
    name: 'clientes', sheet: 'CLIENTES', headerKey: 'CLIENTE_ID', pkCol: 'CLIENTE_ID', conflict: 'cliente_id', descRow: true,
    map: (r) => ({
      cliente_id: r.CLIENTE_ID, nombre: r.NOMBRE || '', cedula: r.CEDULA || null, celular: r.CELULAR || null,
      email: r.EMAIL || null, ciudad: r.CIUDAD || null, direccion: r.DIRECCION || null,
      fecha_registro: toTimestamp(r.FECHA_REGISTRO) || new Date().toISOString(),
    }),
  },
  {
    name: 'pedidos', sheet: 'PEDIDOS', headerKey: 'PEDIDO_ID', pkCol: 'PEDIDO_ID', conflict: 'pedido_id', descRow: true,
    map: (r) => ({
      pedido_id: r.PEDIDO_ID, tienda_id: r.TIENDA_ID || '', vendedor_id: r.VENDEDOR_ID || null,
      cliente_id: r.CLIENTE_ID || null,
      fecha_pedido: toTimestamp(r.FECHA_PEDIDO) || new Date().toISOString(),
      fecha_actualizacion: toTimestamp(r.FECHA_MODIFICACION) || new Date().toISOString(),
      fecha_entrega_prometida: toTimestamp(r.FECHA_ENTREGA_PROMETIDA),
      dias_calculado: toNum(r.DIAS_ENTREGA_CALCULADO), dias_prometido: toNum(r.DIAS_ENTREGA_PROMETIDO),
      alerta_entrega: toBool(r.ALERTA_ENTREGA), estado_pedido: r.ESTADO_PEDIDO || 'EN_FABRICA',
      estado_pago: r.ESTADO_PAGO || 'PENDIENTE',
      monto_total: toNum(r.MONTO_TOTAL) ?? 0, monto_abonado: toNum(r.MONTO_ABONADO) ?? 0,
      monto_pendiente: toNum(r.MONTO_PENDIENTE) ?? 0, factura_solicitada: toBool(r.FACTURA_SOLICITADA),
      factura_datil_id: r.FACTURA_DATIL_ID || null, factura_id: r.FACTURA_ID || null,
      factura_pdf_url: r.FACTURA_PDF_URL || null,
      fecha_impresion_produccion: toTimestamp(r.FECHA_IMPRESION_PRODUCCION), impreso_por: r.IMPRESO_POR || null,
      notas_vendedor: r.NOTAS_VENDEDOR || null, guia_numero: r.GUIA_NUMERO || null,
      guia_transportista: r.GUIA_TRANSPORTISTA || null,
      direccion_pedido: r.DIRECCION_PEDIDO || r.DIRECCION_TEXTO || null,
      latitud: toNum(r.LATITUD), longitud: toNum(r.LONGITUD),
    }),
  },
  {
    name: 'detalle_pedido', sheet: 'DETALLE_PEDIDO', headerKey: 'ITEM_ID', pkCol: 'ITEM_ID', conflict: 'item_id', descRow: true,
    map: (r) => ({
      item_id: r.ITEM_ID, pedido_id: r.PEDIDO_ID, tienda_id: r.TIENDA_ID || null,
      producto_nombre: r.PRODUCTO_NOMBRE || null, detalle_personalizado: r.DETALLE_PERSONALIZADO || null,
      es_personalizado: toBool(r.ES_PERSONALIZADO), color: r.COLOR || null, talla: r.TALLA || null,
      cantidad: toNum(r.CANTIDAD) ?? 1, precio_unit: toNum(r.PRECIO_UNIT) ?? 0, subtotal: toNum(r.SUBTOTAL) ?? 0,
      area: r.AREA || null, subestado: r.SUBESTADO || null, subestado_corte: r.SUBESTADO_CORTE || null,
      foto_pecho_url: r.FOTO_PECHO_URL || null, foto_espalda_url: r.FOTO_ESPALDA_URL || null,
      foto_manga_d_url: r.FOTO_MANGA_D_URL || null, foto_manga_i_url: r.FOTO_MANGA_I_URL || null,
      archivo_diseno: r['ARCHIVO_DISEÑO_URL'] || null, shopify_variant_id: r.SHOPIFY_VARIANT_ID || null,
      fecha_modificacion: toTimestamp(r.FECHA_MODIFICACION), notas_area: r.NOTAS_AREA || null,
      eliminado: r.SUBESTADO === 'ELIMINADO',
    }),
  },
  {
    name: 'pagos', sheet: 'PAGOS', headerKey: 'PAGO_ID', pkCol: 'PAGO_ID', conflict: 'pago_id', descRow: true,
    // Por posición (3 placeholders vacíos 6-8): 0 PAGO_ID 1 PEDIDO_ID 2 TIPO 3 MONTO
    // 4 FECHA 5 ESTADO 9 FOTO_COMPROBANTE 10 VENDEDOR 11 NOTAS
    map: (r) => {
      const c = r._raw;
      return {
        pago_id: c[0], pedido_id: c[1], tipo: c[2] || null, monto: toNum(c[3]) ?? 0,
        fecha: toTimestamp(c[4]) || new Date().toISOString(), estado: c[5] || 'PAGADO',
        foto_comprobante_url: c[9] || null, vendedor_id: c[10] || null, notas: c[11] || null,
      };
    },
  },
  {
    name: 'guias_despacho', sheet: 'GUIAS_DESPACHO', headerKey: 'GUIA_ID', pkCol: 'GUIA_ID', conflict: 'guia_id', descRow: true,
    map: (r) => ({
      guia_id: r.GUIA_ID, pedido_id: r.PEDIDO_ID, numero_guia: r.NUMERO_GUIA || null,
      transportista: r.TRANSPORTISTA || 'SERVIENTREGA', foto_guia_url: r.FOTO_GUIA_URL || null,
      fecha_despacho: toTimestamp(r.FECHA_DESPACHO) || new Date().toISOString(),
      registrado_por: r.REGISTRADO_POR || null, notas: r.NOTAS || null,
    }),
  },
  {
    name: 'logs_pedidos', sheet: 'LOGS_PEDIDOS', headerKey: 'PEDIDO_ID', pkCol: 'PEDIDO_ID', replace: true,
    // Por posición: 0 PEDIDO_ID 1 FECHA 2 USUARIO 3 CAMPO 4 ANTES 5 DESPUES
    map: (r) => {
      const c = r._raw;
      return {
        pedido_id: c[0] || null, fecha: toTimestamp(c[1]) || new Date().toISOString(),
        usuario: c[2] || null, campo: c[3] || null, valor_antes: c[4] || null, valor_despues: c[5] || null,
      };
    },
  },
  {
    name: 'sucursal', sheet: 'SUCURSAL', headerKey: 'ID', pkCol: 'ID', conflict: 'id',
    map: (r) => ({
      id: r.ID, nombre: r.NOMBRE || '', tienda: r.TIENDA || null, precio: toNum(r.PRECIO) ?? 0,
      talla: r.TALLA || 'U', color: r.COLOR || null, stock: toNum(r.STOCK) ?? 0,
      reservado: toNum(r.RESERVADO) ?? 0, foto_url: r.FOTO_URL || null, activo: toBool(r.ACTIVO),
      fecha_creacion: toTimestamp(r.FECHA_CREACION), creado_por: r.CREADO_POR || null,
      ultima_modificacion: toTimestamp(r.ULTIMA_MODIFICACION), modificado_por: r.MODIFICADO_POR || null,
    }),
  },
  {
    name: 'productos_catalogo', sheet: 'PRODUCTOS_CATALOGO', headerKey: 'NOMBRE', pkCol: 'NOMBRE', conflict: 'nombre',
    map: (r) => ({ nombre: (r.NOMBRE || '').toUpperCase(), activo: r.ACTIVO !== 'FALSE' }),
  },
  {
    name: 'productos_shopify', sheet: 'PRODUCTOS_SHOPIFY', headerKey: 'TIENDA', pkCol: 'ID', conflict: 'tienda,id',
    map: (r) => ({
      tienda: r.TIENDA, id: r.ID, title: r.TITLE || null, price: toNum(r.PRICE),
      variants: csvToArray(r.VARIANTS), image: r.IMAGE || null, activo: r.ACTIVO !== 'FALSE',
    }),
  },
  {
    name: 'dias_entrega', sheet: 'DIAS_ENTREGA', headerKey: 'AREA_COMBINACION', pkCol: 'AREA_COMBINACION', conflict: 'area_combinacion', descRow: true,
    map: (r) => ({ area_combinacion: r.AREA_COMBINACION, dias_minimos: toNum(r.DIAS_MINIMOS) ?? 3 }),
  },
];

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function writeTable(sb, def, rows) {
  if (def.replace) {
    const { error } = await sb.from(def.name).delete().gte('log_id', 0);
    if (error) throw new Error(`delete ${def.name}: ${error.message}`);
  }
  let ok = 0;
  const failed = [];
  for (const c of chunk(rows, 500)) {
    const q = def.replace ? sb.from(def.name).insert(c) : sb.from(def.name).upsert(c, { onConflict: def.conflict });
    const { error } = await q;
    if (!error) { ok += c.length; continue; }
    for (const row of c) {
      const q2 = def.replace ? sb.from(def.name).insert(row) : sb.from(def.name).upsert(row, { onConflict: def.conflict });
      const { error: e2 } = await q2;
      if (e2) failed.push({ pk: row[def.conflict?.split(',')[0]] ?? '?', error: e2.message });
      else ok++;
    }
  }
  return { ok, failed };
}

/** Diagnóstico: primeras `n` filas CRUDAS de una hoja (para inspeccionar estructura). */
export async function peekSheet(name, n = 8) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A:AZ`,
  });
  const rows = res.data.values || [];
  return { sheet: name, totalFilas: rows.length, primeras: rows.slice(0, n) };
}

/**
 * Corre el backfill. Devuelve un resumen JSON-serializable.
 * @param {Object} opts
 * @param {string[]|null} opts.only  nombres de tabla a procesar (null = todas)
 * @param {boolean} opts.dryRun      true = solo lee+transforma, no escribe
 */
export async function runBackfill({ only = null, dryRun = false } = {}) {
  const sheets = await getSheets();
  const sb = dryRun ? null : getSupabase();
  const targets = TABLES.filter((t) => !only || only.includes(t.name) || only.includes(t.sheet));

  const resumen = [];
  for (const def of targets) {
    let raw;
    try {
      raw = await readSheetRobust(sheets, def.sheet, def.headerKey, def.pkCol, def.descRow);
    } catch (e) {
      resumen.push({ tabla: def.name, leidas: 0, escritas: 0, fallidas: 0, nota: `hoja no leída: ${e.message}` });
      continue;
    }

    const mapped = [];
    for (const r of raw) mapped.push(await def.map(r));

    if (dryRun) {
      resumen.push({ tabla: def.name, leidas: raw.length, transformadas: mapped.length, escritas: 0, fallidas: 0 });
      continue;
    }

    try {
      const { ok, failed } = await writeTable(sb, def, mapped);
      resumen.push({
        tabla: def.name, leidas: raw.length, escritas: ok, fallidas: failed.length,
        errores: failed.slice(0, 5),
      });
    } catch (e) {
      resumen.push({ tabla: def.name, leidas: raw.length, escritas: 0, fallidas: raw.length, nota: e.message });
    }
  }

  const totalFallidas = resumen.reduce((s, r) => s + (r.fallidas || 0), 0);
  return { dryRun, ok: totalFallidas === 0, totalFallidas, tablas: resumen };
}
