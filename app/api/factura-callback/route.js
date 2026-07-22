export const dynamic = 'force-dynamic'
import { setFactura } from '@/lib/db/facturas'
import { registrarEvento } from '@/lib/eventos'

// Make llama a este endpoint después de emitir la factura en Dátil
// Body: { pedido_id, datil_id, ride_url }
export async function POST(req) {
  try {
    const body = await req.json()
    const { pedido_id, datil_id, ride_url } = body

    if (!pedido_id) return Response.json({ ok: false, error: 'pedido_id requerido' }, { status: 400 })

    // dual-write: Sheets (batchUpdate con columnas on-the-fly) + Supabase (update por PK).
    await setFactura(pedido_id, { datilId: datil_id, rideUrl: ride_url })

    console.log(`✅ Factura guardada: pedido=${pedido_id} datil_id=${datil_id}`)
    return Response.json({ ok: true, pedido_id, datil_id, ride_url })
  } catch (e) {
    console.error('factura-callback error:', e)
    registrarEvento({ fuente: 'webhook', nivel: 'error', mensaje: `Callback de factura: ${e.message}` })
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ ok: false, error: e.message }, { status: notFound ? 404 : 500 })
  }
}
