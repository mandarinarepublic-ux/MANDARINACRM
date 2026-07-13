// scripts/migrate-inbox-to-supabase.mjs
//
// Backfill idempotente del INBOX de WhatsApp: Google Sheets → Supabase (schema `inbox`).
// Lee las hojas CONTACTOS y MENSAJES del spreadsheet del bot y las carga en
// inbox.conversaciones + inbox.mensajes. Se corre UNA vez por cuenta (IND / MANDI),
// ya que cada cuenta tiene su propio spreadsheet con la MISMA estructura.
//
// USO:
//   node scripts/migrate-inbox-to-supabase.mjs --cuenta=MANDI [--sheet-id=<id>] [--dry-run]
//   node scripts/migrate-inbox-to-supabase.mjs --cuenta=IND   --sheet-id=<idDelInboxDeInd>
//
// --sheet-id: id del spreadsheet del inbox de esa cuenta. Si se omite, usa
//   INBOX_SHEET_ID y si tampoco, SHEET_ID.
//
// ENV (de .env.local o del entorno): GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
//   INBOX_SHEET_ID (o SHEET_ID), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Idempotente: conversaciones = upsert por (cuenta, telefono); mensajes = upsert por
//   mensaje_id. Re-ejecutable sin duplicar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let [, k, v] = m;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvLocal();

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const cuentaArg = args.find((a) => a.startsWith('--cuenta='));
const CUENTA = cuentaArg ? cuentaArg.split('=')[1].toUpperCase() : null;
const sheetArg = args.find((a) => a.startsWith('--sheet-id='));
const SHEET_ID = (sheetArg && sheetArg.split('=')[1]) || process.env.INBOX_SHEET_ID || process.env.SHEET_ID;

if (!CUENTA || !['IND', 'MANDI'].includes(CUENTA)) {
  console.error('❌ Falta --cuenta=IND|MANDI'); process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const digits = (v) => (v == null ? '' : String(v).replace(/\D/g, ''));
function toTs(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v) => (v == null || v === '' ? null : String(v));

// ─── Clientes ─────────────────────────────────────────────────────────────────
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
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'inbox' },
  auth: { persistSession: false, autoRefreshToken: false },
});

