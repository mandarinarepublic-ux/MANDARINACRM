export const dynamic = 'force-dynamic'
import { readSheet, getSheets, fechaAhora, updateCell } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'

// Columnas de DETALLE_PEDIDO (fila 2 del sheet = headers)
// Las usamos para saber en qué letra está NOTAS_AREA
async function getDetallePedidoHeaders() {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `DETALLE_PEDIDO!A2:Z2`,
  })
  return res.data.values?.[0] || []
}

// Actualiza toda la fila del ítem en el sheet
async function updateItemRow(idx, updated) {
  const sheets = await getSheets()
  const headersRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: `DETALLE_PEDIDO!A2:Z2`,
  })
  const headers = headersRes.data.values?.[0] || []

  const fieldMap = {
    'ITEM_ID':               updated.ITEM_ID || '',
    'PEDIDO_ID':             updated.PEDIDO_ID || '',
    'TIENDA_ID':             updated.TIENDA_ID || '',
    'PRODUCTO_NOMBRE':       updated.PRODUCTO_NOMBRE || '',
    'DETALLE_PERSONALIZADO': updated.DETALLE_PERSONALIZADO || '',
    'ES_PERSONALIZADO':      updated.ES_PERSONALIZADO || '',
    'COLOR':                 updated.COLOR || '',
    'TALLA':                 updated.TALLA || '',
    'CANTIDAD':              String(updated.CANTIDAD || ''),
    'PRECIO_UNIT':           String(updated.PRECIO_UNIT || ''),
    'SUBTOTAL':              String(updated.SUBTOTAL || ''),
    'AREA':                  updated.AREA || '',
    'SUBESTADO':             updated.SUBESTADO || '',
    'FOTO_PECHO_URL':        updated.FOTO_PECHO_URL || '',
    'FOTO_ESPALDA_URL':      updated.FOTO_ESPALDA_URL || '',
    'FOTO_MANGA_D_URL':      updated.FOTO_MANGA_D_URL || '',
    'FOTO_MANGA_I_URL':      updated.FOTO_MANGA_I_URL || '',
    'ARCHIVO_DISEÑO_URL':    updated.ARCHIVO_DISENO_URL || updated.ARCHIVO_DISEÑO_URL || '',
    'ARCHIVO_DISENO_URL':    updated.ARCHIVO_DISENO_URL || updated.ARCHIVO_DISEÑO_URL || '',
    'SHOPIFY_VARIANT_ID':    updated.SHOPIFY_VARIANT_ID || '',
    'FECHA_MODIFICACION':    fechaAhora(),
    'FECHA_ITEM':            updated.FECHA_ITEM || fechaAhora(),
    'NOTAS_AREA':            updated.NOTAS_AREA !== undefined ? String(updated.NOTAS_AREA) : '',
  }

  const row = headers.map(h => {
    const val = fieldMap[h]
    return val !== undefined ? String(val) : String(updated[h] || '')
  })

  // fila 1=título, fila 2=headers, fila 3=desc, fila 4+=datos → idx es 0-based → fila = idx+4
  const sheetRow = idx + 4
  const colEnd = String.fromCharCode(65 + headers.length - 1)

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: `DETALLE_PEDIDO!A${sheetRow}:${colEnd}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })
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
    const bodyKeys = Object.keys(body).filter(k => !k.startsWith('_'))

    // ── Solo NOTAS_AREA → escribe solo esa celda con updateCell ──────────────
    if (bodyKeys.length === 1 && bodyKeys[0] === 'NOTAS_AREA') {
      try {
        const headers = await getDetallePedidoHeaders()
        const colIdx = headers.findIndex(h => h === 'NOTAS_AREA')
        if (colIdx === -1) {
          return Response.json({ error: `NOTAS_AREA no encontrada. Headers: ${headers.join(', ')}` }, { status: 500 })
        }
        const colLetter = String.fromCharCode(65 + colIdx)
        // updateCell usa idx (0-based data index) → convierte a fila sheet internamente (idx+4)
        await updateCell('DETALLE_PEDIDO', idx, colLetter, body.NOTAS_AREA || '')
        if (body.NOTAS_AREA) {
          await logCambio(item.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId)
        }
        return Response.json({ ok: true })
      } catch (e) {
        console.error('NOTAS_AREA write error:', e.message)
        return Response.json({ error: e.message }, { status: 500 })
      }
    }

    // ── Actualización general ─────────────────────────────────────────────────
    const updated = { ...item }

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
      updated.SUBTOTAL = String((parseFloat(body.PRECIO_UNIT) * parseInt(body.CANTIDAD || updated.CANTIDAD || 1)).toFixed(2))
    }
    if (body.SUBTOTAL !== undefined) updated.SUBTOTAL = String(body.SUBTOTAL)

    // Fotos
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

    await updateItemRow(idx, updated)

    // Logs
    if (body.SUBESTADO) {
      await logCambio(updated.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO, body.SUBESTADO, usuarioId)
    }
    if (body.NOTAS_AREA !== undefined && body.NOTAS_AREA !== item.NOTAS_AREA && body.NOTAS_AREA) {
      await logCambio(updated.PEDIDO_ID, `NOTA ${updated.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId)
    }
    const cambios = []
    if (body.COLOR !== undefined && body.COLOR !== item.COLOR) cambios.push(`Color: ${item.COLOR}→${body.COLOR}`)
    if (body.TALLA !== undefined && body.TALLA !== item.TALLA) cambios.push(`Talla: ${item.TALLA}→${body.TALLA}`)
    if (body.CANTIDAD !== undefined && String(body.CANTIDAD) !== String(item.CANTIDAD)) cambios.push(`Cant: ${item.CANTIDAD}→${body.CANTIDAD}`)
    if (body.PRECIO_UNIT !== undefined && String(body.PRECIO_UNIT) !== String(item.PRECIO_UNIT)) cambios.push(`Precio: $${item.PRECIO_UNIT}→$${body.PRECIO_UNIT}`)
    if (body.AREA !== undefined && body.AREA !== item.AREA) cambios.push(`Área: ${item.AREA}→${body.AREA}`)
    if (cambios.length > 0) {
      await logCambio(updated.PEDIDO_ID, `EDICION ${updated.PRODUCTO_NOMBRE}`, '', cambios.join(' | '), usuarioId)
    }

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
