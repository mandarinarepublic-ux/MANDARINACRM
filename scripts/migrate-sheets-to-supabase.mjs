// scripts/migrate-sheets-to-supabase.mjs
//
// Backfill idempotente Google Sheets → Supabase (schema `crm`).
// - LEE cada hoja y la transforma a los tipos reales de Postgres.
// - ESCRIBE con upsert por PK (re-ejecutable). LOGS_PEDIDOS = replace (borra+inserta).
// - NO toca Sheets. Seguro correrlo varias veces.
//
// USO:
//   node scripts/migrate-sheets-to-supabase.mjs --dry-run     # solo lee+transforma, no escribe
//   node scripts/migrate-sheets-to-supabase.mjs               # escribe a Supabase
//   node scripts/migrate-sheets-to-supabase.mjs --only=usuarios,clientes   # subconjunto
//
// ENV requeridas (se leen de .env.local o del entorno):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Las credenciales de Google y SHEET_ID viven en Vercel; para correr local
// hay que tenerlas también en .env.local (p.ej. `vercel env pull .env.local`).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── .env.local loader (simple, tolera KEY="valor" y KEY=valor) ───────────────
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let [, k, v] = m;
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvLocal();

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;

// ─── Coerciones (idénticas a lib/db/_backend.js) ──────────────────────────────
const _MESES = { Ene: '01', Feb: '02', Mar: '03', Abr: '04', May: '05', Jun: '06',
  Jul: '07', Ago: '08', Sep: '09', Oct: '10', Nov: '11', Dic: '12' };

function toTimestamp(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, d, monRaw, y, hh = '00', mm = '00', ss = '00'] = m;
    const mon = _MESES[monRaw.charAt(0).toUpperCase() + monRaw.slice(1).toLowerCase()];
    if (mon) return `${y}-${mon}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss}-05:00`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed)) return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s) ? s : parsed.toISOString();
  return null;
}
function toBool(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ' || s === 'YES';
}
function csvToArray(v) {
  return String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
async function hashPw(stored) {
  const s = String(stored ?? '');
  if (/^\$2[aby]\$/.test(s)) return s;          // ya es bcrypt → conservar
  return bcrypt.hash(s, 10);                     // texto plano → hashear
}

// ─── Clientes de Google Sheets y Supabase ─────────────────────────────────────
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = process.env.SHEET_ID;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'crm' },
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Lee una hoja y devuelve filas como objetos {HEADER: valor, _raw: [celdas]}.
 * Detecta la fila de encabezado buscando `headerKey` (tolera header en fila 0/1/2
 * y una fila-descripción intermedia). Filtra filas cuya celda `pkCol` esté vacía.
 */
