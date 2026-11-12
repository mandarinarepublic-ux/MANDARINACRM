// app/api/pagos/[id]/transferencia/route.js — Confirmar o rechazar la
// transferencia que un cliente subió en la tienda web (12-nov-2026).
//
// SOLO ADMIN (decisión de Rodrigo). Confirmar pasa el pedido a producción, lo
// crea PAGADO en Shopify y avisa la venta a Meta; rechazar lo cancela.
// La lógica vive en lib/procesarTransferencia.js.
//
// POST { accion: 'confirmar' }                 → { ok, pedidoId, shopify, avisos }
// POST { accion: 'rechazar', motivo? }         → { ok, pedidoId }

import { requireAdmin } from '@/lib/auth'
import { confirmarTransferencia, rechazarTransferencia } from '@/lib/procesarTransferencia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const quien = (u) => u?.NOMBRE || u?.USUARIO || u?.USUARIO_ID || 'ADMIN'

export async function POST(req, { params }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({}))
    const admin = quien(auth.usuario)
    if (body?.accion === 'confirmar') {
      return Response.json(await confirmarTransferencia({ pagoId: params.id, admin }))
    }
    if (body?.accion === 'rechazar') {
      const motivo = String(body?.motivo || '').slice(0, 200)
      return Response.json(await rechazarTransferencia({ pagoId: params.id, admin, motivo }))
    }
    return Response.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (e) {
    console.error('POST /api/pagos/[id]/transferencia:', e)
    return Response.json({ error: e.message }, { status: e.status || 500 })
  }
}
