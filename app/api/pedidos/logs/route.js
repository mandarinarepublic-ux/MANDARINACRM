export const dynamic = 'force-dynamic'
import { listLogsByPedido } from '@/lib/db/logs'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const pedidoId = searchParams.get('pedidoId')
    if (!pedidoId) return Response.json({ logs: [] })

    // Lectura vía repo (respeta DATA_BACKEND = supabase tras el cutover).
    const logs = await listLogsByPedido(pedidoId)

    return Response.json({ logs })
  } catch (e) {
    console.error('Logs error:', e.message)
    return Response.json({ logs: [], error: e.message })
  }
}
