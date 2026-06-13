export const dynamic = 'force-dynamic'
import { readSheet, fechaAhora } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { google } from 'googleapis'

async function getSheetHeaders(sheetName) {
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
    range: `${sheetName}!A2:Z2`,
  })
  return { auth, sheets, headers: res.data.values?.[0] || [] }
}

async function updateItemRow(idx, updated) {
  const { auth, sheets, headers } = await getSheetHeaders('DETALLE_PEDIDO')

  const fieldMap = {
    'ITEM_ID':              updated.ITEM_ID || '',
    'PEDIDO_ID':            updated.PEDIDO_ID || '',
    'TIENDA_ID':            updated.TIENDA_ID || '',
    'PRODUCTO_NOMBRE':      updated.PRODUCTO_NOMBRE || '',
    'DETALLE_PERSONALIZADO': updated.DETALLE_PERSONALIZADO || '',
    'ES_PERSONALIZADO':     updated.ES_PERSONALIZADO || '',
    'COLOR':                updated.COLOR || '',
    'TALLA':                updated.TALLA || '',
    'CANTIDAD':             String(updated.CANTIDAD || ''),
    'PRECIO_UNIT':          String(updated.PRECIO_UNIT || ''),
    'SUBTOTAL':             String(updated.SUBTOTAL || ''),
    'AREA':                 updated.AREA || '',
    'SUBESTADO':            updated.SUBESTADO || '',
    'FOTO_PECHO_URL':       updated.FOTO_PECHO_URL || '',
    'FOTO_ESPALDA_URL':     updated.FOTO_ESPALDA_URL || '',
    'FOTO_MANGA_D_URL':     updated.FOTO_MANGA_D_URL || '',
    'FOTO_MANGA_I_URL':     updated.FOTO_MANGA_I_URL || '',
    'ARCHIVO_DISEÑO_URL':   updated.ARCHIVO_DISENO_URL || updated.ARCHIVO_DISEÑO_URL || '',
    'ARCHIVO_DISENO_URL':   updated.ARCHIVO_DISENO_URL || updated.ARCHIVO_DISEÑO_URL || '',
    'SHOPIFY_VARIANT_ID':    updated.SHOPIFY_VARIANT_ID || '',
    'FECHA_MODIFICACION':    updated.FECHA_ITEM || fechaAhora(),
    'FECHA_ITEM':            updated.FECHA_ITEM || fechaAhora(),
    'NOTAS_AREA':            updated.NOTAS_AREA !== undefined ? String(updated.NOTAS_AREA) : '',
  }

  // Build row in exact header order
  const row = headers.map(h => {
    const val = fieldMap[h]
    return val !== undefined ? String(val) : String(updated[h] || '')
  })

  // Row 1 = header (A2), row 2 = description (A3), data starts at A4
  // idx is 0-based index in data array, so sheet row = idx + 4
  const sheetRow = idx + 4
  const colEnd = String.fromCharCode(65 + headers.length - 1)

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: `DETALLE_PEDIDO!A${sheetRow}:U${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })
}

async function writeNotaArea(itemId, nota) {
  // Find and write ONLY the NOTAS_AREA cell by scanning for the item
  const { auth, sheets, headers } = await getSheetHeaders('DETALLE_PEDIDO')
  const sheetRow = await findItemSheetRow(itemId, auth, sheets)
  if (!sheetRow) throw new Error(`Item ${itemId} not found in sheet`)
  
  // Find NOTAS_AREA column index
  const colIdx = headers.findIndex(h => h === 'NOTAS_AREA')
  if (colIdx === -1) throw new Error('NOTAS_AREA column not found. Headers: ' + headers.join(', '))
  
  const colLetter = String.fromCharCode(65 + colIdx)
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: `DETALLE_PEDIDO!${colLetter}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[nota]] },
  })
  return { sheetRow, colLetter, colIdx }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    const detalles = await readSheet('DETALLE_PEDIDO')
    const idx = detalles.findIndex(d => d.ITEM_ID === id)
    if (idx === -1) return Response.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const item = detalles[idx]
    const updated = { ...item }

    if (body.SUBESTADO) updated.SUBESTADO = body.SUBESTADO
    if (body.NOTAS_AREA !== undefined) updated.NOTAS_AREA = body.NOTAS_AREA
    // If only NOTAS_AREA is being updated, use direct cell write for reliability
    if (body.NOTAS_AREA !== undefined && Object.keys(body).filter(k => !k.startsWith('_')).length === 1) {
      try {
        const result = await writeNotaArea(id, body.NOTAS_AREA)
        if (body.NOTAS_AREA) await logCambio(item.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId)
        return Response.json({ ok: true, debug: result })
      } catch(e) {
        return Response.json({ error: e.message }, { status: 500 })
      }
    }
    if (body.PRECIO_UNIT !== undefined) {
      updated.PRECIO_UNIT = String(body.PRECIO_UNIT)
      updated.SUBTOTAL = String((parseFloat(body.PRECIO_UNIT) * parseInt(body.CANTIDAD || updated.CANTIDAD || 1)).toFixed(2))
    }
    if (body.PRODUCTO_NOMBRE) updated.PRODUCTO_NOMBRE = body.PRODUCTO_NOMBRE
    if (body.COLOR !== undefined) updated.COLOR = body.COLOR
    if (body.TALLA !== undefined) updated.TALLA = body.TALLA
    if (body.CANTIDAD !== undefined) {
      updated.CANTIDAD = String(body.CANTIDAD)
      updated.SUBTOTAL = String((parseFloat(updated.PRECIO_UNIT || 0) * parseInt(body.CANTIDAD || 1)).toFixed(2))
    }
    if (body.AREA !== undefined) updated.AREA = body.AREA
    if (body.DETALLE_PERSONALIZADO !== undefined) updated.DETALLE_PERSONALIZADO = body.DETALLE_PERSONALIZADO
    if (body.SUBTOTAL !== undefined) updated.SUBTOTAL = String(body.SUBTOTAL)

    // Photos
    const photoFields = ['FOTO_PECHO_URL','FOTO_ESPALDA_URL','FOTO_MANGA_D_URL','FOTO_MANGA_I_URL']
    for (const field of photoFields) {
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

    await updateItemRow(idx, updated)

    // Logs
    if (body.SUBESTADO) await logCambio(updated.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO, body.SUBESTADO, usuarioId)
    if (body.NOTAS_AREA !== undefined && body.NOTAS_AREA !== item.NOTAS_AREA && body.NOTAS_AREA)
      await logCambio(updated.PEDIDO_ID, `NOTA ${updated.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId)
    const cambios = []
    if (body.COLOR !== undefined && body.COLOR !== item.COLOR) cambios.push(`Color: ${item.COLOR}→${body.COLOR}`)
    if (body.TALLA !== undefined && body.TALLA !== item.TALLA) cambios.push(`Talla: ${item.TALLA}→${body.TALLA}`)
    if (body.CANTIDAD !== undefined && String(body.CANTIDAD) !== String(item.CANTIDAD)) cambios.push(`Cant: ${item.CANTIDAD}→${body.CANTIDAD}`)
    if (body.PRECIO_UNIT !== undefined && String(body.PRECIO_UNIT) !== String(item.PRECIO_UNIT)) cambios.push(`Precio: $${item.PRECIO_UNIT}→$${body.PRECIO_UNIT}`)
    if (body.AREA !== undefined && body.AREA !== item.AREA) cambios.push(`Área: ${item.AREA}→${body.AREA}`)
    if (cambios.length > 0) await logCambio(updated.PEDIDO_ID, `EDICION ${updated.PRODUCTO_NOMBRE}`, '', cambios.join(' | '), usuarioId)

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
    const updated = { ...item, SUBESTADO: 'ELIMINADO' }
    await updateItemRow(idx, updated)
    await logCambio(item.PEDIDO_ID, 'ITEM_ELIMINADO', item.PRODUCTO_NOMBRE, 'ELIMINADO', usuarioId)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
