import { fechaAhora } from '@/lib/sheets'
import { generateItemId, calcularDiasEntregaDesdeSheet, subestadoInicial, logCambio } from '@/lib/pedidos'
import { uploadToCloudinary, uploadFileToCloudinary } from '@/lib/cloudinary'
import { listPedidos, createPedido, generatePedidoId, siguienteNumeroPedido } from '@/lib/db/pedidos'
import { crearPedidoConReintento } from '@/lib/reintento-pedido'
import { upsertClienteByCedula } from '@/lib/db/clientes'
import { createItem } from '@/lib/db/detalle'
import { createPago } from '@/lib/db/pagos'
import { enviarPurchase, capiConfigurado, debeEnviarCapi } from '@/lib/metaCapi'
import { registrarEvento } from '@/lib/eventos'
import { notificarVenta } from '@/lib/telegram'

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

    // El ID se genera en el ÚLTIMO momento, justo antes de guardar la fila, y no
    // al empezar: antes se calculaba al inicio y, mientras se guardaba el cliente
    // y se subían las fotos (1-2 s), un segundo pedido leía el mismo "máximo" y
    // se llevaba el MISMO número.
    //
    // El número se pide ACÁ, al grabar, y NUNCA antes: nada queda reservado, así
    // que una venta que no se completa no deja hueco en la numeración.
    //
    // Se fue la red anti-colisión que leía los 676 IDs y subía el número a mano.
    // La garantía ahora la da la base: `crm.pedidos.unique_id` tiene índice
    // único. Si dos vendedores coinciden en el mismo instante, la segunda
    // inserción es rechazada y se reintenta con el número siguiente — y como esa
    // fila no llegó a escribirse, tampoco deja hueco.
    let { pedidoId, uniqueId } = await generatePedidoId(tiendaId, vendedorCodigo)

    const estadoPago = montoAbonado >= montoTotal ? 'PAGADO' : montoAbonado > 0 ? 'ABONO' : 'PENDIENTE'

    // La ATRIBUCIÓN no se resuelve acá.
    //
    // Antes esto llamaba a resolverOrigen() con `await` justo antes de grabar:
    // un viaje de red a Supabase en el camino crítico de la venta. Grabar un
    // pedido no puede hacerse ni un poco más lento por un dato de reporte.
    //
    // Ahora lo hace un trigger de Postgres (crm.pedidos_set_origen) DENTRO del
    // insert: una consulta local con índice, en la misma transacción. No agrega
    // latencia, la quita — y de paso cubre los pedidos que crean los agentes de
    // WhatsApp, que insertan por otro camino.
    //
    // Ver la migración crm_2026_08_02_origen_trigger.

    // Fila del pedido (dual-write). Mismo orden de columnas que el append previo.
    const creado = await crearPedidoConReintento(pedidoId, uniqueId, (pid, uid) => createPedido({
      pedidoId: pid,
      uniqueId: uid,
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
    }), siguienteNumeroPedido)
    // Si hubo choque, el pedido quedó con OTRO número: todo lo que viene después
    // (items, pagos, bitácora, factura, CAPI) tiene que usar el bueno.
    pedidoId = creado.pedidoId
    uniqueId = creado.uniqueId

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

    // ── Aviso de venta por Telegram ── fire & forget (lo que hacía Make).
    // Le avisa al chat de ventas que un vendedor cerró una venta.
    notificarVenta({
      pedidoId,
      tiendaId,
      vendedor: vendedorNombre || vendedorId,
      cliente: cliente?.nombre,
      monto: montoTotal,
      prendas: items.reduce((s, i) => s + parseInt(i.cantidad || 1), 0),
    }).catch(() => {})

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
        // vendedorId decide el action_source cuando el cliente NO vino de un
        // anuncio: si vende en el mostrador va como physical_store para que Meta
        // cruce al cliente de paso. Ver lib/canalVenta.js.
        // Se manda EXACTAMENTE lo mismo que se guardó en VENDEDOR_ID unas líneas
        // arriba (`vendedorNombre || vendedorId`). Si acá fuera el id crudo y en
        // la base el nombre, el reenvío desde /dashboard/errores —que lee la
        // columna— clasificaría el origen distinto que el envío original.
        enviarPurchase({
          pedidoId, tiendaId, cliente, montoTotal,
          vendedorId: vendedorNombre || vendedorId,
        }).catch(err => console.error('META CAPI error:', err.message))
      } else {
        // Acá vivía el respaldo a Make: si el CAPI directo no estaba configurado,
        // el Purchase se mandaba a un webhook de Make. **Se eliminó el 11-ago-2026.**
        //
        // Make está apagado por completo desde el 28-jul (los 33 escenarios en
        // `isActive: false`), así que ese respaldo ya no llevaba a ningún lado.
        // Y era una mina armada del mismo tipo que la que dejó 13 días sin
        // facturar: iba suelto, sin mirar la respuesta, así que el día que
        // `capiConfigurado()` cayera —un token que se vence, una variable que se
        // borra— las ventas dejarían de llegar a Meta EN SILENCIO, y con ellas la
        // optimización de la pauta.
        //
        // Ahora no hay respaldo: hay aviso. Si falta configuración, se grita.
        await registrarEvento({
          fuente: 'meta', nivel: 'error', pedidoId,
          mensaje: 'La venta NO se envió a Meta: falta META_CAPI_TOKEN o los pixel id en el servidor',
        })
      }
    } catch (capiErr) {
      console.error('META CAPI build error:', capiErr.message)
    }

    return Response.json({ pedidoId, montoTotal, diasCalculado })
  } catch (e) {
    console.error('POST pedido error:', e)
    // Un fallo al crear el pedido casi siempre es de la escritura a Supabase/Sheets.
    await registrarEvento({ fuente: 'supabase', nivel: 'error', mensaje: `Crear pedido: ${e.message}` })
    return Response.json({ error: 'Error al crear pedido: ' + e.message }, { status: 500 })
  }
}
