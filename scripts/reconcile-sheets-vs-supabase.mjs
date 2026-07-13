// scripts/reconcile-sheets-vs-supabase.mjs
//
// Reconciliación de PARIDAD Sheets ⇄ Supabase (Fase 4 — la puerta al cutover).
// Solo LEE de ambos lados. No escribe nada. Reutiliza EXACTAMENTE las mismas
// definiciones de tabla y transformaciones que el backfill
// (scripts/migrate-sheets-to-supabase.mjs), para que una diferencia reportada sea
// una diferencia real de datos y no un artefacto de mapeo distinto.
//
// Qué compara:
//   1. CONTEOS de filas por tabla (Sheets mapeadas vs Supabase).
//   2. CONJUNTOS de PKs: qué ids están solo en un lado.
//   3. MONTOS de pedidos: monto_total / monto_abonado / monto_pendiente por pedido.
//   4. PAGOS: suma total y suma por pedido (Sheets vs Supabase).
//
// USO:
//   node scripts/reconcile-sheets-vs-supabase.mjs               # todo
//   node scripts/reconcile-sheets-vs-supabase.mjs --only=pedidos,pagos
//   node scripts/reconcile-sheets-vs-supabase.mjs --verbose     # lista todas las diferencias
//   node scripts/reconcile-sheets-vs-supabase.mjs --limit=50    # cuántos ejemplos mostrar (default 20)
//
// ENV: las mismas del backfill (GOOGLE_*, SHEET_ID, SUPABASE_*). Se leen de .env.local.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TABLES, sb, getSheetsClient, readSheet,
} from './migrate-sheets-to-supabase.mjs';

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) || 20 : 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EPS = 0.005; // tolerancia de centavos para comparar montos
const money = (v) => Number(v ?? 0);
const near = (a, b) => Math.abs(money(a) - money(b)) <= EPS;

/** Columnas que forman la PK en Supabase (o null si la tabla no tiene PK natural). */
function pkCols(def) {
  return def.conflict ? def.conflict.split(',').map((s) => s.trim()) : null;
}
/** Clave compuesta estable de una fila (Sheets-mapeada o Supabase) dado su set de PKs. */
function keyOf(row, cols) {
  return cols.map((c) => String(row[c] ?? '')).join('|');
}

