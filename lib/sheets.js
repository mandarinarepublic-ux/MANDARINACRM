import { google } from 'googleapis'

const SHEET_ID = process.env.SHEET_ID

// ─── Blindaje de celdas ───────────────────────────────────────────────────────
// Google Sheets permite MÁX 50.000 caracteres por celda. Una imagen/archivo en
// base64 los supera y hace fallar TODO el pedido. safeCell garantiza que eso
// nunca pase.
const MAX_CELL = 49000
function safeCell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.length > MAX_CELL) {
    if (s.startsWith('data:')) {
      console.warn(`safeCell: base64 descartado (${s.length} chars) — debía subirse a Cloudinary`)
      return ''
    }
    console.warn(`safeCell: texto truncado de ${s.length} a ${MAX_CELL} chars`)
    return s.slice(0, MAX_CELL)
  }
  return s
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  })
}

// Cliente memoizado: en serverless las invocaciones "calientes" reutilizan este
// módulo, así evitamos reconstruir GoogleAuth+JWT en cada appendRow/updateRow/etc.
// GoogleAuth refresca el token internamente, así que cachear el cliente es seguro.
let _sheetsClient = null
export async function getSheets() {
  if (_sheetsClient) return _sheetsClient
  _sheetsClient = google.sheets({ version: 'v4', auth: getAuth() })
  return _sheetsClient
}

// Formato: 14Jun2026 20:53:00 — siempre en hora Ecuador (UTC-5)
export function formatFecha(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return ''
  const ec = new Date(d.getTime() - 5 * 60 * 60 * 1000)
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const day  = String(ec.getUTCDate()).padStart(2, '0')
  const mon  = months[ec.getUTCMonth()]
  const year = ec.getUTCFullYear()
  const hh   = String(ec.getUTCHours()).padStart(2, '0')
  const mm   = String(ec.getUTCMinutes()).padStart(2, '0')
  const ss   = String(ec.getUTCSeconds()).padStart(2, '0')
  return `${day}${mon}${year} ${hh}:${mm}:${ss}`
}

export function fechaAhora() {
  return formatFecha(new Date())
}

// NOTA: rango ampliado de A:Z a A:AZ (52 columnas) — A:Z se estaba quedando
// sin espacio para nuevas columnas (PEDIDOS ya usaba ~24 de las 26 disponibles).
// Si en el futuro se necesitan aún más columnas, ampliar aquí.
export async function readSheet(sheetName) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:AZ`,
  })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  const headers = rows[1]
  return rows.slice(3).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : '' })
    return obj
  })
}

export async function appendRow(sheetName, values) {
  const sheets = await getSheets()
  const stringValues = values.map(safeCell) // ✅ blindaje
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'RAW',
    requestBody: { values: [stringValues] },
  })
}

export async function updateRow(sheetName, rowIndex, values) {
  const sheets = await getSheets()
  const sheetRow = rowIndex + 4
  const stringValues = values.map(safeCell) // ✅ blindaje
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [stringValues] },
  })
}

export async function findRow(sheetName, field, value) {
  const rows = await readSheet(sheetName)
  const idx = rows.findIndex(r => r[field] === value)
  return { row: rows[idx] || null, index: idx }
}

export async function updateCell(sheetName, rowIndex, colLetter, value) {
  const sheets = await getSheets()
  const sheetRow = rowIndex + 4
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${colLetter}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[safeCell(value)]] }, // ✅ blindaje
  })
}
