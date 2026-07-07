export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ⚠️ ENDPOINT TEMPORAL DE CARGA INICIAL — BORRAR DESPUÉS DE USAR.
// Escribe un snapshot de 285 productos de Mandarina (jalado desde Shopify) en la hoja
// PRODUCTOS_SHOPIFY, usando la service-account de Google que ya funciona en Vercel.
// Sirve para llenar el catálogo HOY sin tener aún los tokens de Shopify.
// Una vez configurados los tokens, el sync real (/api/shopify/sync) reemplaza esto.
//
// Uso: visita  /api/shopify/seed?key=<CRON_SECRET>   (si CRON_SECRET no está seteado, abierto).

import { getSheets } from '@/lib/sheets'
import seed from '@/lib/mandarina_seed.json'

const TAB = 'PRODUCTOS_SHOPIFY'
const HEADER = ['TIENDA', 'ID', 'TITLE', 'PRICE', 'VARIANTS', 'IMAGE', 'ACTIVO']

function sheetId() {
  return process.env.PRODUCTOS_SHEET_ID || process.env.SHEET_ID
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const url = new URL(req.url)
    const auth = req.headers.get('authorization') || ''
    if (url.searchParams.get('key') !== secret && auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'no autorizado' }, { status: 401 })
    }
  }

  try {
    const rows = Array.isArray(seed) ? seed : []
    if (rows.length === 0) throw new Error('snapshot vacío')

    const spreadsheetId = sheetId()
    if (!spreadsheetId) throw new Error('Falta SHEET_ID en las env vars')

    const sheets = await getSheets()
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${TAB}!A:G` })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER, ...rows] },
    })

    // Verificación
    const check = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${TAB}!A:A` })
    const written = (check.data.values?.length || 0) - 1

    return Response.json({ ok: true, escritas: written, tienda: 'MANDARINA', nota: 'Snapshot cargado. Borra este endpoint cuando el sync real esté activo.' })
  } catch (e) {
    console.error('seed error:', e.message)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
