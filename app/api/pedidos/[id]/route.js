export const dynamic = 'force-dynamic'
import { readSheet, updateRow, appendRow, fechaAhora, findRow } from '@/lib/sheets'
import { logCambio, calcularDiasEntrega, subestadoInicial, generateItemId } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    const pedidos = await readSheet('PEDIDOS')
    const idx = pedidos.findIndex(p => p.PEDIDO_ID === id)
    if (idx === -1) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const pedido = pedidos[idx]
    const now = fechaAhora()
    const changes = []

    // Build updated pedido
    const updated = { ...pedido }

    if (body.ESTADO_PEDIDO && body.ESTADO_PEDIDO !== pedido.ESTADO_PEDIDO) {
      changes.push({ campo: 'ESTADO_PEDIDO', antes: pedido.ESTADO_PEDIDO, despues: body.ESTADO_PEDIDO })
      updated.ESTADO_PEDIDO = body.ESTADO_PEDIDO
    }

    if (body.DIRECCION_TEXTO !== undefined && body.DIRECCION_TEXTO !== pedido.DIRECCION_TEXTO) {
      changes.push({ campo: 'DIRECCION_TEXTO', antes: pedido.DIRECCION_TEXTO, despues: body.DIRECCION_TEXTO })
      updated.DIRECCION_TEXTO = body.DIRECCION_TEXTO
      updated.LATITUD = body.LATITUD || pedido.LATITUD
      updated.LONGITUD = body.LONGITUD || pedido.LONGITUD
    }

    if (body.FECHA_ENTREGA_PROMETIDA && body.FECHA_ENTREGA_PROMETIDA !== pedido.FECHA_ENTREGA_PROMETIDA) {
      changes.push({ campo: 'FECHA_ENTREGA', antes: pedido.FECHA_ENTREGA_PROMETIDA, despues: body.FECHA_ENTREGA_PROMETIDA })
      updated.FECHA_ENTREGA_PROMETIDA = body.FECHA_ENTREGA_PROMETIDA
    }

    if (body.NOTAS_VENDEDOR !== undefined) {
      updated.NOTAS_VENDEDOR = body.NOTAS_VENDEDOR
    }

    // Recalculate totals if passed
    if (body.MONTO_TOTAL !== undefined) {
      updated.MONTO_TOTAL = String(body.MONTO_TOTAL)
      updated.MONTO_ABONADO = String(body.MONTO_ABONADO || pedido.MONTO_ABONADO)
      updated.MONTO_PENDIENTE = String(body.MONTO_PENDIENTE || 0)
      updated.ESTADO_PAGO = body.ESTADO_PAGO || pedido.ESTADO_PAGO
    }

    updated.FECHA_ACTUALIZACION = now

    await updateRow('PEDIDOS', idx, [
      updated.PEDIDO_ID, updated.TIENDA_ID, updated.VENDEDOR_ID, updated.CLIENTE_ID,
      updated.FECHA_PEDIDO, updated.FECHA_ACTUALIZACION, updated.FECHA_ENTREGA_PROMETIDA || '',
      updated.DIAS_CALCULADO || '', updated.DIAS_PROMETIDO || '', updated.ALERTA_ENTREGA || '',
      updated.ESTADO_PEDIDO,
      updated.ESTADO_PAGO,
      updated.MONTO_TOTAL, updated.MONTO_ABONADO, updated.MONTO_PENDIENTE,
      updated.EMITIR_FACTURA || '', updated.NUMERO_FACTURA || '',
      updated.NOTAS_VENDEDOR || '', updated.GUIA_NUMERO || '', updated.GUIA_TRANSPORTISTA || '',
      updated.DIRECCION_TEXTO || '', updated.LATITUD || '', updated.LONGITUD || '',
    ])

    // Log all changes
    for (const c of changes) {
      await logCambio(id, c.campo, c.antes, c.despues, usuarioId)
    }

    // Add new item if passed
    if (body.nuevoItem) {
      const detalles = await readSheet('DETALLE_PEDIDO')
      const itemsExistentes = detalles.filter(d => d.PEDIDO_ID === id).length
      const itemId = await generateItemId(id, itemsExistentes + 1)
      const item = body.nuevoItem
      const cloudFolder = `mandarina-pro/pedidos/${id}`
      const initSubestado = subestadoInicial(item.area)

      let fotoPecho = item.fotoPecho || ''
      if (fotoPecho && fotoPecho.startsWith('data:')) {
        try {
          const r = await uploadToCloudinary(fotoPecho, `${itemId}_pecho.jpg`, cloudFolder)
          fotoPecho = r.url
        } catch(e) { fotoPecho = '' }
      }

      await appendRow('DETALLE_PEDIDO', [
        itemId, id, updated.TIENDA_ID,
        item.productoNombre, item.detalle || '', item.esPersonalizado ? 'TRUE' : 'FALSE',
        item.color || '', item.talla || '',
        String(item.cantidad || 1),
        String(item.precioUnit || 0),
        String((parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)),
        item.area || '', initSubestado,
        fotoPecho, '', '', '', '',
        item.shopifyVariantId || '',
        fechaAhora(), '',
      ])

      await logCambio(id, 'ITEM_AGREGADO', '', item.productoNombre, usuarioId)

      // Update fecha pedido to today (per business rule)
      await updateRow('PEDIDOS', idx, [
        updated.PEDIDO_ID, updated.TIENDA_ID, updated.VENDEDOR_ID, updated.CLIENTE_ID,
        fechaAhora(), fechaAhora(), updated.FECHA_ENTREGA_PROMETIDA || '',
        updated.DIAS_CALCULADO || '', updated.DIAS_PROMETIDO || '', updated.ALERTA_ENTREGA || '',
        updated.ESTADO_PEDIDO, updated.ESTADO_PAGO,
        updated.MONTO_TOTAL, updated.MONTO_ABONADO, updated.MONTO_PENDIENTE,
        updated.EMITIR_FACTURA || '', updated.NUMERO_FACTURA || '',
        updated.NOTAS_VENDEDOR || '', updated.GUIA_NUMERO || '', updated.GUIA_TRANSPORTISTA || '',
        updated.DIRECCION_TEXTO || '', updated.LATITUD || '', updated.LONGITUD || '',
      ])
    }

    // Add payment if passed
    if (body.nuevoPago) {
      const pago = body.nuevoPago
      const montoNuevo = parseFloat(pago.monto || 0)
      if (montoNuevo > 0) {
        await appendRow('PAGOS', [
          uuid(), id, pago.tipo || 'EFECTIVO',
          String(montoNuevo.toFixed(2)),
          now, 'PAGADO', '', '', '',
          pago.fotoComprobante || '',
          usuarioId, pago.notas || '',
        ])
        await logCambio(id, 'PAGO_AGREGADO', '', `$${montoNuevo.toFixed(2)} ${pago.tipo}`, usuarioId)
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH pedido error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
