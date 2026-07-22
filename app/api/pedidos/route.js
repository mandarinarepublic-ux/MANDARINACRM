import { fechaAhora } from '@/lib/sheets'
import { generatePedidoId, generateItemId, calcularDiasEntregaDesdeSheet, subestadoInicial, logCambio } from '@/lib/pedidos'
import { uploadToCloudinary, uploadFileToCloudinary } from '@/lib/cloudinary'
import { listPedidos, listPedidoIds, createPedido } from '@/lib/db/pedidos'
import { upsertClienteByCedula } from '@/lib/db/clientes'
import { createItem } from '@/lib/db/detalle'
import { createPago } from '@/lib/db/pagos'
import { enviarPurchase, capiConfigurado, debeEnviarCapi } from '@/lib/metaCapi'
import { registrarEvento } from '@/lib/eventos'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    // Lectura vía repo: respeta DATA_BACKEND (Sheets hoy, Supabase tras el cutover).
    // El join (items/pagos/cliente/guía) y el filtro scope='mios' viven en listPedidos.
    const result = await listPedidos({
      vendedor:   searchParams.get('vendedor'),
      vendedorId: searchParams.get('vendedorId'),
      rol:        searchParams.get('rol'),
      scope:      searchParams.get('scope'),
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

    // Cliente: upsert por cédula (dual-write). Si existe, actualiza conservando
    // lo previo cuando el nuevo venga vacío; si no, lo crea. Devuelve su CLIENTE_ID.
    const clienteId = await upsertClienteByCedula(String(cliente.cedula), {
      nombre:    cliente.nombre,
      celular:   cliente.celular,
      email:     cliente.email,
      ciudad:    cliente.ciudad,
      direccion: direccionTexto || cliente.direccion,
    })

    const montoTotal    = items.reduce((sum, i) => sum + (parseFloat(i.precioUnit || 0) * parseInt(i.cantidad || 1)), 0)
    const pagosArray    = Array.isArray(pagosInput) ? pagosInput : []
    const montoAbonado  = pagosArray.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0)
    // Clamp a 0: si el abono inicial incluye envío/flete puede superar el total
    // del producto; el excedente NO es saldo negativo, es dinero extra ya cobrado.
    const montoPendiente = Math.max(0, montoTotal - montoAbonado)

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
      // Anti-colisión leyendo del backend activo (Sheets hoy, Supabase tras cutover)
      // para no generar un PEDIDO_ID duplicado si el espejo del otro store va desfasado.
      const idsExistentes = await listPedidoIds()
      const numerosUsados = new Set(
        idsExistentes
          .map(id => parseInt((id || '').split('-').pop(), 10))
          .filter(n => !isNaN(n))
      )
      const parts = pedidoId.split('-')
      let num = parseInt(parts[parts.length - 1], 10)
      while (numerosUsados.has(num)) num++   // sube hasta encontrar uno libre
      parts[parts.length - 1] = String(num)
      pedidoId = parts.join('-')
    }

    const estadoPago = montoAbonado >= montoTotal ? 'PAGADO' : montoAbonado > 0 ? 'ABONO' : 'PENDIENTE'

    // Fila del pedido (dual-write). Mismo orden de columnas que el append previo.
    await createPedido({
      pedidoId,
      tiendaId,
      vendedorId: vendedorNombre || vendedorId,   // se guarda en VENDEDOR_ID tal cual
      clienteId,
      fechaPedido: now,
      fechaActualizacion: now,
      fechaEntregaPrometida: fechaEntregaPrometida || '',
      diasCalculado,
      diasPrometido: diasCalculado,
      alertaEntrega: false,
      estadoPedido: 'EN_FABRICA',
      estadoPago,
      montoTotal: montoTotal.toFixed(2),
      montoAbonado: montoAbonado.toFixed(2),
      montoPendiente: montoPendiente.toFixed(2),
      facturaSolicitada: !!emitirFactura,
      facturaDatilId: '',
      notasVendedor: notasVendedor || '',
      direccionPedido: direccionTexto || cliente.direccion || '',
      latitud: latitud || null,
      longitud: longitud || null,
    })

    await logCambio(pedidoId, 'CREACION', '', 'EN_FABRICA', vendedorId)

    // Items (dual-write). Las fotos/archivo se suben aquí; createItem recibe URLs.
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemId = await generateItemId(pedidoId, i + 1)
      const cloudFolder = `mandarina-pro/pedidos/${pedidoId}`

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

      await createItem(pedidoId, {
        itemId,
        tiendaId,
        productoNombre: item.productoNombre,
        detalle: item.detalle || '',
        esPersonalizado: item.esPersonalizado,
        color: item.color || '',
        talla: item.talla || '',
        cantidad: item.cantidad || 1,
        precioUnit: item.precioUnit || 0,
        area: item.area || '',
        subestado: subestadoInicial(item.area),
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        archivoDiseno,
        shopifyVariantId: item.shopifyVariantId || '',
      })
    }

    // Pagos (dual-write). El comprobante se sube a Cloudinary (solo URL).
    for (const pago of pagosArray) {
      if (!pago || parseFloat(pago.monto || 0) <= 0) continue

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

      // estado por defecto de createPago: LINK_PAGO→PENDIENTE, resto→PAGADO (igual que antes).
      await createPago(pedidoId, {
        tipo: pago.tipo || 'EFECTIVO',
        monto: parseFloat(pago.monto || 0),
        comprobanteUrl,
        vendedorId,
        notas: pago.notas || '',
      })
    }

    // ── META CAPI ── fire & forget, no bloquea la respuesta.
    // Con META_CAPI_TOKEN configurado se envía DIRECTO a Meta (lib/metaCapi.js);
    // si no, se mantiene el webhook de Make como antes. Así la migración se
    // activa poniendo las variables en Vercel, sin desplegar de nuevo, y se
    // revierte quitándolas.
    try {
      // YAW no pauta en Meta: sus ventas no se envían por ninguno de los dos
      // caminos. Antes sí se enviaban, rotuladas como MANDARINA.
      if (!debeEnviarCapi(tiendaId)) {
        // nada que hacer
      } else if (capiConfigurado()) {
        enviarPurchase({ pedidoId, tiendaId, cliente, montoTotal })
          .catch(err => console.error('META CAPI error:', err.message))
      } else {
        const celularRaw = String(cliente.celular || '')
        const celularNorm = celularRaw.startsWith('0')
          ? '593' + celularRaw.slice(1)
          : celularRaw

        const tiendaMeta = (tiendaId || '').toUpperCase().includes('IND')
          ? 'INDSTORE'
          : 'MANDARINA'

        const capiPayload = {
          'Event ID': pedidoId,
          'Tienda':   tiendaMeta,
          'nombre':   cliente.nombre   || '',
          'apellido': '',
          'correo':   cliente.email    || '',
          'celular':  celularNorm,
          'dni':      String(cliente.cedula || ''),
          'ciudad':   cliente.ciudad   || '',
          'valor':    parseFloat(montoTotal || 0).toFixed(2),
        }

        fetch('https://hook.us2.make.com/6yme139yby51ejizn4l8dhg4rai7d7bn', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(capiPayload),
        }).catch(err => console.error('META CAPI webhook error:', err.message))
      }
    } catch (capiErr) {
      console.error('META CAPI build error:', capiErr.message)
    }

    return Response.json({ pedidoId, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    // Un fallo al crear el pedido casi siempre es de la escritura a Supabase/Sheets.
    registrarEvento({ fuente: 'supabase', nivel: 'error', mensaje: `Crear pedido: ${e.message}` })
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
