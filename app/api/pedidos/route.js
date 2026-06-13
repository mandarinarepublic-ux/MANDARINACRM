import { readSheet, appendRow, findRow, fechaAhora } from '@/lib/sheets'
import { generatePedidoId, generateItemId, calcularDiasEntrega, subestadoInicial, logCambio } from '@/lib/pedidos'
import { uploadToCloudinary, uploadFileToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const vendedorId = searchParams.get('vendedor')
    const rol = searchParams.get('rol')

    let pedidos = await readSheet('PEDIDOS')
    let detalles = await readSheet('DETALLE_PEDIDO')
    let pagos = await readSheet('PAGOS')

    // Vendors only see their own orders in "mis-pedidos" context
    // For historial they see all
    if (rol === 'VENDEDOR' && searchParams.get('scope') === 'mios') {
      const vendedorNombreParam = searchParams.get('vendedor') || ''
      const vendedorIdParam = searchParams.get('vendedorId') || vendedorId || ''
      pedidos = pedidos.filter(p =>
        p.VENDEDOR_ID === vendedorNombreParam ||
        p.VENDEDOR_ID === vendedorIdParam
      )
    }
    // ADMIN with scope=mios sees all orders

    const result = pedidos.map(p => ({
      ...p,
      items: detalles.filter(d => d.PEDIDO_ID === p.PEDIDO_ID && d.SUBESTADO !== 'ELIMINADO'),
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
      tiendaId, vendedorId, vendedorNombre, vendedorCodigo,
      cliente, items, pagos: pagosInput,
      emitirFactura, fechaEntregaPrometida,
      notasVendedor, direccionTexto, latitud, longitud,
    } = body

    const pedidoId = await generatePedidoId(tiendaId, vendedorCodigo)

    // Handle cliente
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

    const montoTotal = items.reduce((sum, i) => sum + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
    const pagosArray = Array.isArray(pagosInput) ? pagosInput : []
    const montoAbonado = pagosArray.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0)
    const montoPendiente = montoTotal - montoAbonado

    const areas = items.map(i => i.area || '').filter(a => a !== 'ENTREGA EN TIENDA')
    const diasCalculado = calcularDiasEntrega(areas)

    const now = fechaAhora()

    // Pedido nace directamente EN_FABRICA
    await appendRow('PEDIDOS', [
      pedidoId, tiendaId, vendedorNombre || vendedorId, clienteId,
      now, now, fechaEntregaPrometida || '',
      String(diasCalculado), String(diasCalculado),
      'FALSE',
      'EN_FABRICA', // <-- directo a fábrica
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

    // Log creation
    await logCambio(pedidoId, 'CREACION', '', 'EN_FABRICA', vendedorId)

    // Save items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemId = await generateItemId(pedidoId, i + 1)
      const cloudFolder = `mandarina-pro/pedidos/${pedidoId}`
      const initSubestado = subestadoInicial(item.area)

      let fotoPecho = '', fotoEspalda = '', fotoMangaD = '', fotoMangaI = '', archivoDiseno = ''

      try {
        // If photo is base64 → upload to Cloudinary
        // If photo is already a URL (e.g. from Shopify CDN) → use directly
        async function processPhoto(data, name) {
          if (!data) return ''
          if (data.startsWith('http')) return data // already a URL, use as-is
          if (data.startsWith('data:')) {
            const r = await uploadToCloudinary(data, name, cloudFolder)
            return r.url
          }
          return ''
        }
        // fotoPecho: use uploaded base64, or Shopify CDN URL directly
        fotoPecho = await processPhoto(item.fotoPecho || item.imagenShopify || '', `${itemId}_pecho.jpg`)
        fotoEspalda = await processPhoto(item.fotoEspalda, `${itemId}_espalda.jpg`)
        fotoMangaD  = await processPhoto(item.fotoMangaD,  `${itemId}_manga_d.jpg`)
        fotoMangaI  = await processPhoto(item.fotoMangaI,  `${itemId}_manga_i.jpg`)
        if (item.archivoDiseno) {
          const r = await uploadFileToCloudinary(item.archivoDiseno, `${itemId}_diseno`, cloudFolder)
          archivoDiseno = r.url
        }
      } catch (uploadErr) {
        console.error('Photo upload error:', uploadErr.message)
        // If Shopify URL was passed directly, still save it
        if (item.fotoPecho?.startsWith('http')) fotoPecho = item.fotoPecho
      }

      await appendRow('DETALLE_PEDIDO', [
        itemId, pedidoId, tiendaId,
        item.productoNombre, item.detalle || '', item.esPersonalizado ? 'TRUE' : 'FALSE',
        item.color || '', item.talla || '',
        String(item.cantidad || 1),
        String(item.precioUnit || 0),
        String((parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)),
        item.area || '', initSubestado,
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        archivoDiseno,
        item.shopifyVariantId || '',
        now,
        '', // NOTAS_AREA
      ])
    }

    // Register payments
    for (const pago of pagosArray) {
      if (!pago || parseFloat(pago.monto || 0) <= 0) continue
      await appendRow('PAGOS', [
        uuid(), pedidoId, pago.tipo || 'EFECTIVO',
        String(parseFloat(pago.monto || 0).toFixed(2)),
        now,
        pago.tipo === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO',
        '', '', '', pago.fotoComprobante || '',
        vendedorId, pago.notas || '',
      ])
    }

    return Response.json({ pedidoId, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
