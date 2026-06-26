import { readSheet, appendRow, updateRow, fechaAhora } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const body = await req.json()
    const { pedidoId, tipo, monto, fotoComprobante, notas, vendedorId, vendedorNombre } = body

    if (!pedidoId || !tipo || !monto || parseFloat(monto) <= 0) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const montoNum = parseFloat(monto)
    const now = fechaAhora()

    // 1. Subir foto comprobante si viene en base64
    let comprobanteUrl = fotoComprobante || ''
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

    // 2. Insertar en hoja PAGOS
    const pagoId = uuid()
    await appendRow('PAGOS', [
      pagoId, pedidoId, tipo,
      montoNum.toFixed(2),
      now,
      tipo === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO',
      '', '', '', comprobanteUrl,
      vendedorId || '', notas || '',
    ])

    // 3. Actualizar MONTO_ABONADO y ESTADO_PAGO en PEDIDOS
    const pedidos = await readSheet('PEDIDOS')
    const pedido = pedidos.find(p => p.PEDIDO_ID === pedidoId)
    if (!pedido) {
      return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    // Leer todos los pagos existentes + el nuevo para calcular total abonado
    const pagos = await readSheet('PAGOS')
    const todosPagos = pagos.filter(pg => pg.PEDIDO_ID === pedidoId)
    const totalAbonado = todosPagos.reduce((sum, pg) => sum + parseFloat(pg.MONTO || 0), 0)
    const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
    const montoPendiente = Math.max(0, montoTotal - totalAbonado).toFixed(2)

    let estadoPago = 'PENDIENTE'
    if (totalAbonado >= montoTotal) estadoPago = 'PAGADO'
    else if (totalAbonado > 0) estadoPago = 'ABONO'

    const pedidoIdx = pedidos.findIndex(p => p.PEDIDO_ID === pedidoId)
    await updateRow('PEDIDOS', pedidoIdx, {
      ...pedido,
      MONTO_ABONADO: totalAbonado.toFixed(2),
      MONTO_PENDIENTE: montoPendiente,
      ESTADO_PAGO: estadoPago,
    })

    // 4. Registrar en bitácora
    await logCambio(pedidoId, vendedorNombre || vendedorId || 'VENDEDOR', 'PAGO_AGREGADO', '', `${tipo} $${montoNum.toFixed(2)}${notas ? ' · ' + notas : ''}`)

    return Response.json({
      ok: true,
      pagoId,
      totalAbonado: totalAbonado.toFixed(2),
      montoPendiente,
      estadoPago,
    })
  } catch (e) {
    console.error('POST /api/pagos error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
