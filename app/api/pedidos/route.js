import { readSheet, appendRow, findRow } from '@/lib/sheets'
import { generatePedidoId, generateItemId, calcularDiasEntrega, calcularFechaEntrega } from '@/lib/pedidos'
import { createPedidoFolder, uploadFileToDrive } from '@/lib/drive'
import { v4 as uuid } from 'uuid'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const vendedorId = searchParams.get('vendedor')
    const rol = searchParams.get('rol')
    const tienda = searchParams.get('tienda')

    let pedidos = await readSheet('PEDIDOS')
    let detalles = await readSheet('DETALLE_PEDIDO')
    let pagos = await readSheet('PAGOS')

    // Filter by role
    if (rol === 'VENDEDOR' && vendedorId) {
      pedidos = pedidos.filter(p => p.VENDEDOR_ID === vendedorId)
    }
    if (tienda && tienda !== 'TODAS') {
      pedidos = pedidos.filter(p => p.TIENDA_ID === tienda)
    }

    // Attach items and payments
    const result = pedidos.map(p => ({
      ...p,
      items: detalles.filter(d => d.PEDIDO_ID === p.PEDIDO_ID),
      pagos: pagos.filter(pg => pg.PEDIDO_ID === p.PEDIDO_ID),
    }))

    return Response.json({ pedidos: result })
  } catch (e) {
    console.error('GET pedidos error:', e)
    return Response.json({ error: 'Error al cargar pedidos' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      tiendaId, vendedorId, vendedorCodigo,
      cliente, items, pago,
      diasEntregaPrometido, fechaEntregaPrometida,
      notasVendedor, direccionTexto, latitud, longitud,
    } = body

    // 1. Generate pedido ID
    const pedidoId = await generatePedidoId(tiendaId, vendedorCodigo)

    // 2. Handle cliente - find or create
    let clienteId
    const { row: existingCliente, index: clienteIdx } = await findRow('CLIENTES', 'CEDULA', cliente.cedula)
    if (existingCliente) {
      clienteId = existingCliente.CLIENTE_ID
    } else {
      clienteId = uuid()
      await appendRow('CLIENTES', [
        clienteId, cliente.nombre, cliente.cedula,
        cliente.celular, cliente.email || '',
        cliente.ciudad || 'Quito', cliente.direccion || direccionTexto || '',
        new Date().toISOString(),
      ])
    }

    // 3. Create Drive folder for pedido
    const folderId = await createPedidoFolder(pedidoId)
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`

    // 4. Calculate delivery
    const areas = items.map(i => i.area)
    const diasCalculado = calcularDiasEntrega(areas)
    const diasPrometido = diasEntregaPrometido || diasCalculado
    const fechaEntrega = fechaEntregaPrometida || calcularFechaEntrega(diasPrometido)
    const alertaEntrega = diasPrometido < diasCalculado

    // 5. Calculate totals
    const montoTotal = items.reduce((sum, i) => sum + (i.precioUnit * i.cantidad), 0)
    const montoAbonado = pago?.monto || 0
    const montoPendiente = montoTotal - montoAbonado

    // 6. Save pedido
    const now = new Date().toISOString()
    await appendRow('PEDIDOS', [
      pedidoId, tiendaId, vendedorId, clienteId,
      now, now, fechaEntrega,
      diasCalculado, diasPrometido, alertaEntrega ? 'TRUE' : 'FALSE',
      'PENDIENTE_FABRICA',
      montoAbonado >= montoTotal ? 'PAGADO' : montoAbonado > 0 ? 'ABONO' : 'PENDIENTE',
      montoTotal, montoAbonado, montoPendiente,
      'FALSE', '',
      notasVendedor || '', '', folderUrl,
      direccionTexto || '', latitud || '', longitud || '',
    ])

    // 7. Upload fotos and save items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemId = await generateItemId(pedidoId, i + 1)

      // Upload design photos to Drive
      let fotoPecho = '', fotoEspalda = '', fotoMangaD = '', fotoMangaI = '', archivoDiseno = ''

      if (item.fotoPecho) {
        const f = await uploadFileToDrive(item.fotoPecho, `${itemId}_pecho.jpg`, 'image/jpeg', folderId)
        fotoPecho = f.directUrl
      }
      if (item.fotoEspalda) {
        const f = await uploadFileToDrive(item.fotoEspalda, `${itemId}_espalda.jpg`, 'image/jpeg', folderId)
        fotoEspalda = f.directUrl
      }
      if (item.fotoMangaD) {
        const f = await uploadFileToDrive(item.fotoMangaD, `${itemId}_manga_d.jpg`, 'image/jpeg', folderId)
        fotoMangaD = f.directUrl
      }
      if (item.fotoMangaI) {
        const f = await uploadFileToDrive(item.fotoMangaI, `${itemId}_manga_i.jpg`, 'image/jpeg', folderId)
        fotoMangaI = f.directUrl
      }
      if (item.archivoDiseno) {
        const ext = item.archivoDiseno.includes('pdf') ? 'pdf' : 'ai'
        const f = await uploadFileToDrive(item.archivoDiseno, `${itemId}_diseno.${ext}`, 'application/octet-stream', folderId)
        archivoDiseno = f.directUrl
      }

      await appendRow('DETALLE_PEDIDO', [
        itemId, pedidoId, tiendaId,
        item.productoNombre, item.detalle || '', item.esPersonalizado ? 'TRUE' : 'FALSE',
        item.color, item.talla, item.cantidad,
        item.precioUnit, item.cantidad * item.precioUnit,
        item.area, 'SOLICITADO',
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        archivoDiseno, item.shopifyVariantId || '',
        now,
      ])
    }

    // 8. Register payment if any
    if (pago && pago.monto > 0) {
      await appendRow('PAGOS', [
        uuid(), pedidoId, pago.tipo, pago.monto,
        now, pago.tipo === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO',
        '', '', '',
        pago.fotoComprobante || '',
        vendedorId, pago.notas || '',
      ])
    }

    return Response.json({ pedidoId, folderUrl, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