// Lee una hoja como objetos {HEADER: valor}, detectando la fila de encabezado por `headerKey`.
async function readTab(sheets, name, headerKey) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${name}!A:AZ` });
  const rows = res.data.values || [];
  const h = rows.findIndex((r) => Array.isArray(r) && r.includes(headerKey));
  if (h < 0) return [];
  const headers = rows[h];
  return rows.slice(h + 1).map((r) => {
    const o = {};
    headers.forEach((hd, i) => { o[hd] = r[i]; });
    return o;
  });
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  for (const k of ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[k]) { console.error(`❌ Falta env ${k}`); process.exit(1); }
  }
  if (!SHEET_ID) { console.error('❌ Falta el id del spreadsheet (--sheet-id / INBOX_SHEET_ID / SHEET_ID)'); process.exit(1); }

  const sheets = getSheetsClient();
  console.log(`\n🟢 Backfill INBOX (${CUENTA})  ${DRY ? '[DRY-RUN]' : '[ESCRIBIENDO]'}  sheet=${SHEET_ID}`);
  console.log('─'.repeat(60));

  const contactos = await readTab(sheets, 'CONTACTOS', 'Telefono');
  const mensajes = await readTab(sheets, 'MENSAJES', 'ID');
  console.log(`leídas: CONTACTOS=${contactos.length}  MENSAJES=${mensajes.length}`);

  // ── conversaciones: unión de teléfonos (CONTACTOS + MENSAJES), dedup por teléfono ──
  const conv = new Map(); // telefono(digits) -> row
  for (const c of contactos) {
    const tel = digits(c.Telefono);
    if (!tel) continue; // descarta filas vacías
    conv.set(tel, {
      cuenta: CUENTA, canal: 'WA', telefono: tel,
      wa_id: clean(c.WA_ID), nombre_contacto: clean(c.Nombre), alias: clean(c.Alias),
      soporte: clean(c.SOPORTE), humano: clean(c.HUMANO), id_venta: clean(c.ID_VENTA),
      notas: clean(c.NOTAS), refuerzo1: toTs(c.REFUERZO1), refuerzo2: toTs(c.REFUERZO2),
      ultimo_mensaje_at: toTs(c.Ultima_Actualizacion),
    });
  }
  for (const m of mensajes) {
    const tel = digits(m.Telefono);
    if (!tel || conv.has(tel)) continue;
    conv.set(tel, { cuenta: CUENTA, canal: 'WA', telefono: tel, nombre_contacto: clean(m.Nombre) });
  }
  const convRows = [...conv.values()];
  console.log(`conversaciones a cargar: ${convRows.length}`);

  if (!DRY) {
    let ok = 0;
    for (const batch of chunk(convRows, 500)) {
      const { error } = await sb.from('conversaciones').upsert(batch, { onConflict: 'cuenta,telefono' });
      if (error) throw new Error(`upsert conversaciones: ${error.message}`);
      ok += batch.length;
    }
    console.log(`  ✅ conversaciones upsert: ${ok}`);
  }

  // ── mapa telefono -> conversacion_id ──
  const idByTel = new Map();
  if (!DRY) {
    let from = 0;
    for (;;) {
      const { data, error } = await sb.from('conversaciones')
        .select('conversacion_id,telefono').eq('cuenta', CUENTA).range(from, from + 999);
      if (error) throw new Error(`select conversaciones: ${error.message}`);
      for (const r of data) idByTel.set(r.telefono, r.conversacion_id);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  // ── mensajes ──
  const msgRows = [];
  let sinConv = 0;
  for (const m of mensajes) {
    const tel = digits(m.Telefono);
    const convId = idByTel.get(tel);
    if (!convId && !DRY) { sinConv++; continue; }
    const dir = String(m.Direccion || '').toUpperCase().startsWith('ENTR') ? 'IN'
      : String(m.Direccion || '').toUpperCase().startsWith('SAL') ? 'OUT' : null;
    if (!dir) continue; // sin dirección → se salta
    const id = clean(m.ID);
    msgRows.push({
      mensaje_id: id && UUID_RE.test(id) ? id : undefined, // si no es uuid, la BD genera uno
      conversacion_id: convId,
      cuenta: CUENTA, telefono: tel || null, nombre: clean(m.Nombre),
      direccion: dir, tipo: clean(m.Tipo), texto: clean(m.Contenido),
      media_url: clean(m.MediaURL), media_id: clean(m.MediaID),
      respuesta_ia: clean(m.Respuesta_IA), foto_ia: clean(m.Foto_IA),
      contexto_id: clean(m.Contexto_ID), fecha: toTs(m.Fecha) || undefined,
    });
  }
  console.log(`mensajes a cargar: ${msgRows.length}${sinConv ? `  (⚠️ ${sinConv} sin conversación, saltados)` : ''}`);

  if (!DRY) {
    let ok = 0;
    for (const batch of chunk(msgRows.filter((m) => m.conversacion_id), 500)) {
      // upsert por PK (mensaje_id) para idempotencia; los sin mensaje_id se insertan.
      const conId = batch.filter((m) => m.mensaje_id);
      const sinId = batch.filter((m) => !m.mensaje_id);
      if (conId.length) {
        const { error } = await sb.from('mensajes').upsert(conId, { onConflict: 'mensaje_id' });
        if (error) throw new Error(`upsert mensajes: ${error.message}`);
      }
      if (sinId.length) {
        const { error } = await sb.from('mensajes').insert(sinId);
        if (error) throw new Error(`insert mensajes: ${error.message}`);
      }
      ok += batch.length;
      process.stdout.write(`\r  cargando mensajes… ${ok}/${msgRows.length}`);
    }
    console.log(`\n  ✅ mensajes: ${ok}`);
  }

  console.log('─'.repeat(60));
  console.log(DRY ? '✅ DRY-RUN completo (no se escribió).' : '✅ Backfill completo.');
}

main().catch((e) => { console.error('\n💥', e.message); process.exit(1); });
