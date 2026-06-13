export const dynamic = 'force-dynamic'
import { readSheet, updateRow, appendRow, fechaAhora } from '@/lib/sheets'
import { logCambio, subestadoInicial, generateItemId } from '@/lib/pedidos'
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
    const updated = { ...pedido }

    if (body.ESTADO_PEDIDO && body.ESTADO_PEDIDO !== pedido.ESTADO_PEDIDO) {
      changes.push({ campo: 'ESTADO_PEDIDO', antes: pedido.ESTADO_PEDIDO, despues: body.ESTADO_PEDIDO })
      updated.ESTADO_PEDIDO = body.ESTADO_PEDIDO
    }

    if (body.DIRECCION_TEXTO !== undefined) {
      if (body.DIRECCION_TEXTO !== pedido.DIRECCION_TEXTO && body.DIRECCION_TEXTO !== pedido.DIRECCION_PEDIDO) {
        changes.push({ campo: 'DIRECCION', antes: pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO, despues: body.DIRECCION_TEXTO })
      }
      updated.DIRECCION_TEXTO = body.DIRECCION_TEXTO
      updated.DIRECCION_PEDIDO = body.DIRECCION_TEXTO // support both field names
    }

    if (body.FECHA_ENTREGA_PROMETIDA) {
      changes.push({ campo: 'FECHA_ENTREGA', antes: pedido.FECHA_ENTREGA_PROMETIDA, despues: body.FECHA_ENTREGA_PROMETIDA })
      updated.FECHA_ENTREGA_PROMETIDA = body.FECHA_ENTREGA_PROMETIDA
    }

    if (body.NOTAS_VENDEDOR !== undefined) updated.NOTAS_VENDEDOR = body.NOTAS_VENDEDOR
    if (body.GUIA_NUMERO) {
      updated.GUIA_NUMERO = body.GUIA_NUMERO
      changes.push({ campo: 'GUIA', antes: pedido.GUIA_NUMERO || '', despues: body.GUIA_NUMERO })
    }
    if (body.GUIA_TRANSPORTISTA) updated.GUIA_TRANSPORTISTA = body.GUIA_TRANSPORTISTA
    if (body.MONTO_TOTAL !== undefined) {
      updated.MONTO_TOTAL = String(body.MONTO_TOTAL)
      updated.MONTO_ABONADO = String(body.MONTO_ABONADO || pedido.MONTO_ABONADO)
      updated.MONTO_PENDIENTE = String(body.MONTO_PENDIENTE || 0)
      updated.ESTADO_PAGO = body.ESTADO_PAGO || pedido.ESTADO_PAGO
    }

    updated.FECHA_ACTUALIZACION = now

    // Read the actual sheet headers to map columns correctly
    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'PEDIDOS!A2:Z2',
    })
    const headers = headerRes.data.values?.[0] || []

    // Build row in correct column order
    const fieldMap = {
      'PEDIDO_ID': updated.PEDIDO_ID,
      'TIENDA_ID': updated.TIENDA_ID,
      'VENDEDOR_ID': updated.VENDEDOR_ID,
      'CLIENTE_ID': updated.CLIENTE_ID,
      'FECHA_PEDIDO': updated.FECHA_PEDIDO,
      'FECHA_ACTUALIZACION': updated.FECHA_ACTUALIZACION,
      'FECHA_ENTREGA_PROMETIDA': updated.FECHA_ENTREGA_PROMETIDA || '',
      'DIAS_CALCULADO': updated.DIAS_CALCULADO || '',
      'DIAS_PROMETIDO': updated.DIAS_PROMETIDO || '',
      'ALERTA_ENTREGA': updated.ALERTA_ENTREGA || '',
      'ESTADO_PEDIDO': updated.ESTADO_PEDIDO,
      'ESTADO_PAGO': updated.ESTADO_PAGO,
      'MONTO_TOTAL': updated.MONTO_TOTAL,
      'MONTO_ABONADO': updated.MONTO_ABONADO,
      'MONTO_PENDIENTE': updated.MONTO_PENDIENTE,
      'FACTURA_SOLICITADA': updated.EMITIR_FACTURA || updated.FACTURA_SOLICITADA || '',
      'FACTURA_DATIL_ID': updated.NUMERO_FACTURA || updated.FACTURA_DATIL_ID || '',
      'NOTAS_VENDEDOR': updated.NOTAS_VENDEDOR || '',
      'GUIA_NUMERO': updated.GUIA_NUMERO || '',
      'GUIA_TRANSPORTISTA': updated.GUIA_TRANSPORTISTA || '',
      // Support both possible column names for address
      'DIRECCION_TEXTO': updated.DIRECCION_TEXTO || updated.DIRECCION_PEDIDO || '',
      'DIRECCION_PEDIDO': updated.DIRECCION_TEXTO || updated.DIRECCION_PEDIDO || '',
      'LATITUD': updated.LATITUD || '',
      'LONGITUD': updated.LONGITUD || '',
    }

    const row = headers.map(h => fieldMap[h] !== undefined ? String(fieldMap[h]) : String(updated[h] || ''))
    await updateRow('PEDIDOS', idx, row)

    for (const c of changes) {
      await logCambio(id, c.campo, c.antes, c.despues, usuarioId)
    }

    // Add new item
    if (body.nuevoItem) {
      const detalles = await readSheet('DETALLE_PEDIDO')
      const itemsExistentes = detalles.filter(d => d.PEDIDO_ID === id).length
      const itemId = await generateItemId(id, itemsExistentes + 1)
      const item = body.nuevoItem
      const cloudFolder = `mandarina-pro/pedidos/${id}`
      const initSubestado = subestadoInicial(item.area)

      let fotoPecho = item.fotoPecho || item.imagenShopify || ''
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
        String(item.cantidad || 1), String(item.precioUnit || 0),
        String((parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)),
        item.area || '', initSubestado,
        fotoPecho, '', '', '', '',
        item.shopifyVariantId || '',
        fechaAhora(), '',
      ])

      await logCambio(id, 'ITEM_AGREGADO', '', item.productoNombre, usuarioId)
    }

    // Add payment
    if (body.nuevoPago) {
      const pago = body.nuevoPago
      const montoNuevo = parseFloat(pago.monto || 0)
      if (montoNuevo > 0) {
        await appendRow('PAGOS', [
          uuid(), id, pago.tipo || 'EFECTIVO',
          String(montoNuevo.toFixed(2)), now, 'PAGADO',
          '', '', '', pago.fotoComprobante || '',
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
