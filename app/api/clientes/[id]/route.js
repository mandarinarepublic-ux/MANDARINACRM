import { readSheet } from '@/lib/sheets'
import { google } from 'googleapis'

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()

    const clientes = await readSheet('CLIENTES')
    const idx = clientes.findIndex(c => c.CLIENTE_ID === id)
    if (idx === -1) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const updated = { ...clientes[idx], ...body }

    const auth = await getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Read real headers
    const hRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'CLIENTES!A2:Z2',
    })
    const headers = hRes.data.values?.[0] || []

    // Find actual row by scanning CLIENTE_ID column
    const colRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'CLIENTES!A:A',
    })
    const rows = colRes.data.values || []
    let sheetRow = null
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) { sheetRow = i + 1; break }
    }
    if (!sheetRow) return Response.json({ error: 'Fila no encontrada' }, { status: 404 })

    const fieldMap = {
      'CLIENTE_ID':     updated.CLIENTE_ID || '',
      'NOMBRE':         updated.NOMBRE || '',
      'CEDULA':         String(updated.CEDULA || ''),
      'CELULAR':        String(updated.CELULAR || ''),
      'EMAIL':          updated.EMAIL || '',
      'CIUDAD':         updated.CIUDAD || '',
      'DIRECCION':      updated.DIRECCION || '',
      'FECHA_REGISTRO': updated.FECHA_REGISTRO || '',
    }

    const row = headers.map(h => fieldMap[h] !== undefined ? String(fieldMap[h]) : String(updated[h] || ''))
    const colEnd = String.fromCharCode(65 + headers.length - 1)

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `CLIENTES!A${sheetRow}:${colEnd}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH cliente error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
