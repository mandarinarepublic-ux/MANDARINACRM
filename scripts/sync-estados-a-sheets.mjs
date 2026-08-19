// scripts/sync-estados-a-sheets.mjs
//
// Empuja a Google Sheets los cambios que se hicieron DIRECTO en Supabase.
//
// POR QUÉ EXISTE: el dual-write solo lo hace la app. Cuando se corrige la base
// por SQL (una regularización masiva, un arreglo de datos), el espejo de Sheets
// se queda con los valores viejos y NADIE se entera: no hay error, no hay aviso,
// las dos fuentes simplemente dejan de decir lo mismo.
//
// ⚠️ NO CONFUNDIR CON migrate-sheets-to-supabase.mjs. Ese va al REVÉS
//    (Sheets → Supabase) y correrlo después de un arreglo por SQL PISA la
//    corrección con los datos viejos de la hoja. Este script va Supabase → Sheets.
//
// QUÉ SINCRONIZA: solo las filas listadas en las tablas de respaldo que dejó cada
// regularización. No toca nada más de la hoja. El valor que escribe es el que
// tiene Supabase AHORA (no el que se supone que debería tener), así que si algo
// cambió después del arreglo, se sincroniza el valor real.
//
// USO:
//   node scripts/sync-estados-a-sheets.mjs                  # DRY-RUN: dice qué cambiaría
//   node scripts/sync-estados-a-sheets.mjs --escribir       # escribe de verdad
//   node scripts/sync-estados-a-sheets.mjs --solo=pedidos   # pedidos | prendas
//
// ENV (en .env.local): GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID,
//                      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── .env.local ───────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined && valor !== '') process.env[m[1]] = valor;
  }
}

const ESCRIBIR = process.argv.includes('--escribir');
const soloArg = process.argv.find((a) => a.startsWith('--solo='));
const SOLO = soloArg ? soloArg.split('=')[1].split(',').map((s) => s.trim()) : null;
const hace = (que) => !SOLO || SOLO.includes(que);

// El BOM invisible que PowerShell le mete a las variables rompe la firma en silencio.
const limpio = (v) => String(v || '').replace(/^﻿/, '').trim();

const FALTAN = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'SHEET_ID',
                'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !limpio(process.env[k]));
if (FALTAN.length) {
  console.error(`\n✕ Faltan variables en .env.local: ${FALTAN.join(', ')}`);
  console.error('  Ojo: `vercel env pull` las trae VACÍAS. Hay que copiarlas a mano desde Vercel.\n');
  process.exit(1);
}

const SHEET_ID = limpio(process.env.SHEET_ID);

