import { readSheet, appendRow, findRow, fechaAhora } from '@/lib/sheets'
import { generatePedidoId, generateItemId, calcularDiasEntrega } from '@/lib/pedidos'
import { uploadToCloudinary, uploadFileToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const vendedorId = searchParams.get('vendedor')
    const rol = searchParams.get('rol')

    let pedidos = await readSheet('PEDIDOS')
    let detalles = await readSheet('DETALLE_PEDIDO')
    let pagos = await readSheet('PAGOS')

    if (rol === 'VENDEDOR' && vendedorId) {
      pedidos = pedidos.filter(p => p.VENDEDOR_ID === vendedorId)
    }

    const result = pedidos.map(p => ({
      ...p,
      items: detalles.filter(d => d.PEDIDO_ID === p.PEDIDO_ID),
      pagos: pagos.filter(pg => pg.PEDIDO_ID === p.PEDIDO_ID),
    }))

    return Response.json({ pedidos: result })
  } catch (e) {
    console.error('GET pedidos error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      tiendaId, vendedorId, vendedorCodigo,
      cliente, items, pagos: pagosInput,
      emitirFactura,
      diasEntregaPrometido, fechaEntregaPrometida,
      notasVendedor, direccionTexto, latitud, longitud,
    } = body

    // 1. Generate pedido ID
    const pedidoId = await generatePedidoId(tiendaId, vendedorCodigo)

    // 2. Handle cliente
    let clienteId
    const { row: existingCliente } = await findRow('CLIENTES', 'CEDULA', String(cliente.cedula))
    if (existingCliente) {
      clienteId = existingCliente.CLIENTE_ID
    } else {
      clienteId = uuid()
      await appendRow('CLIENTES', [
        clienteId, cliente.nombre,
        String(cliente.cedula), String(cliente.celular),
        cliente.email || '', cliente.ciudad || '',
        direccionTexto || cliente.direccion || '',
        fechaAhora(),
      ])
    }

    // 3. Calculate totals
    const montoTotal = items.reduce((sum, i) => sum + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
    const pagosArray = Array.isArray(pagosInput) ? pagosInput : (body.pago ? [body.pago] : [])
    const montoAbonado = pagosArray.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0)
    const montoPendiente = montoTotal - montoAbonado

    // 4. Calculate delivery
    const areas = items.map(i => i.area || '')
    const diasCalculado = calcularDiasEntrega(areas)
    const diasPrometido = diasEntregaPrometido || diasCalculado
    const alertaEntrega = fechaEntregaPrometida
      ? new Date(fechaEntregaPrometida) < new Date(Date.now() + diasCalculado * 86400000)
      : false

    const now = fechaAhora()

    // 5. Save pedido
    await appendRow('PEDIDOS', [
      pedidoId, tiendaId, vendedorId, clienteId,
      now, now, fechaEntregaPrometida || '',
      String(diasCalculado), String(diasPrometido), alertaEntrega ? 'TRUE' : 'FALSE',
      'PENDIENTE_FABRICA',
      montoAbonado >= montoTotal ? 'PAGADO' : montoAbonado > 0 ? 'ABONO' : 'PENDIENTE',
      String(montoTotal.toFixed(2)),
      String(montoAbonado.toFixed(2)),
      String(montoPendiente.toFixed(2)),
      emitirFactura ? 'TRUE' : 'FALSE', '',
      notasVendedor || '', '', '',
      direccionTexto || cliente.direccion || '',
      latitud ? String(latitud) : '',
      longitud ? String(longitud) : '',
    ])

    // 6. Save items with Cloudinary photo upload
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemId = await generateItemId(pedidoId, i + 1)
      const cloudFolder = `mandarina-pro/pedidos/${pedidoId}`

      let fotoPecho = '', fotoEspalda = '', fotoMangaD = '', fotoMangaI = '', archivoDiseno = ''

      // Upload photos to Cloudinary
      try {
        if (item.fotoPecho) {
          const r = await uploadToCloudinary(item.fotoPecho, `${itemId}_pecho.jpg`, cloudFolder)
          fotoPecho = r.url
        }
        if (item.fotoEspalda) {
          const r = await uploadToCloudinary(item.fotoEspalda, `${itemId}_espalda.jpg`, cloudFolder)
          fotoEspalda = r.url
        }
        if (item.fotoMangaD) {
          const r = await uploadToCloudinary(item.fotoMangaD, `${itemId}_manga_d.jpg`, cloudFolder)
          fotoMangaD = r.url
        }
        if (item.fotoMangaI) {
          const r = await uploadToCloudinary(item.fotoMangaI, `${itemId}_manga_i.jpg`, cloudFolder)
          fotoMangaI = r.url
        }
        if (item.archivoDiseno) {
          const r = await uploadFileToCloudinary(item.archivoDiseno, `${itemId}_diseno`, cloudFolder)
          archivoDiseno = r.url
        }
      } catch (uploadErr) {
        console.error('Photo upload error:', uploadErr.message)
        // Don't fail the whole order if photos fail
      }

      await appendRow('DETALLE_PEDIDO', [
        itemId, pedidoId, tiendaId,
        item.productoNombre, item.detalle || '', item.esPersonalizado ? 'TRUE' : 'FALSE',
        item.color || '', item.talla || '',
        String(item.cantidad || 1),
        String(item.precioUnit || 0),
        String((parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)),
        item.area || '', 'SOLICITADO',
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        archivoDiseno,
        item.shopifyVariantId || '',
        now,
      ])
    }

    // 7. Register payments
    for (const pago of pagosArray) {
      if (!pago || parseFloat(pago.monto || 0) <= 0) continue
      await appendRow('PAGOS', [
        uuid(), pedidoId, pago.tipo || 'EFECTIVO',
        String(parseFloat(pago.monto || 0).toFixed(2)),
        now,
        pago.tipo === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO',
        '', '', '',
        pago.fotoComprobante || '',
        vendedorId, pago.notas || '',
      ])
    }

    return Response.json({ pedidoId, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
