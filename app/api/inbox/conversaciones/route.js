export const dynamic = 'force-dynamic'
import { listConversaciones, conversacionesConCliente } from '@/lib/db/inbox'
import { requireUser, authError } from '@/lib/inboxAuth'

// GET /api/inbox/conversaciones?cuenta=MANDI&soporte=&humano=&conCliente=1&limit=100
// Lista de conversaciones para el panel del inbox (más reciente primero).
// conCliente=1 usa la vista que adjunta el cliente del CRM (unión por teléfono).
export async function GET(req) {
  const auth = await requireUser(req)
  if (!auth.ok) return authError(auth)
  try {
    const { searchParams } = new URL(req.url)
    const cuenta = searchParams.get('cuenta') || undefined
    const soporte = searchParams.get('soporte') || undefined
    const humano = searchParams.get('humano') || undefined
    const conCliente = searchParams.get('conCliente') === '1'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500)

    const conversaciones = conCliente
      ? await conversacionesConCliente({ cuenta, limit })
      : await listConversaciones({ cuenta, soporte, humano, limit })

    return Response.json({ conversaciones })
  } catch (e) {
    console.error('GET inbox/conversaciones error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
