import { readSheet, appendRow, findRow, fechaAhora } from '@/lib/sheets'
import { generatePedidoId, generateItemId, calcularDiasEntrega, calcularDiasEntregaDesdeSheet, subestadoInicial, logCambio } from '@/lib/pedidos'
import { uploadToCloudinary, uploadFileToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const vendedorId = searchParams.get('vendedor')
    const rol = searchParams.get('rol')

    let pedidos  = await readSheet('PEDIDOS')
    let detalles = await readSheet('DETALLE_PEDIDO')
    let pagos    = await readSheet('PAGOS')
    let clientes = await readSheet('CLIENTES')
    let guias    = await readSheet('GUIAS_DESPACHO')

    if (rol === 'VENDEDOR' && searchParams.get('scope') === 'mios') {
      const vendedorNombreParam = searchParams.get('vendedor') || ''
      const vendedorIdParam     = searchParams.get('vendedorId') || vendedorId || ''
      pedidos = pedidos.filter(p =>
        p.VENDEDOR_ID === vendedorNombreParam ||
        p.VENDEDOR_ID === vendedorIdParam
      )
    }

    const result = pedidos.map(p => {
      const guiasPedido = guias
        .filter(g => g.PEDIDO_ID === p.PEDIDO_ID)
        .sort((a, b) => (b.FECHA_DESPACHO || '').localeCompare(a.FECHA_DESPACHO || ''))

      const guia = guiasPedido[0] || null
      const clienteInfo = clientes.find(c => c.CLIENTE_ID === p.CLIENTE_ID) || null

      return {
        ...p,
        items: detalles.filter(d => d.PEDIDO_ID === p.PEDIDO_ID && d.SUBESTADO !== 'ELIMINADO'),
        pagos: pagos.filter(pg => pg.PEDIDO_ID === p.PEDIDO_ID),
        CLIENTE_NOMBRE:  clienteInfo?.NOMBRE  || '',
        CLIENTE_CEDULA:  clienteInfo?.CEDULA  || '',
        CLIENTE_CELULAR: clienteInfo?.CELULAR || '',
        GUIA_NUMERO:       guia?.NUMERO_GUIA       || p.GUIA_NUMERO       || '',
        GUIA_TRANSPORTISTA:guia?.TRANSPORTISTA      || p.GUIA_TRANSPORTISTA || '',
        GUIA_FOTO_URL:     guia?.FOTO_GUIA_URL      || '',
        GUIA_FECHA:        guia?.FECHA_DESPACHO     || '',
        GUIA_ID:           guia?.GUIA_ID            || '',
      }
    })

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

    // Handle cliente
    let clienteId
    const { row: existingCliente } = await findRow('CLIENTES', 'CEDULA', String(cliente.cedula))
    if (existingCliente) {
      clienteId = existingCliente.CLIENTE_ID
      try {
        const clientes = await readSheet('CLIENTES')
        const cIdx = clientes.findIndex(c => c.CLIENTE_ID === clienteId)
        if (cIdx !== -1) {
          const cUpdated = {
            ...clientes[cIdx],
            NOMBRE:    cliente.nombre    || clientes[cIdx].NOMBRE,
            CELULAR:   String(cliente.celular || clientes[cIdx].CELULAR),
            EMAIL:     cliente.email     || clientes[cIdx].EMAIL,
            CIUDAD:    cliente.ciudad    || clientes[cIdx].CIUDAD,
            DIRECCION: direccionTexto    || cliente.direccion || clientes[cIdx].DIRECCION,
          }
          const { getSheets } = await import('@/lib/sheets')
          const sheets = await getSheets()
          const hRes = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.SHEET_ID,
            range: 'CLIENTES!A2:Z2',
          })
          const headers = hRes.data.values?.[0] || []
          const row = headers.map(h => String(cUpdated[h] || ''))
          const sheetRow = cIdx + 4
          const lastCol = String.fromCharCode(65 + headers.length - 1)
          await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.SHEET_ID,
            range: `CLIENTES!A${sheetRow}:${lastCol}${sheetRow}`,
            valueInputOption: 'RAW',
            requestBody: { values: [row] },
          })
        }
      } catch (updateErr) {
        console.error('Error actualizando cliente existente:', updateErr.message)
      }
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

    const montoTotal    = items.reduce((sum, i) => sum + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
    const pagosArray    = Array.isArray(pagosInput) ? pagosInput : []
    const montoAbonado  = pagosArray.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0)
    const montoPendiente = montoTotal - montoAbonado

    const areas = items.map(i => i.area || '').filter(a => a !== 'ENTREGA EN TIENDA')
    const diasCalculado = await calcularDiasEntregaDesdeSheet(areas)

    const now = fechaAhora()

    // ✅ FIX duplicados (race condition): generar el ID en el ÚLTIMO momento
    // (justo antes de guardar la fila), NO al inicio. Antes se calculaba al
    // empezar el pedido y, mientras se guardaba el cliente y se subían fotos
    // (1-2 s), un segundo pedido leía el mismo "máximo" y obtenía el MISMO número.
    // Además verificamos que el NÚMERO no esté usado por ningún pedido de NINGUNA
    // tienda (MAN-AND-2432 e IND-XAV-2432 compartían el 2432).
    let pedidoId = await generatePedidoId(tiendaId, vendedorCodigo)
    {
      const yaExisten = await readSheet('PEDIDOS')
      const numerosUsados = new Set(
        yaExisten
          .map(p => parseInt((p.PEDIDO_ID || '').split('-').pop(), 10))
          .filter(n => !isNaN(n))
      )
      const parts = pedidoId.split('-')
      let num = parseInt(parts[parts.length - 1], 10)
      while (numerosUsados.has(num)) num++   // sube hasta encontrar uno libre
      parts[parts.length - 1] = String(num)
      pedidoId = parts.join('-')
    }

    await appendRow('PEDIDOS', [
      pedidoId, tiendaId, vendedorNombre || vendedorId, clienteId,
      now, now, fechaEntregaPrometida || '',
      String(diasCalculado), String(diasCalculado),
      'FALSE',
      'EN_FABRICA',
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

    await logCambio(pedidoId, 'CREACION', '', 'EN_FABRICA', vendedorId)

    // Items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemId = await generateItemId(pedidoId, i + 1)
      const cloudFolder = `mandarina-pro/pedidos/${pedidoId}`
      const initSubestado = subestadoInicial(item.area)

      let fotoPecho = '', fotoEspalda = '', fotoMangaD = '', fotoMangaI = '', archivoDiseno = ''

      try {
        async function processPhoto(data, name) {
          if (!data) return ''
          if (data.startsWith('http')) return data
          if (data.startsWith('data:')) {
            const r = await uploadToCloudinary(data, name, cloudFolder)
            return r.url
          }
          return ''
        }
        fotoPecho   = await processPhoto(item.fotoPecho || item.imagenShopify || '', `${itemId}_pecho.jpg`)
        fotoEspalda = await processPhoto(item.fotoEspalda, `${itemId}_espalda.jpg`)
        fotoMangaD  = await processPhoto(item.fotoMangaD,  `${itemId}_manga_d.jpg`)
        fotoMangaI  = await processPhoto(item.fotoMangaI,  `${itemId}_manga_i.jpg`)
        if (item.archivoDiseno) {
          const r = await uploadFileToCloudinary(item.archivoDiseno, `${itemId}_diseno`, cloudFolder)
          archivoDiseno = r.url
        }
      } catch (uploadErr) {
        console.error('Photo upload error:', uploadErr.message)
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
        '',
      ])
    }

    // Pagos
    for (const pago of pagosArray) {
      if (!pago || parseFloat(pago.monto || 0) <= 0) continue

      // ✅ FIX: subir comprobante a Cloudinary y guardar SOLO la URL (no base64).
      let comprobanteUrl = pago.fotoComprobante || ''
      if (comprobanteUrl.startsWith('data:')) {
        try {
          const r = await uploadToCloudinary(
            comprobanteUrl,
            `comprobante_${pedidoId}_${Date.now()}.jpg`,
            `mandarina-pro/comprobantes`
          )
          comprobanteUrl = r.url
        } catch (err) {
          console.error('Error subiendo comprobante:', err.message)
          comprobanteUrl = ''
        }
      }

      await appendRow('PAGOS', [
        uuid(), pedidoId, pago.tipo || 'EFECTIVO',
        String(parseFloat(pago.monto || 0).toFixed(2)),
        now,
        pago.tipo === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO',
        '', '', '', comprobanteUrl,
        vendedorId, pago.notas || '',
      ])
    }

    return Response.json({ pedidoId, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
