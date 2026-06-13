export const dynamic = 'force-dynamic'
import { readSheet, updateRow, fechaAhora } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'

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
    if (body.PRECIO_UNIT !== undefined) {
      updated.PRECIO_UNIT = String(body.PRECIO_UNIT)
      updated.SUBTOTAL = String((parseFloat(body.PRECIO_UNIT) * parseInt(body.CANTIDAD || updated.CANTIDAD || 1)).toFixed(2))
    }
    // Full item edit fields
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
    // Photos - handle base64 or URL
    const photoFields = ['FOTO_PECHO_URL','FOTO_ESPALDA_URL','FOTO_MANGA_D_URL','FOTO_MANGA_I_URL']
    for (const field of photoFields) {
      if (body[field] !== undefined) {
        if (body[field] === '') {
          updated[field] = ''
        } else if (body[field].startsWith('http')) {
          updated[field] = body[field]
        } else if (body[field].startsWith('data:')) {
          try {
            const { uploadToCloudinary } = await import('@/lib/cloudinary')
            const name = `${id}_${field.toLowerCase().replace('_url','')}.jpg`
            const r = await uploadToCloudinary(body[field], name, `mandarina-pro/pedidos`)
            updated[field] = r.url
          } catch(e) { console.error('Photo upload error:', e.message) }
        }
      }
    }

    await updateRow('DETALLE_PEDIDO', idx, [
      updated.ITEM_ID, updated.PEDIDO_ID, updated.TIENDA_ID,
      updated.PRODUCTO_NOMBRE, updated.DETALLE_PERSONALIZADO || '', updated.ES_PERSONALIZADO || '',
      updated.COLOR || '', updated.TALLA || '',
      updated.CANTIDAD, updated.PRECIO_UNIT, updated.SUBTOTAL,
      updated.AREA, updated.SUBESTADO,
      updated.FOTO_PECHO_URL || '', updated.FOTO_ESPALDA_URL || '',
      updated.FOTO_MANGA_D_URL || '', updated.FOTO_MANGA_I_URL || '',
      updated.ARCHIVO_DISENO_URL || '',
      updated.SHOPIFY_VARIANT_ID || '',
      updated.FECHA_ITEM || fechaAhora(),
      updated.NOTAS_AREA || '',
    ])

    if (body.SUBESTADO) {
      await logCambio(updated.PEDIDO_ID, `ITEM_${id}_SUBESTADO`, item.SUBESTADO, body.SUBESTADO, usuarioId)
    }

    return Response.json({ ok: true })
  } catch (e) {
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
    // Mark as ELIMINADO, not hard delete
    await updateRow('DETALLE_PEDIDO', idx, [
      item.ITEM_ID, item.PEDIDO_ID, item.TIENDA_ID,
      item.PRODUCTO_NOMBRE, item.DETALLE_PERSONALIZADO || '', item.ES_PERSONALIZADO || '',
      item.COLOR || '', item.TALLA || '',
      item.CANTIDAD, item.PRECIO_UNIT, item.SUBTOTAL,
      item.AREA, 'ELIMINADO',
      item.FOTO_PECHO_URL || '', item.FOTO_ESPALDA_URL || '',
      item.FOTO_MANGA_D_URL || '', item.FOTO_MANGA_I_URL || '',
      item.ARCHIVO_DISENO_URL || '',
      item.SHOPIFY_VARIANT_ID || '',
      item.FECHA_ITEM || fechaAhora(),
      item.NOTAS_AREA || '',
    ])

    await logCambio(item.PEDIDO_ID, 'ITEM_ELIMINADO', item.PRODUCTO_NOMBRE, 'ELIMINADO', usuarioId)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