const sheetsApi = google.sheets({
  version: 'v4',
  auth: new google.auth.GoogleAuth({
    credentials: {
      client_email: limpio(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }),
});

const sb = createClient(limpio(process.env.SUPABASE_URL), limpio(process.env.SUPABASE_SERVICE_ROLE_KEY), {
  db: { schema: 'crm' },
  auth: { persistSession: false, autoRefreshToken: false },
  // Next parchea el fetch global y congela las GET de PostgREST. Acá no corre Next,
  // pero se deja explícito por si este script se importa desde la app algún día.
  global: { fetch: (i, init) => fetch(i, { ...init, cache: 'no-store' }) },
});

// ─── Lectura de Sheets (MISMO layout que lib/sheets.js) ───────────────────────
// header en la fila 2 (índice 1) · datos desde la fila 4 (índice 3)
// => el índice `i` del array de datos vive en la fila real `i + 4`.
async function leerHoja(nombre) {
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${nombre}!A:AZ`,
  });
  const filas = res.data.values || [];
  if (filas.length < 2) throw new Error(`La hoja ${nombre} vino vacía`);
  return { headers: filas[1], datos: filas.slice(3) };
}

/** idx 0-based → letra de columna (A..Z, AA..AZ). Igual que lib/db/detalle.js. */
function letra(idx) {
  let s = '', n = idx;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** Crea la columna al final de la fila 2 si no existe (como writeCellByHeader). */
async function columnaDe(nombreHoja, headers, header) {
  let idx = headers.indexOf(header);
  if (idx !== -1) return { idx, creada: false };
  idx = headers.length;
  if (ESCRIBIR) {
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${nombreHoja}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...headers, header]] },
    });
  }
  return { idx, creada: true };
}

/** Trae TODAS las filas paginando: el default de PostgREST corta en 1000 SIN avisar. */
async function todasLasFilas(tabla, columnas, ordenPor) {
  const PAGINA = 1000;
  const out = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await sb.from(tabla).select(columnas)
      .order(ordenPor, { ascending: true }).range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

/** Manda los cambios en lotes (un batchUpdate por cada 200 celdas). */
async function escribirCeldas(celdas) {
  const LOTE = 200;
  for (let i = 0; i < celdas.length; i += LOTE) {
    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: celdas.slice(i, i + LOTE) },
    });
    process.stdout.write(`    escritas ${Math.min(i + LOTE, celdas.length)}/${celdas.length}\r`);
  }
  process.stdout.write('\n');
}

/**
 * Sincroniza una columna de una hoja para un conjunto acotado de filas.
 * @param cfg.respaldo  tabla crm.* que lista QUÉ filas se tocaron
 * @param cfg.claveResp columna de esa tabla con la clave
 * @param cfg.tabla     tabla real de Supabase de donde sale el valor de VERDAD
 * @param cfg.clave     columna clave en Supabase y header de la clave en la hoja
 * @param cfg.campo     columna de Supabase a sincronizar
 * @param cfg.header    header de esa columna en la hoja
 */
async function sincronizar(cfg) {
  console.log(`\n▸ ${cfg.hoja}.${cfg.header}`);

  const respaldo = await todasLasFilas(cfg.respaldo, cfg.claveResp, cfg.claveResp);
  const claves = new Set(respaldo.map((r) => r[cfg.claveResp]));
  console.log(`  ${claves.size} fila(s) marcadas en ${cfg.respaldo}`);
  if (claves.size === 0) return;

  // El valor de VERDAD es el que Supabase tiene AHORA, no el que se supone.
  const actuales = new Map(
    (await todasLasFilas(cfg.tabla, `${cfg.clave},${cfg.campo}`, cfg.clave))
      .filter((f) => claves.has(f[cfg.clave]))
      .map((f) => [f[cfg.clave], f[cfg.campo] ?? '']),
  );

  const { headers, datos } = await leerHoja(cfg.hoja);
  const colClave = headers.indexOf(cfg.headerClave);
  if (colClave === -1) throw new Error(`La hoja ${cfg.hoja} no tiene la columna ${cfg.headerClave}`);
  const { idx: colCampo, creada } = await columnaDe(cfg.hoja, headers, cfg.header);
  if (creada) console.log(`  ⚠️ la columna ${cfg.header} no existía; se ${ESCRIBIR ? 'creó' : 'crearía'} al final`);

  const celdas = [];
  let yaIguales = 0;
  const noEncontradas = [];

  for (const [clave, valor] of actuales) {
    const i = datos.findIndex((fila) => fila[colClave] === clave);
    if (i === -1) { noEncontradas.push(clave); continue; }
    const enHoja = datos[i][colCampo] ?? '';
    if (String(enHoja) === String(valor)) { yaIguales++; continue; }
    celdas.push({ range: `${cfg.hoja}!${letra(colCampo)}${i + 4}`, values: [[String(valor)]] });
  }

  console.log(`  ${celdas.length} celda(s) a corregir · ${yaIguales} ya coincidían` +
              (noEncontradas.length ? ` · ⚠️ ${noEncontradas.length} sin fila en la hoja` : ''));
  if (noEncontradas.length) console.log(`     ${noEncontradas.slice(0, 5).join(', ')}${noEncontradas.length > 5 ? ' …' : ''}`);
  if (celdas.length && !ESCRIBIR) {
    console.log('  ejemplos:');
    for (const c of celdas.slice(0, 3)) console.log(`     ${c.range} ← "${c.values[0][0]}"`);
  }
  if (celdas.length && ESCRIBIR) await escribirCeldas(celdas);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log(ESCRIBIR ? '\n⚡ MODO ESCRITURA — se va a modificar la hoja\n'
                     : '\n🔍 DRY-RUN — no se escribe nada (usa --escribir para aplicar)\n');
console.log(`Hoja: ${SHEET_ID}`);

if (hace('pedidos')) {
  await sincronizar({
    hoja: 'PEDIDOS',
    respaldo: 'respaldo_cierre_20260818', claveResp: 'pedido_id',
    tabla: 'pedidos', clave: 'pedido_id', headerClave: 'PEDIDO_ID',
    campo: 'estado_pedido', header: 'ESTADO_PEDIDO',
  });
}

if (hace('prendas')) {
  await sincronizar({
    hoja: 'DETALLE_PEDIDO',
    respaldo: 'respaldo_corte_20260818', claveResp: 'item_id',
    tabla: 'detalle_pedido', clave: 'item_id', headerClave: 'ITEM_ID',
    campo: 'subestado_corte', header: 'SUBESTADO_CORTE',
  });
}

console.log(ESCRIBIR ? '\n✓ Listo. Corre `node scripts/reconcile-sheets-vs-supabase.mjs` para comprobar la paridad.\n'
                     : '\n(nada se tocó — vuelve a correrlo con --escribir)\n');
