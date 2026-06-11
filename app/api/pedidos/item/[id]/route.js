import { readSheet, updateRow } from '@/lib/sheets'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()

    const items = await readSheet('DETALLE_PEDIDO')
    const idx = items.findIndex(i => i.ITEM_ID === id)
    if (idx === -1) return Response.json({ error: 'Item no encontrado' }, { status: 404 })

    const item = { ...items[idx], ...body, FECHA_MODIFICACION: new Date().toISOString() }

    await updateRow('DETALLE_PEDIDO', idx, [
      item.ITEM_ID, item.PEDIDO_ID, item.TIENDA_ID,
      item.PRODUCTO_NOMBRE, item.DETALLE_PERSONALIZADO, item.ES_PERSONALIZADO,
      item.COLOR, item.TALLA, item.CANTIDAD, item.PRECIO_UNIT, item.SUBTOTAL,
      item.AREA, item.SUBESTADO,
      item.FOTO_PECHO_URL, item.FOTO_ESPALDA_URL, item.FOTO_MANGA_D_URL, item.FOTO_MANGA_I_URL,
      item.ARCHIVO_DISENO_URL, item.SHOPIFY_VARIANT_ID, item.FECHA_MODIFICACION,
    ])

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
