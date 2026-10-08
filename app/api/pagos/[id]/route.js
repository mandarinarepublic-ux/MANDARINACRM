// app/api/pagos/[id]/route.js — Corregir o borrar un abono ya registrado.
//
// SOLO ADMIN. Un vendedor que se equivoca pide la corrección: el pago es plata,
// y cambiarlo mueve el "Debe" del pedido y los tableros de cobranza.
//
// Regla pura y probada en lib/editarPago.js.

import { requireAdmin } from '@/lib/auth'
import { logCambio } from '@/lib/pedidos'
import { getPagoRaw, updatePago, deletePago, recalcPago } from '@/lib/db/pagos'
import { validarEdicionPago, describirPago } from '@/lib/editarPago'

export const dynamic = 'force-dynamic'

const quien = (u) => u?.NOMBRE || u?.USUARIO || u?.USUARIO_ID || 'ADMIN'

function respuesta(totales) {
  return {
    ok: true,
    totalAbonado: totales.totalAbonado.toFixed(2),
    montoPendiente: totales.montoPendiente.toFixed(2),
    estadoPago: totales.estadoPago,
  }
}

export async function PATCH(req, { params }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const antes = await getPagoRaw(params.id)
    if (!antes) return Response.json({ error: 'Pago no encontrado' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const v = validarEdicionPago(antes, body)
    if (!v.ok) return Response.json({ error: v.error }, { status: 400 })
    if (Object.keys(v.cambios).length === 0) {
      return Response.json({ ok: true, sinCambios: true })
    }

    await updatePago(params.id, v.cambios)
    const totales = await recalcPago(antes.pedido_id)

    // Con await: en serverless un log suelto muere cuando la instancia se congela.
    await logCambio(
      antes.pedido_id,
      'PAGO_EDITADO',
      describirPago(antes),
      describirPago({ ...antes, ...v.cambios }),
      quien(auth.usuario),
    )

    return Response.json(respuesta(totales))
  } catch (e) {
    console.error('PATCH /api/pagos/[id] error:', e)
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const antes = await getPagoRaw(params.id)
    if (!antes) return Response.json({ error: 'Pago no encontrado' }, { status: 404 })

    await deletePago(params.id)
    const totales = await recalcPago(antes.pedido_id)

    // ☠️ No hay papelera: esta línea es lo único que queda para reconstruirlo.
    const comprobante = antes.foto_comprobante_url ? ` · comprobante ${antes.foto_comprobante_url}` : ''
    await logCambio(
      antes.pedido_id,
      'PAGO_ELIMINADO',
      `${describirPago(antes)}${comprobante}`,
      '',
      quien(auth.usuario),
    )

    return Response.json(respuesta(totales))
  } catch (e) {
    console.error('DELETE /api/pagos/[id] error:', e)
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}
