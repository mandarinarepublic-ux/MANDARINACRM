export const dynamic = 'force-dynamic'
import { emitirFacturaDatil, datilDirectoActivo } from '@/lib/datil'

// Punto único de emisión de factura, llamado por el cliente al crear un pedido.
// Con DATIL_DIRECTO=1 emite DIRECTO en Dátil (lib/datil.js). Si no, reenvía al
// webhook de Make como hasta ahora. El interruptor vive en el servidor: la key
// de Dátil nunca llega al navegador, y se migra (o revierte) sin desplegar.
const MAKE_WEBHOOK = 'https://hook.us2.make.com/mjvj01tevojz6ayp7rrtt7wc6oa7v11n'

export async function POST(req) {
  try {
    const body = await req.json()
    const { pedidoId, cliente, montoTotal, tipoId } = body
    if (!pedidoId) return Response.json({ ok: false, error: 'pedidoId requerido' }, { status: 400 })

    if (datilDirectoActivo()) {
      const r = await emitirFacturaDatil({ pedidoId, cliente, montoTotal, tipoId })
      if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 502 })
      return Response.json({ ok: true, via: 'directo', ...r })
    }

    // Respaldo: mismo payload que enviaba el cliente al webhook de Make.
    const total = parseFloat(montoTotal || 0)
    const sinImp = parseFloat((total / 1.15).toFixed(2))
    const cedula = String(cliente?.cedula || '')
    const res = await fetch(MAKE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id:    pedidoId,
        numero:       String(cliente?.celular || '').replace(/\D/g, ''),
        CI:           cedula,
        tipo_id:      tipoId || (cedula.length === 13 ? '04' : '05'),
        cliente:      cliente?.nombre || '',
        email:        cliente?.email || 'info@mandarinaec.com',
        total:        total.toFixed(2),
        PrecioSinImp: sinImp.toFixed(2),
        ValorImp:     (total - sinImp).toFixed(2),
      }),
    })
    if (!res.ok) return Response.json({ ok: false, error: `Make HTTP ${res.status}` }, { status: 502 })
    return Response.json({ ok: true, via: 'make' })
  } catch (e) {
    console.error('factura/emitir error:', e)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
