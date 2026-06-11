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

export async function readSheet(sheetName) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`,
  })
  const rows = res.data.values || []
  if (rows.length < 2) return []
  // Row 2 = headers (row 1 is title, row 3 is notes)
  const headers = rows[1]
  return rows.slice(3).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj
  })
}

export async function appendRow(sheetName, values) {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  })
}

export async function updateRow(sheetName, rowIndex, values) {
  // rowIndex is 0-based from readSheet results → actual sheet row = rowIndex + 4
  const sheets = await getSheets()
  const sheetRow = rowIndex + 4
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A${sheetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
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
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  })
}