async function readSheet(sheets, name, headerKey, pkCol) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${name}!A:AZ`,
  });
  const rows = res.data.values || [];
  const h = rows.findIndex((r) => Array.isArray(r) && r.includes(headerKey));
  if (h < 0) return [];
  const headers = rows[h];
  const pkIdx = headers.indexOf(pkCol);
  return rows.slice(h + 1)
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
    name: 'usuarios', sheet: 'USUARIOS', headerKey: 'USUARIO_ID', pkCol: 'USUARIO_ID',
    conflict: 'usuario_id',
    map: async (r) => ({
      usuario_id: r.USUARIO_ID,
      nombre: r.NOMBRE || '',
      codigo: r.CODIGO || null,
      email: r.EMAIL || null,
      username: r.USERNAME || null,
      password_hash: await hashPw(r.PASSWORD_HASH),
      rol: r.ROL || 'VENDEDOR',
      areas: csvToArray(r.AREAS),
      tiendas: csvToArray(r.TIENDAS),
      activo: toBool(r.ACTIVO),
      fecha: toTimestamp(r.FECHA),
    }),
  },
  {
    name: 'clientes', sheet: 'CLIENTES', headerKey: 'CLIENTE_ID', pkCol: 'CLIENTE_ID',
    conflict: 'cliente_id',
    map: (r) => ({
      cliente_id: r.CLIENTE_ID,
      nombre: r.NOMBRE || '',
      cedula: r.CEDULA || null,
      celular: r.CELULAR || null,
      email: r.EMAIL || null,
      ciudad: r.CIUDAD || null,
      direccion: r.DIRECCION || null,
      fecha_registro: toTimestamp(r.FECHA_REGISTRO) || new Date().toISOString(),
    }),
  },
  {
    name: 'pedidos', sheet: 'PEDIDOS', headerKey: 'PEDIDO_ID', pkCol: 'PEDIDO_ID',
    conflict: 'pedido_id',
    map: (r) => ({
      pedido_id: r.PEDIDO_ID,
      tienda_id: r.TIENDA_ID || '',
      vendedor_id: r.VENDEDOR_ID || null,             // text: nombre o uuid
      cliente_id: r.CLIENTE_ID || null,
      fecha_pedido: toTimestamp(r.FECHA_PEDIDO) || new Date().toISOString(),
      fecha_actualizacion: toTimestamp(r.FECHA_ACTUALIZACION) || new Date().toISOString(),
      fecha_entrega_prometida: toTimestamp(r.FECHA_ENTREGA_PROMETIDA),
      dias_calculado: toNum(r.DIAS_CALCULADO),
      dias_prometido: toNum(r.DIAS_PROMETIDO),
      alerta_entrega: toBool(r.ALERTA_ENTREGA),
      estado_pedido: r.ESTADO_PEDIDO || 'EN_FABRICA',
      estado_pago: r.ESTADO_PAGO || 'PENDIENTE',
      monto_total: toNum(r.MONTO_TOTAL) ?? 0,
      monto_abonado: toNum(r.MONTO_ABONADO) ?? 0,
      monto_pendiente: toNum(r.MONTO_PENDIENTE) ?? 0,
      factura_solicitada: toBool(r.FACTURA_SOLICITADA),
      factura_datil_id: r.FACTURA_DATIL_ID || null,
      factura_id: r.FACTURA_ID || null,
      factura_pdf_url: r.FACTURA_PDF_URL || null,
      fecha_impresion_produccion: toTimestamp(r.FECHA_IMPRESION_PRODUCCION),
      impreso_por: r.IMPRESO_POR || null,
      notas_vendedor: r.NOTAS_VENDEDOR || null,
      guia_numero: r.GUIA_NUMERO || null,
      guia_transportista: r.GUIA_TRANSPORTISTA || null,
      direccion_pedido: r.DIRECCION_PEDIDO || r.DIRECCION_TEXTO || null,
      latitud: toNum(r.LATITUD),
      longitud: toNum(r.LONGITUD),
    }),
  },
  {
    name: 'detalle_pedido', sheet: 'DETALLE_PEDIDO', headerKey: 'ITEM_ID', pkCol: 'ITEM_ID',
    conflict: 'item_id',
    map: (r) => ({
      item_id: r.ITEM_ID,
      pedido_id: r.PEDIDO_ID,
      tienda_id: r.TIENDA_ID || null,
      producto_nombre: r.PRODUCTO_NOMBRE || null,
      detalle_personalizado: r.DETALLE_PERSONALIZADO || null,
      es_personalizado: toBool(r.ES_PERSONALIZADO),
      color: r.COLOR || null,
      talla: r.TALLA || null,
      cantidad: toNum(r.CANTIDAD) ?? 1,
      precio_unit: toNum(r.PRECIO_UNIT) ?? 0,
      subtotal: toNum(r.SUBTOTAL) ?? 0,
      area: r.AREA || null,
      subestado: r.SUBESTADO || null,
      subestado_corte: r.SUBESTADO_CORTE || null,
      foto_pecho_url: r.FOTO_PECHO_URL || null,
      foto_espalda_url: r.FOTO_ESPALDA_URL || null,
      foto_manga_d_url: r.FOTO_MANGA_D_URL || null,
      foto_manga_i_url: r.FOTO_MANGA_I_URL || null,
      archivo_diseno: r.ARCHIVO_DISENO || null,
      shopify_variant_id: r.SHOPIFY_VARIANT_ID || null,
      fecha_modificacion: toTimestamp(r.FECHA_MODIFICACION),
      notas_area: r.NOTAS_AREA || null,
      eliminado: r.SUBESTADO === 'ELIMINADO',           // soft-delete → columna real
    }),
  },
  {
    name: 'pagos', sheet: 'PAGOS', headerKey: 'PAGO_ID', pkCol: 'PAGO_ID',
    conflict: 'pago_id',
    // Columnas por POSICIÓN (la hoja tiene 3 placeholders vacíos 7-9):
    // 0 PAGO_ID 1 PEDIDO_ID 2 TIPO 3 MONTO 4 FECHA 5 ESTADO 6-8 vacías
    // 9 FOTO_COMPROBANTE_URL 10 VENDEDOR_ID 11 NOTAS
    map: (r) => {
      const c = r._raw;
      return {
        pago_id: c[0],
        pedido_id: c[1],
        tipo: c[2] || null,
        monto: toNum(c[3]) ?? 0,
        fecha: toTimestamp(c[4]) || new Date().toISOString(),
        estado: c[5] || 'PAGADO',
        foto_comprobante_url: c[9] || null,
        vendedor_id: c[10] || null,                      // text
        notas: c[11] || null,
      };
    },
  },
  {
    name: 'guias_despacho', sheet: 'GUIAS_DESPACHO', headerKey: 'GUIA_ID', pkCol: 'GUIA_ID',
    conflict: 'guia_id',
    map: (r) => ({
      guia_id: r.GUIA_ID,
      pedido_id: r.PEDIDO_ID,
      numero_guia: r.NUMERO_GUIA || null,
      transportista: r.TRANSPORTISTA || 'SERVIENTREGA',
      foto_guia_url: r.FOTO_GUIA_URL || null,
      fecha_despacho: toTimestamp(r.FECHA_DESPACHO) || new Date().toISOString(),
      registrado_por: r.REGISTRADO_POR || null,
      notas: r.NOTAS || null,
    }),
  },
  {
    name: 'logs_pedidos', sheet: 'LOGS_PEDIDOS', headerKey: 'PEDIDO_ID', pkCol: 'PEDIDO_ID',
    replace: true,                                       // sin PK natural → borra+inserta
    // Columnas por posición: 0 PEDIDO_ID 1 FECHA 2 USUARIO 3 CAMPO 4 ANTES 5 DESPUES
    map: (r) => {
      const c = r._raw;
      return {
        pedido_id: c[0] || null,
        fecha: toTimestamp(c[1]) || new Date().toISOString(),
        usuario: c[2] || null,
        campo: c[3] || null,
        valor_antes: c[4] || null,
        valor_despues: c[5] || null,
      };
    },
  },
  {
    name: 'sucursal', sheet: 'SUCURSAL', headerKey: 'ID', pkCol: 'ID',
    conflict: 'id',
    map: (r) => ({
      id: r.ID,
      nombre: r.NOMBRE || '',
      tienda: r.TIENDA || null,
      precio: toNum(r.PRECIO) ?? 0,
      talla: r.TALLA || 'U',
      color: r.COLOR || null,
      stock: toNum(r.STOCK) ?? 0,
      reservado: toNum(r.RESERVADO) ?? 0,
      foto_url: r.FOTO_URL || null,
      activo: toBool(r.ACTIVO),
      fecha_creacion: toTimestamp(r.FECHA_CREACION),
      creado_por: r.CREADO_POR || null,
      ultima_modificacion: toTimestamp(r.ULTIMA_MODIFICACION),
      modificado_por: r.MODIFICADO_POR || null,
    }),
  },
  {
    name: 'productos_catalogo', sheet: 'PRODUCTOS_CATALOGO', headerKey: 'NOMBRE', pkCol: 'NOMBRE',
    conflict: 'nombre',
    map: (r) => ({
      nombre: (r.NOMBRE || '').toUpperCase(),
      activo: r.ACTIVO !== 'FALSE',
    }),
  },
  {
    name: 'productos_shopify', sheet: 'PRODUCTOS_SHOPIFY', headerKey: 'TIENDA', pkCol: 'ID',
    conflict: 'tienda,id',
    map: (r) => ({
      tienda: r.TIENDA,
      id: r.ID,
      title: r.TITLE || null,
      price: toNum(r.PRICE),
      variants: csvToArray(r.VARIANTS),
      image: r.IMAGE || null,
      activo: r.ACTIVO !== 'FALSE',
    }),
  },
  {
    name: 'dias_entrega', sheet: 'DIAS_ENTREGA', headerKey: 'AREA_COMBINACION', pkCol: 'AREA_COMBINACION',
    conflict: 'area_combinacion',
    map: (r) => ({
      area_combinacion: r.AREA_COMBINACION,
      dias_minimos: toNum(r.DIAS_MINIMOS) ?? 3,
    }),
  },
];

// ─── Escritura por lotes con aislamiento de errores fila a fila ────────────────
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function writeTable(def, rows) {
  if (def.replace) {
    // logs_pedidos: log_id (identity) siempre >= 1 → borra todo.
    const { error } = await sb.from(def.name).delete().gte('log_id', 0);
    if (error) throw new Error(`delete ${def.name}: ${error.message}`);
  }
  let ok = 0;
  const failed = [];
  for (const c of chunk(rows, 500)) {
    const q = def.replace
      ? sb.from(def.name).insert(c)
      : sb.from(def.name).upsert(c, { onConflict: def.conflict });
    const { error } = await q;
    if (!error) { ok += c.length; continue; }
    // Aísla la fila culpable.
    for (const row of c) {
      const q2 = def.replace
        ? sb.from(def.name).insert(row)
        : sb.from(def.name).upsert(row, { onConflict: def.conflict });
      const { error: e2 } = await q2;
      if (e2) failed.push({ pk: row[def.conflict?.split(',')[0]] ?? '?', error: e2.message });
      else ok++;
    }
  }
  return { ok, failed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function assertEnv() {
  const req = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'SHEET_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const miss = req.filter((k) => !process.env[k]);
  if (miss.length) {
    console.error('❌ Faltan variables de entorno:', miss.join(', '));
    console.error('   Ponlas en .env.local o en el entorno antes de correr.');
    process.exit(1);
  }
}

async function main() {
  assertEnv();
  const sheets = getSheetsClient();
  const targets = TABLES.filter((t) => !ONLY || ONLY.includes(t.name) || ONLY.includes(t.sheet));

  console.log(`\n🍊 Backfill Sheets → Supabase (crm)  ${DRY ? '[DRY-RUN]' : '[ESCRIBIENDO]'}`);
  console.log('─'.repeat(60));

  const resumen = [];
  for (const def of targets) {
    process.stdout.write(`• ${def.name.padEnd(20)} `);
    let raw;
    try {
      raw = await readSheet(sheets, def.sheet, def.headerKey, def.pkCol);
    } catch (e) {
      console.log(`⚠️  no se pudo leer la hoja (${e.message})`);
      resumen.push({ tabla: def.name, leidas: 0, escritas: 0, fallidas: 0, nota: 'hoja no leída' });
      continue;
    }

    const mapped = [];
    for (const r of raw) mapped.push(await def.map(r));

    if (DRY) {
      console.log(`leídas ${String(raw.length).padStart(4)}  → transformadas ${mapped.length}  (dry-run, sin escribir)`);
      resumen.push({ tabla: def.name, leidas: raw.length, escritas: 0, fallidas: 0 });
      continue;
    }

    try {
      const { ok, failed } = await writeTable(def, mapped);
      console.log(`leídas ${String(raw.length).padStart(4)}  → escritas ${ok}${failed.length ? `  ❌ ${failed.length} fallidas` : '  ✅'}`);
      if (failed.length) failed.slice(0, 5).forEach((f) => console.log(`      - PK ${f.pk}: ${f.error}`));
      resumen.push({ tabla: def.name, leidas: raw.length, escritas: ok, fallidas: failed.length });
    } catch (e) {
      console.log(`💥 error de tabla: ${e.message}`);
      resumen.push({ tabla: def.name, leidas: raw.length, escritas: 0, fallidas: raw.length, nota: e.message });
    }
  }

  console.log('─'.repeat(60));
  console.table(resumen);
  const totalFail = resumen.reduce((s, r) => s + (r.fallidas || 0), 0);
  console.log(totalFail ? `\n⚠️  ${totalFail} filas con error — revisa arriba.` : '\n✅ Sin errores.');
}

main().catch((e) => { console.error('\n💥 Falla general:', e); process.exit(1); });
