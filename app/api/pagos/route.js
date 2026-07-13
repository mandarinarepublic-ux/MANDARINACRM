import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { createPago, recalcPago } from '@/lib/db/pagos'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const body = await req.json()
    const { pedidoId, tipo, monto, fotoComprobante, notas, vendedorId, vendedorNombre } = body

    if (!pedidoId || !tipo || !monto || parseFloat(monto) <= 0) {
      return Response.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const montoNum = parseFloat(monto)

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

    // 2. Crear el pago (dual-write: Sheets append 12-col + Supabase insert).
    const pagoId = await createPago(pedidoId, {
      tipo,
      monto: montoNum,
      comprobanteUrl,
      vendedorId,
      notas,
    })

    // 3. Recalcular montos del pedido (dual-write updateCell L/N/O + Supabase update).
    //    recalcPago lanza 'Pedido no encontrado' → 404, igual que antes.
    const { totalAbonado, montoPendiente, estadoPago } = await recalcPago(pedidoId)

    // 4. Registrar en bitácora
    // firma: logCambio(pedidoId, campo, antes, despues, usuario)
    await logCambio(
      pedidoId,
      'PAGO_AGREGADO',
      '',
      `${tipo} $${montoNum.toFixed(2)}${notas ? ' · ' + notas : ''}`,
      vendedorNombre || vendedorId || 'VENDEDOR'
    )

    return Response.json({
      ok: true,
      pagoId,
      totalAbonado: totalAbonado.toFixed(2),
      montoPendiente: montoPendiente.toFixed(2),
      estadoPago,
    })
  } catch (e) {
    console.error('POST /api/pagos error:', e)
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}
