export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getSheets } from '@/lib/sheets'
import { fetchShopifyProducts, getTiendasConfig } from '@/lib/shopify'

// Sync de productos Shopify -> Google Sheets.
//
// Escribe SIEMPRE en el tab PRODUCTOS_SHOPIFY del spreadsheet de productos.
// Por defecto usa SHEET_ID (el mismo del resto del CRM); si algún día el catálogo
// vive en otro spreadsheet, se puede sobreescribir con PRODUCTOS_SHEET_ID sin tocar código.
const TAB = 'PRODUCTOS_SHOPIFY'
const HEADER = ['TIENDA', 'ID', 'TITLE', 'PRICE', 'VARIANTS', 'IMAGE', 'ACTIVO']

function sheetId() {
  return process.env.PRODUCTOS_SHEET_ID || process.env.SHEET_ID
}

async function runSync() {
  const tiendas = getTiendasConfig()
  if (tiendas.length === 0) {
    throw new Error('No hay tiendas Shopify configuradas. Falta SHOPIFY_MANDARINA_STORE/_TOKEN y/o SHOPIFY_INDSTORE_STORE/_TOKEN en las env vars.')
  }

  const porTienda = {}
  const errores = {}
  const syncedRows = {} // { TIENDA_ID: [fila, ...] } SOLO de las tiendas que respondieron

  // Cada tienda por separado: si una falla (token vencido, etc.) el resto igual se
  // sincroniza y la que falló NO pierde su catálogo (se preserva más abajo).
  for (const t of tiendas) {
    try {
      const rows = await fetchShopifyProducts(t.id, t.store, t.clientId, t.clientSecret)
      syncedRows[t.id] = rows
      porTienda[t.id] = rows.length
    } catch (e) {
      console.error(`sync ${t.id} falló:`, e.message)
      errores[t.id] = e.message
    }
  }

  const syncedIds = Object.keys(syncedRows)

  // Si NINGUNA tienda respondió, no toques la hoja (no borres el catálogo bueno
  // por un error transitorio de red/token).
  if (syncedIds.length === 0) {
    throw new Error('Ninguna tienda devolvió productos. Detalle: ' + JSON.stringify(errores))
  }

  const sheets = await getSheets()
  const spreadsheetId = sheetId()

  // Preservar las filas de las tiendas que NO se sincronizaron esta vez (fallaron o
  // no están configuradas). Así un fallo de una sola tienda (p.ej. INDSTORE con token
  // vencido) nunca borra su catálogo: solo se reemplaza el bloque de las que sí respondieron.
  const syncedUpper = new Set(syncedIds.map(id => id.toUpperCase()))
  let preservadas = []
  try {
    const prev = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A:G` })
    const prevRows = prev.data.values || []
    const dataRows = prevRows[0]?.[0]?.toUpperCase() === 'TIENDA' ? prevRows.slice(1) : prevRows
    preservadas = dataRows.filter(r => r[0] && !syncedUpper.has(String(r[0]).toUpperCase()))
  } catch (e) {
    console.warn('No se pudo leer la hoja previa para preservar filas:', e.message)
  }

  const preservado = {}
  for (const r of preservadas) preservado[r[0]] = (preservado[r[0]] || 0) + 1

  const freshRows = syncedIds.flatMap(id => syncedRows[id])
  const finalRows = [...freshRows, ...preservadas]

  // Reemplazo del tab: limpiar A:G y reescribir header + filas (frescas + preservadas).
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TAB}!A:G` })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER, ...finalRows] },
  })

  return { ok: true, total: finalRows.length, porTienda, preservado, errores, at: new Date().toISOString() }
}

// Autorización: el cron de Vercel envía Authorization: Bearer $CRON_SECRET.
// Si CRON_SECRET no está configurado, se permite (útil en dev). El botón manual
// del dashboard usa POST y puede pasar ?secret= o el header si quieres protegerlo.
function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret
}

export async function GET(req) {
  if (!authorized(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  try {
    return Response.json(await runSync())
  } catch (e) {
    console.error('sync error:', e.message)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// POST = botón "Actualizar ahora" del dashboard. Abierto a propósito: lo dispara el
// navegador del vendedor (herramienta interna) y la operación es idempotente + tiene
// guarda anti-borrado (si Shopify falla, no toca la hoja).
export async function POST() {
  try {
    return Response.json(await runSync())
  } catch (e) {
    console.error('sync error:', e.message)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