/** Trae TODAS las filas de una tabla Supabase paginando (el default corta en 1000). */
async function fetchAllSupabase(name, orderCols) {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    let q = sb.from(name).select('*').range(from, from + PAGE - 1);
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`select ${name}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function show(list, n = LIMIT) {
  const arr = VERBOSE ? list : list.slice(0, n);
  return arr.map((x) => '        - ' + x).join('\n') + (!VERBOSE && list.length > n ? `\n        … y ${list.length - n} más (usa --verbose)` : '');
}

// ─── 1+2. Conteos y conjuntos de PK por tabla ─────────────────────────────────
async function reconcileTabla(def, sheets, issues) {
  process.stdout.write(`• ${def.name.padEnd(20)} `);

  // Lado Sheets (mapeado con las MISMAS transforms del backfill).
  let mapped = [];
  try {
    const raw = await readSheet(sheets, def.sheet, def.headerKey, def.pkCol);
    for (const r of raw) mapped.push(await def.map(r));
  } catch (e) {
    console.log(`⚠️  no se pudo leer la hoja (${e.message})`);
    issues.push(`${def.name}: hoja no leída (${e.message})`);
    return null;
  }

  const cols = pkCols(def);
  const orderCols = cols || ['log_id'];
  let supa;
  try {
    supa = await fetchAllSupabase(def.name, orderCols);
  } catch (e) {
    console.log(`⚠️  no se pudo leer Supabase (${e.message})`);
    issues.push(`${def.name}: Supabase no leído (${e.message})`);
    return null;
  }

  const nS = mapped.length;
  const nP = supa.length;
  let line = `sheets ${String(nS).padStart(5)}  supabase ${String(nP).padStart(5)}`;

  if (!cols) {
    // Sin PK natural (logs_pedidos): solo conteo.
    if (nS === nP) console.log(`${line}  ✅`);
    else {
      console.log(`${line}  ⚠️  Δ ${nP - nS}`);
      issues.push(`${def.name}: conteo difiere (sheets=${nS}, supabase=${nP})`);
    }
    return { def, mapped, supa };
  }

  const setS = new Map(mapped.map((r) => [keyOf(r, cols), r]));
  const setP = new Map(supa.map((r) => [keyOf(r, cols), r]));
  const soloSheets = [...setS.keys()].filter((k) => !setP.has(k));
  const soloSupabase = [...setP.keys()].filter((k) => !setS.has(k));
  const dupS = nS - setS.size;
  const dupP = nP - setP.size;

  if (!soloSheets.length && !soloSupabase.length && !dupS && !dupP) {
    console.log(`${line}  ✅ PKs coinciden`);
  } else {
    console.log(`${line}  ❌ soloSheets=${soloSheets.length} soloSupabase=${soloSupabase.length}` +
      (dupS || dupP ? ` dupSheets=${dupS} dupSupabase=${dupP}` : ''));
    if (soloSheets.length) { issues.push(`${def.name}: ${soloSheets.length} PK solo en Sheets`); console.log(show(soloSheets)); }
    if (soloSupabase.length) { issues.push(`${def.name}: ${soloSupabase.length} PK solo en Supabase`); console.log(show(soloSupabase)); }
    if (dupS) issues.push(`${def.name}: ${dupS} PK duplicadas en Sheets`);
    if (dupP) issues.push(`${def.name}: ${dupP} PK duplicadas en Supabase`);
  }
  return { def, mapped, supa };
}

// ─── 3. Montos de pedidos ─────────────────────────────────────────────────────
function reconcilePedidosMontos(pedidosSheets, pedidosSupa, issues) {
  console.log('\n── Montos de pedidos (monto_total / abonado / pendiente) ──');
  const supById = new Map(pedidosSupa.map((p) => [p.pedido_id, p]));
  const diffs = [];
  let sumTS = 0, sumTP = 0, sumAS = 0, sumAP = 0;
  for (const s of pedidosSheets) {
    const p = supById.get(s.pedido_id);
    sumTS += money(s.monto_total); sumAS += money(s.monto_abonado);
    if (!p) continue; // ya reportado en el diff de PKs
    sumTP += money(p.monto_total); sumAP += money(p.monto_abonado);
    const bad = [];
    if (!near(s.monto_total, p.monto_total)) bad.push(`total ${money(s.monto_total)}≠${money(p.monto_total)}`);
    if (!near(s.monto_abonado, p.monto_abonado)) bad.push(`abonado ${money(s.monto_abonado)}≠${money(p.monto_abonado)}`);
    if (!near(s.monto_pendiente, p.monto_pendiente)) bad.push(`pendiente ${money(s.monto_pendiente)}≠${money(p.monto_pendiente)}`);
    if (bad.length) diffs.push(`${s.pedido_id}: ${bad.join(', ')}`);
  }
  console.log(`  Σ monto_total   sheets=${sumTS.toFixed(2)}  supabase=${sumTP.toFixed(2)}  ${near(sumTS, sumTP) ? '✅' : '❌ Δ ' + (sumTP - sumTS).toFixed(2)}`);
  console.log(`  Σ monto_abonado sheets=${sumAS.toFixed(2)}  supabase=${sumAP.toFixed(2)}  ${near(sumAS, sumAP) ? '✅' : '❌ Δ ' + (sumAP - sumAS).toFixed(2)}`);
  if (diffs.length) {
    console.log(`  ❌ ${diffs.length} pedidos con montos distintos:`);
    console.log(show(diffs));
    issues.push(`pedidos: ${diffs.length} con montos distintos entre Sheets y Supabase`);
  } else {
    console.log('  ✅ montos por pedido coinciden');
  }
  if (!near(sumTS, sumTP)) issues.push('pedidos: Σ monto_total difiere');
  if (!near(sumAS, sumAP)) issues.push('pedidos: Σ monto_abonado difiere');
}

// ─── 4. Pagos: suma total y por pedido ────────────────────────────────────────
function reconcilePagos(pagosSheets, pagosSupa, issues) {
  console.log('\n── Pagos (suma total y por pedido) ──');
  const sumBy = (rows, id, val) => {
    const m = new Map();
    for (const r of rows) m.set(r[id], (m.get(r[id]) || 0) + money(r[val]));
    return m;
  };
  const totS = pagosSheets.reduce((a, r) => a + money(r.monto), 0);
  const totP = pagosSupa.reduce((a, r) => a + money(r.monto), 0);
  console.log(`  Σ pagos.monto   sheets=${totS.toFixed(2)}  supabase=${totP.toFixed(2)}  ${near(totS, totP) ? '✅' : '❌ Δ ' + (totP - totS).toFixed(2)}`);
  if (!near(totS, totP)) issues.push('pagos: Σ monto total difiere');

  const bS = sumBy(pagosSheets, 'pedido_id', 'monto');
  const bP = sumBy(pagosSupa, 'pedido_id', 'monto');
  const ids = new Set([...bS.keys(), ...bP.keys()]);
  const diffs = [];
  for (const id of ids) {
    if (!near(bS.get(id) || 0, bP.get(id) || 0)) {
      diffs.push(`${id}: sheets=${(bS.get(id) || 0).toFixed(2)} supabase=${(bP.get(id) || 0).toFixed(2)}`);
    }
  }
  if (diffs.length) {
    console.log(`  ❌ ${diffs.length} pedidos con suma de pagos distinta:`);
    console.log(show(diffs));
    issues.push(`pagos: ${diffs.length} pedidos con suma distinta`);
  } else {
    console.log('  ✅ suma de pagos por pedido coincide');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const sheets = getSheetsClient();
  const targets = TABLES.filter((t) => !ONLY || ONLY.includes(t.name) || ONLY.includes(t.sheet));

  console.log('\n🍊 Reconciliación Sheets ⇄ Supabase (Fase 4)  [solo lectura]');
  console.log('─'.repeat(64));

  const issues = [];
  const cache = {};
  for (const def of targets) {
    const res = await reconcileTabla(def, sheets, issues);
    if (res) cache[def.name] = res;
  }

  // Chequeos financieros (si las tablas involucradas están en el alcance).
  if (cache.pedidos) {
    reconcilePedidosMontos(cache.pedidos.mapped, cache.pedidos.supa, issues);
  }
  if (cache.pagos) {
    reconcilePagos(cache.pagos.mapped, cache.pagos.supa, issues);
  }

  console.log('\n' + '─'.repeat(64));
  if (!issues.length) {
    console.log('✅ PARIDAD TOTAL — Sheets y Supabase coinciden en todo lo evaluado.');
    process.exit(0);
  } else {
    console.log(`⚠️  ${issues.length} discrepancia(s):`);
    issues.forEach((i) => console.log('   • ' + i));
    console.log('\nSugerencia: re-corré el backfill para el histórico y verificá que el');
    console.log('dual-write esté activo para lo nuevo. Diferencias residuales suelen ser');
    console.log('filas creadas entre el backfill y la activación del dual-write.');
    process.exit(1);
  }
}

const _isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (_isMain) {
  main().catch((e) => { console.error('\n💥 Falla general:', e); process.exit(1); });
}
