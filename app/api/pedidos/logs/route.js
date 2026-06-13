export const dynamic = 'force-dynamic'
import { readSheet } from '@/lib/sheets'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const pedidoId = searchParams.get('pedidoId')
    if (!pedidoId) return Response.json({ logs: [] })

    const logs = await readSheet('LOGS_PEDIDOS')
    const filtrados = logs
      .filter(l => l.PEDIDO_ID === pedidoId)
      .map(l => ({
        fecha: l.FECHA || '',
        usuario: l.USUARIO_ID || '',
        campo: l.CAMPO || '',
        antes: l.VALOR_ANTES || '',
        despues: l.VALOR_DESPUES || '',
      }))
      .reverse() // most recent first

    return Response.json({ logs: filtrados })
  } catch (e) {
    return Response.json({ logs: [], error: e.message })
  }
}
