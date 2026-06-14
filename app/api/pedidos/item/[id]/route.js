export const dynamic = 'force-dynamic'
import { readSheet, getSheets, fechaAhora } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'

const SHEET_ID = process.env.SHEET_ID

// DETALLE_PEDIDO: fila1=título, fila2=headers, fila3=descrip, fila4+=datos
// idx es 0-based en array de datos → fila real en Sheet = idx + 4
function dataIdxToSheetRow(idx) { return idx + 4 }

// Escribe UNA celda en DETALLE_PEDIDO
async function writeCellDetalle(idx, colLetter, value) {
  const sheets = await getSheets()
  const sheetRow = dataIdxToSheetRow(idx)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `DETALLE_PEDIDO!${colLetter}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[String(value ?? '')]] },
  })
}

// Escribe toda la fila del ítem
async function writeRowDetalle(idx, item) {
  const sheets = await getSheets()

  // Leer headers reales de fila 2
  const hRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'DETALLE_PEDIDO!A2:Z2',
  })
  const headers = hRes.data.values?.[0] || []

  const row = headers.map(h => String(item[h] ?? ''))

  const sheetRow = dataIdxToSheetRow(idx)
  const lastCol = String.fromCharCode(65 + headers.length - 1)

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `DETALLE_PEDIDO!A${sheetRow}:${lastCol}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    // Buscar el ítem
    const detalles = await readSheet('DETALLE_PEDIDO')
    const idx = detalles.findIndex(d => d.ITEM_ID === id)
    if (idx === -1) return Response.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const item = detalles[idx]
    const bodyKeys = Object.keys(body).filter(k => !k.startsWith('_'))

    // ── CASO 1: solo NOTAS_AREA → escribe directo en columna U ───────────────
    if (bodyKeys.length === 1 && bodyKeys[0] === 'NOTAS_AREA') {
      // Columna U = índice 20 = letra U
      // Pero usamos los headers reales para estar seguros
      const sheets = await getSheets()
      const hRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'DETALLE_PEDIDO!A2:Z2',
      })
      const headers = hRes.data.values?.[0] || []
      const colIdx = headers.indexOf('NOTAS_AREA')
      const colLetter = colIdx >= 0 ? String.fromCharCode(65 + colIdx) : 'U'

      await writeCellDetalle(idx, colLetter, body.NOTAS_AREA ?? '')

      if (body.NOTAS_AREA) {
        await logCambio(item.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId).catch(() => {})
      }
      return Response.json({ ok: true, col: colLetter, row: dataIdxToSheetRow(idx) })
    }

    // ── CASO 2: SUBESTADO solo → escribe directo en la columna SUBESTADO ─────
    if (bodyKeys.length === 1 && bodyKeys[0] === 'SUBESTADO') {
      const sheets = await getSheets()
      const hRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'DETALLE_PEDIDO!A2:Z2',
      })
      const headers = hRes.data.values?.[0] || []
      const colIdx = headers.indexOf('SUBESTADO')
      const colLetter = colIdx >= 0 ? String.fromCharCode(65 + colIdx) : 'M'

      await writeCellDetalle(idx, colLetter, body.SUBESTADO)
      await logCambio(item.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO, body.SUBESTADO, usuarioId).catch(() => {})
      return Response.json({ ok: true })
    }

    // ── CASO 3: actualización general (editar-pedido) ─────────────────────────
    const updated = { ...item, FECHA_MODIFICACION: fechaAhora() }

    if (body.SUBESTADO !== undefined)             updated.SUBESTADO = body.SUBESTADO
    if (body.NOTAS_AREA !== undefined)            updated.NOTAS_AREA = body.NOTAS_AREA
    if (body.PRODUCTO_NOMBRE !== undefined)       updated.PRODUCTO_NOMBRE = body.PRODUCTO_NOMBRE
    if (body.COLOR !== undefined)                 updated.COLOR = body.COLOR
    if (body.TALLA !== undefined)                 updated.TALLA = body.TALLA
    if (body.AREA !== undefined)                  updated.AREA = body.AREA
    if (body.DETALLE_PERSONALIZADO !== undefined) updated.DETALLE_PERSONALIZADO = body.DETALLE_PERSONALIZADO
    if (body.CANTIDAD !== undefined) {
      updated.CANTIDAD = String(body.CANTIDAD)
      updated.SUBTOTAL = String((parseFloat(updated.PRECIO_UNIT || 0) * parseInt(body.CANTIDAD || 1)).toFixed(2))
    }
    if (body.PRECIO_UNIT !== undefined) {
      updated.PRECIO_UNIT = String(body.PRECIO_UNIT)
      updated.SUBTOTAL = String((parseFloat(body.PRECIO_UNIT) * parseInt(updated.CANTIDAD || 1)).toFixed(2))
    }
    if (body.SUBTOTAL !== undefined) updated.SUBTOTAL = String(body.SUBTOTAL)

    for (const field of ['FOTO_PECHO_URL','FOTO_ESPALDA_URL','FOTO_MANGA_D_URL','FOTO_MANGA_I_URL']) {
      if (body[field] !== undefined) {
        if (body[field] === '') { updated[field] = '' }
        else if (body[field].startsWith('http')) { updated[field] = body[field] }
        else if (body[field].startsWith('data:')) {
          try {
            const r = await uploadToCloudinary(body[field], `${id}_${field}.jpg`, 'mandarina-pro/pedidos')
            updated[field] = r.url
          } catch(e) { console.error('Photo upload error:', e.message) }
        }
      }
    }

    await writeRowDetalle(idx, updated)

    // Logs
    if (body.SUBESTADO) await logCambio(updated.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO, body.SUBESTADO, usuarioId).catch(() => {})
    if (body.NOTAS_AREA && body.NOTAS_AREA !== item.NOTAS_AREA) await logCambio(updated.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId).catch(() => {})

    const cambios = []
    if (body.COLOR !== undefined && body.COLOR !== item.COLOR) cambios.push(`Color: ${item.COLOR}→${body.COLOR}`)
    if (body.TALLA !== undefined && body.TALLA !== item.TALLA) cambios.push(`Talla: ${item.TALLA}→${body.TALLA}`)
    if (body.CANTIDAD !== undefined && String(body.CANTIDAD) !== String(item.CANTIDAD)) cambios.push(`Cant: ${item.CANTIDAD}→${body.CANTIDAD}`)
    if (body.PRECIO_UNIT !== undefined && String(body.PRECIO_UNIT) !== String(item.PRECIO_UNIT)) cambios.push(`Precio: $${item.PRECIO_UNIT}→$${body.PRECIO_UNIT}`)
    if (body.AREA !== undefined && body.AREA !== item.AREA) cambios.push(`Área: ${item.AREA}→${body.AREA}`)
    if (cambios.length > 0) await logCambio(updated.PEDIDO_ID, `EDICION ${item.PRODUCTO_NOMBRE}`, '', cambios.join(' | '), usuarioId).catch(() => {})

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH item error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    const detalles = await readSheet('DETALLE_PEDIDO')
    const idx = detalles.findIndex(d => d.ITEM_ID === id)
    if (idx === -1) return Response.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const item = detalles[idx]
    const updated = { ...item, SUBESTADO: 'ELIMINADO', FECHA_MODIFICACION: fechaAhora() }
    await writeRowDetalle(idx, updated)
    await logCambio(item.PEDIDO_ID, 'ITEM_ELIMINADO', item.PRODUCTO_NOMBRE, 'ELIMINADO', usuarioId).catch(() => {})
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
