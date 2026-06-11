import { google } from 'googleapis'

const SHEET_ID = process.env.SHEET_ID

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

export async function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

// Format date as 01Jun2026 23:59:00
export function formatFecha(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return ''
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const day = String(d.getDate()).padStart(2, '0')
  const mon = months[d.getMonth()]
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${day}${mon}${year} ${hh}:${mm}:${ss}`
}

export function fechaAhora() {
  return formatFecha(new Date())
}

export async function readSheet(sheetName) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`,
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
  // Convert all values to strings to preserve leading zeros
  const stringValues = values.map(v => v === null || v === undefined ? '' : String(v))
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'RAW', // RAW preserves leading zeros unlike USER_ENTERED
    requestBody: { values: [stringValues] },
  })
}

export async function updateRow(sheetName, rowIndex, values) {
  const sheets = await getSheets()
  const sheetRow = rowIndex + 4
  const stringValues = values.map(v => v === null || v === undefined ? '' : String(v))
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
    requestBody: { values: [[String(value)]] },
  })
}
