export const dynamic = 'force-dynamic'
import { google } from 'googleapis'
import { shadow } from '@/lib/db/_backend'
import { listCatalogoSupabase, addCatalogo } from '@/lib/db/catalogo'

async function readProductosCatalogo() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'PRODUCTOS_CATALOGO!A:B',
  })
  const rows = res.data.values || []
  if (rows.length < 2) return []

  // Detect format: if row 0 has NOMBRE (header), data starts from row 1
  // If row 0 has data directly, use from row 0
  let dataRows = rows
  if (rows[0][0]?.toUpperCase() === 'NOMBRE') {
    dataRows = rows.slice(1) // skip header
  }

  return dataRows
    .filter(r => r[0] && r[0].trim()) // has name
    .map(r => ({
      NOMBRE: r[0].trim().toUpperCase(),
      ACTIVO: r[1] || 'TRUE',
    }))
    .filter(p => p.ACTIVO !== 'FALSE')
}

export async function GET() {
  try {
    const productos = await readProductosCatalogo()
    if (productos.length === 0) throw new Error('empty')
    await shadow('catalogo.list', productos, () => listCatalogoSupabase())
    return Response.json({ productos })
  } catch (e) {
    // Fallback defaults
    return Response.json({ productos: [
      { NOMBRE: 'CAMISETA NORMAL' },
      { NOMBRE: 'CAMISETA OVERSIZE' },
      { NOMBRE: 'CHAQUETA' },
      { NOMBRE: 'BUZO' },
      { NOMBRE: 'HOODIE' },
      { NOMBRE: 'POLO' },
      { NOMBRE: 'CAMISETA SELECCIÓN' },
      { NOMBRE: 'PLANCHA DTF' },
    ]})
  }
}

export async function POST(req) {
  try {
    const { nombre } = await req.json()
    if (!nombre?.trim()) return Response.json({ error: 'Nombre requerido' }, { status: 400 })
    // dual-write: Sheets (append [NOMBRE,'TRUE']) + Supabase (upsert por nombre).
    await addCatalogo(nombre)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
