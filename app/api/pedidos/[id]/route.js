import { readSheet, updateRow, findRow } from '@/lib/sheets'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()

    const pedidos = await readSheet('PEDIDOS')
    const idx = pedidos.findIndex(p => p.PEDIDO_ID === id)
    if (idx === -1) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const pedido = pedidos[idx]
    const updated = { ...pedido, ...body, FECHA_MODIFICACION: new Date().toISOString() }

    await updateRow('PEDIDOS', idx, [
      updated.PEDIDO_ID, updated.TIENDA_ID, updated.VENDEDOR_ID, updated.CLIENTE_ID,
      updated.FECHA_PEDIDO, updated.FECHA_MODIFICACION, updated.FECHA_ENTREGA_PROMETIDA,
      updated.DIAS_ENTREGA_CALCULADO, updated.DIAS_ENTREGA_PROMETIDO, updated.ALERTA_ENTREGA,
      updated.ESTADO_PEDIDO, updated.ESTADO_PAGO,
      updated.MONTO_TOTAL, updated.MONTO_ABONADO, updated.MONTO_PENDIENTE,
      updated.FACTURA_SOLICITADA, updated.FACTURA_DATIL_ID,
      updated.NOTAS_VENDEDOR, updated.PDF_URL, updated.CARPETA_DRIVE_URL,
      updated.DIRECCION_TEXTO, updated.LATITUD, updated.LONGITUD,
    ])

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH pedido error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
