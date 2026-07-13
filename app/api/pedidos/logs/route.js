export const dynamic = 'force-dynamic'
import { shadow } from '@/lib/db/_backend'
import { listLogsByPedido, listLogsByPedidoSupabase } from '@/lib/db/logs'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const pedidoId = searchParams.get('pedidoId')
    if (!pedidoId) return Response.json({ logs: [] })

    // Verdad = backend activo (Sheets en Fase 3). Se conserva el contrato exacto.
    const logs = await listLogsByPedido(pedidoId)
    await shadow('logs.byPedido', logs, () => listLogsByPedidoSupabase(pedidoId))

    return Response.json({ logs })
  } catch (e) {
    console.error('Logs error:', e.message)
    return Response.json({ logs: [], error: e.message })
  }
}
