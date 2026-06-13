export const dynamic = 'force-dynamic'
import { google } from 'googleapis'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const pedidoId = searchParams.get('pedidoId')
    if (!pedidoId) return Response.json({ logs: [] })

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
      range: 'LOGS_PEDIDOS!A:F',
    })

    const rows = res.data.values || []
    if (rows.length < 2) return Response.json({ logs: [] })

    // Detect header row
    let dataRows = rows
    if (rows[0][0]?.toUpperCase() === 'PEDIDO_ID') {
      dataRows = rows.slice(1)
    }

    const logs = dataRows
      .filter(r => r[0] === pedidoId)
      .map(r => ({
        fecha: r[1] || '',
        usuario: r[2] || '',
        campo: r[3] || '',
        antes: r[4] || '',
        despues: r[5] || '',
      }))
      .reverse()

    return Response.json({ logs })
  } catch (e) {
    console.error('Logs error:', e.message)
    return Response.json({ logs: [], error: e.message })
  }
}
