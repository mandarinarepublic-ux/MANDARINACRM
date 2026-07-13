export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ⚠️ ENDPOINT TEMPORAL DE VALIDACIÓN (Fase 4) — BORRAR EN FASE 6.
// Corre la reconciliación de paridad Sheets ⇄ Supabase del lado del SERVIDOR,
// reutilizando las credenciales que ya viven en Vercel (Google + Supabase). Así
// no hay que pasar la private key a ningún lado ni correr scripts locales.
// SOLO LECTURA: compara, no escribe nada.
//
// Uso:  GET /api/admin/reconcile?key=<CRON_SECRET>
//       (si CRON_SECRET no está seteado, queda abierto — igual que shopify/sync)

import { readSheet, getSheets } from '@/lib/sheets'
import { getSupabase, supabaseConfigured } from '@/lib/supabase'

function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  return url.searchParams.get('key') === secret || auth === `Bearer ${secret}`
}

const EPS = 0.005
const money = (v) => Number(v ?? 0)
const near = (a, b) => Math.abs(money(a) - money(b)) <= EPS

// Trae TODAS las filas de una tabla Supabase paginando (el default corta en 1000).
async function supaAll(table, columns, orderCol) {
  const PAGE = 1000
  const db = getSupabase()
  let from = 0
  const out = []
  for (;;) {
    let q = db.from(table).select(columns).range(from, from + PAGE - 1)
    if (orderCol) q = q.order(orderCol, { ascending: true })
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function supaCount(table) {
  const { count, error } = await getSupabase().from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count || 0
}

// Cuenta filas de una hoja con layout NO estándar (header no en la fila 2):
// busca la fila de encabezado por `headerKey` y cuenta filas con `pkCol` no vacía.
async function countSheetRaw(sheet, headerKey, pkCol) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `${sheet}!A:AZ`,
  })
  const rows = res.data.values || []
  const h = rows.findIndex((r) => Array.isArray(r) && r.includes(headerKey))
  if (h < 0) return 0
  const headers = rows[h]
  const pkIdx = headers.indexOf(pkCol)
  return rows.slice(h + 1).filter((r) => Array.isArray(r) && String(r[pkIdx] ?? '').trim() !== '').length
}

// Tablas de layout estándar (readSheet: header fila 2, datos desde fila 4).
const CORE = [
  { key: 'pedidos',        sheet: 'PEDIDOS',        pk: 'PEDIDO_ID',  supa: 'pedidos',        spk: 'pedido_id' },
  { key: 'clientes',       sheet: 'CLIENTES',       pk: 'CLIENTE_ID', supa: 'clientes',       spk: 'cliente_id' },
  { key: 'detalle_pedido', sheet: 'DETALLE_PEDIDO', pk: 'ITEM_ID',    supa: 'detalle_pedido', spk: 'item_id' },
  { key: 'pagos',          sheet: 'PAGOS',          pk: 'PAGO_ID',    supa: 'pagos',          spk: 'pago_id' },
  { key: 'guias_despacho', sheet: 'GUIAS_DESPACHO', pk: 'GUIA_ID',    supa: 'guias_despacho', spk: 'guia_id' },
  { key: 'sucursal',       sheet: 'SUCURSAL',       pk: 'ID',         supa: 'sucursal',       spk: 'id' },
  { key: 'usuarios',       sheet: 'USUARIOS',       pk: 'USUARIO_ID', supa: 'usuarios',       spk: 'usuario_id' },
]

