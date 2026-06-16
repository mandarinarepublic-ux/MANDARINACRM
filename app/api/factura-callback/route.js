export const dynamic = 'force-dynamic'
import { getSheets } from '@/lib/sheets'

const SHEET_ID = process.env.SHEET_ID

// Make llama a este endpoint después de emitir la factura en Dátil
// Body: { pedido_id, datil_id, ride_url }
export async function POST(req) {
  try {
    const body = await req.json()
    const { pedido_id, datil_id, ride_url } = body

    if (!pedido_id) return Response.json({ ok: false, error: 'pedido_id requerido' }, { status: 400 })

    const sheets = await getSheets()

    // 1. Leer headers de PEDIDOS
    const hRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PEDIDOS!A2:Z2',
    })
    const headers = hRes.data.values?.[0] || []

    // 2. Leer filas para encontrar el pedido
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'PEDIDOS!A4:Z',
    })
    const rows = dataRes.data.values || []
    const idxPedidoId = headers.indexOf('PEDIDO_ID')

    const rowIndex = rows.findIndex(r => r[idxPedidoId] === pedido_id)
    if (rowIndex === -1) {
      return Response.json({ ok: false, error: `Pedido ${pedido_id} no encontrado` }, { status: 404 })
    }

    const sheetRow = rowIndex + 4 // fila real en Sheet (header fila 2, descrip fila 3, datos desde fila 4)

    // 3. Buscar o crear columnas FACTURA_ID y FACTURA_PDF_URL
    async function getOrCreateCol(colName) {
      let idx = headers.indexOf(colName)
      if (idx === -1) {
        idx = headers.length
        headers.push(colName)
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'PEDIDOS!A2',
          valueInputOption: 'RAW',
          requestBody: { values: [headers] },
        })
      }
      return String.fromCharCode(65 + idx)
    }

    const colFacturaId  = await getOrCreateCol('FACTURA_ID')
    const colFacturaPdf = await getOrCreateCol('FACTURA_PDF_URL')

    // 4. Escribir los valores
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `PEDIDOS!${colFacturaId}${sheetRow}`,  values: [[datil_id  || '']] },
          { range: `PEDIDOS!${colFacturaPdf}${sheetRow}`, values: [[ride_url  || '']] },
        ],
      },
    })

    console.log(`✅ Factura guardada: pedido=${pedido_id} datil_id=${datil_id}`)
    return Response.json({ ok: true, pedido_id, datil_id, ride_url })

  } catch (e) {
    console.error('factura-callback error:', e)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