// Tablas de layout distinto → solo se comparan CONTEOS.
const ODD = [
  { key: 'logs_pedidos',       sheet: 'LOGS_PEDIDOS',       headerKey: 'PEDIDO_ID',        pk: 'PEDIDO_ID',        supa: 'logs_pedidos' },
  { key: 'productos_shopify',  sheet: 'PRODUCTOS_SHOPIFY',  headerKey: 'TIENDA',           pk: 'ID',               supa: 'productos_shopify' },
  { key: 'productos_catalogo', sheet: 'PRODUCTOS_CATALOGO', headerKey: 'NOMBRE',           pk: 'NOMBRE',           supa: 'productos_catalogo' },
  { key: 'dias_entrega',       sheet: 'DIAS_ENTREGA',       headerKey: 'AREA_COMBINACION', pk: 'AREA_COMBINACION', supa: 'dias_entrega' },
]

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  if (!supabaseConfigured()) return Response.json({ error: 'Supabase no configurado' }, { status: 500 })

  try {
    const tablas = []
    const issues = []
    let sheetPedidos = []

    // ── Tablas core: conteo + diff de PKs ──────────────────────────────────
    for (const t of CORE) {
      const sheetRows = await readSheet(t.sheet)
      if (t.key === 'pedidos') sheetPedidos = sheetRows
      const sheetPks = new Set(sheetRows.map((r) => String(r[t.pk] ?? '')).filter(Boolean))

      const supaRows = await supaAll(t.supa, t.spk, t.spk)
      const supaPks = new Set(supaRows.map((r) => String(r[t.spk] ?? '')).filter(Boolean))

      const soloSheets = [...sheetPks].filter((x) => !supaPks.has(x))
      const soloSupabase = [...supaPks].filter((x) => !sheetPks.has(x))
      const ok = soloSheets.length === 0 && soloSupabase.length === 0

      tablas.push({
        tabla: t.key,
        sheets: sheetPks.size,
        supabase: supaPks.size,
        soloSheets: soloSheets.length,
        soloSupabase: soloSupabase.length,
        ejemplosSoloSheets: soloSheets.slice(0, 10),
        ejemplosSoloSupabase: soloSupabase.slice(0, 10),
        ok,
      })
      if (!ok) issues.push(`${t.key}: soloSheets=${soloSheets.length}, soloSupabase=${soloSupabase.length}`)
    }

    // ── Tablas de layout distinto: solo conteo ─────────────────────────────
    for (const t of ODD) {
      const s = await countSheetRaw(t.sheet, t.headerKey, t.pk)
      const p = await supaCount(t.supa)
      const ok = s === p
      tablas.push({ tabla: t.key, sheets: s, supabase: p, ok, nota: 'solo conteo (layout distinto)' })
      if (!ok) issues.push(`${t.key}: conteo sheets=${s} supabase=${p}`)
    }

    // ── Montos de pedidos (total / abonado / pendiente clampeado) ──────────
    const supaPed = await supaAll('pedidos', 'pedido_id,monto_total,monto_abonado,monto_pendiente', 'pedido_id')
    const supaPedById = new Map(supaPed.map((p) => [p.pedido_id, p]))
    let sumTS = 0, sumTP = 0, sumAS = 0, sumAP = 0
    const montoDiffs = []
    for (const s of sheetPedidos) {
      sumTS += money(s.MONTO_TOTAL); sumAS += money(s.MONTO_ABONADO)
      const p = supaPedById.get(s.PEDIDO_ID)
      if (!p) continue
      sumTP += money(p.monto_total); sumAP += money(p.monto_abonado)
      const bad = []
      if (!near(s.MONTO_TOTAL, p.monto_total)) bad.push(`total ${money(s.MONTO_TOTAL)}≠${money(p.monto_total)}`)
      if (!near(s.MONTO_ABONADO, p.monto_abonado)) bad.push(`abonado ${money(s.MONTO_ABONADO)}≠${money(p.monto_abonado)}`)
      // pendiente clampeado (los negativos por sobrepago/envío = 0)
      if (!near(Math.max(0, money(s.MONTO_PENDIENTE)), Math.max(0, money(p.monto_pendiente)))) {
        bad.push(`pendiente ${money(s.MONTO_PENDIENTE)}≠${money(p.monto_pendiente)}`)
      }
      if (bad.length) montoDiffs.push({ pedido: s.PEDIDO_ID, difs: bad })
    }
    if (montoDiffs.length) issues.push(`pedidos: ${montoDiffs.length} con montos distintos`)
    if (!near(sumTS, sumTP)) issues.push('pedidos: Σ monto_total difiere')
    if (!near(sumAS, sumAP)) issues.push('pedidos: Σ monto_abonado difiere')

    // ── Pagos: suma total + suma por pedido ────────────────────────────────
    const sheetPagos = await readSheet('PAGOS')
    const supaPagos = await supaAll('pagos', 'pedido_id,monto', 'pago_id')
    const totS = sheetPagos.reduce((a, r) => a + money(r.MONTO), 0)
    const totP = supaPagos.reduce((a, r) => a + money(r.monto), 0)
    const sumBy = (rows, idKey, valKey) => {
      const m = new Map()
      for (const r of rows) m.set(r[idKey], (m.get(r[idKey]) || 0) + money(r[valKey]))
      return m
    }
    const bS = sumBy(sheetPagos, 'PEDIDO_ID', 'MONTO')
    const bP = sumBy(supaPagos, 'pedido_id', 'monto')
    const pagoDiffs = []
    for (const id of new Set([...bS.keys(), ...bP.keys()])) {
      if (!near(bS.get(id) || 0, bP.get(id) || 0)) {
        pagoDiffs.push({ pedido: id, sheets: (bS.get(id) || 0).toFixed(2), supabase: (bP.get(id) || 0).toFixed(2) })
      }
    }
    if (!near(totS, totP)) issues.push('pagos: Σ monto total difiere')
    if (pagoDiffs.length) issues.push(`pagos: ${pagoDiffs.length} pedidos con suma distinta`)

    return Response.json({
      at: new Date().toISOString(),
      backend: process.env.DATA_BACKEND || 'sheets',
      paridadTotal: issues.length === 0,
      resumen: issues.length ? issues : ['✅ paridad total en lo evaluado'],
      tablas,
      montosPedidos: {
        sumaTotal: { sheets: sumTS.toFixed(2), supabase: sumTP.toFixed(2), ok: near(sumTS, sumTP) },
        sumaAbonado: { sheets: sumAS.toFixed(2), supabase: sumAP.toFixed(2), ok: near(sumAS, sumAP) },
        pedidosConDiferencias: montoDiffs.length,
        ejemplos: montoDiffs.slice(0, 25),
      },
      pagos: {
        sumaTotal: { sheets: totS.toFixed(2), supabase: totP.toFixed(2), ok: near(totS, totP) },
        pedidosConSumaDistinta: pagoDiffs.length,
        ejemplos: pagoDiffs.slice(0, 25),
      },
    })
  } catch (e) {
    console.error('reconcile error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
