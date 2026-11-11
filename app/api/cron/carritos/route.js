import { listarPosiblesAbandonos, actualizarCheckout } from '@/lib/db/checkouts'
import { esAbandonado, textoAbandono, idAvisoAbandono } from '@/lib/checkoutTienda'
import { avisarPedidoEnInbox } from '@/lib/inbox-supabase'
import { DIRECCION_INTERNO, TIPO_PEDIDO_WEB, CANAL_POR_DEFECTO, telefonoInbox } from '@/lib/pedidoWebPendiente'
import { registrarEvento } from '@/lib/eventos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Carrito abandonado del pago con tarjeta en la tienda (11-nov-2026) ───────
// Cada 10 minutos (vercel.json). Quien llenó sus datos en /pagar y no pagó en
// 30 minutos aparece en el inbox de MANDARINA como chat PENDIENTE, con un aviso
// INTERNO del carrito, para que Rodrigo le mande la plantilla de ayuda con el pago.
//
// Mismo mecanismo que el pedido web sin pagar (avisarPedidoEnInbox): INTERNO,
// nunca ENTRANTE — no abre una ventana de 24 h que no existe.

function autorizado(req) {
  const secreto = String(process.env.CRON_SECRET || '').replace(/[^\x21-\x7E]/g, '')
  if (!secreto) return process.env.VERCEL_ENV !== 'production'
  const cabecera = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return cabecera === `Bearer ${secreto}` || url.searchParams.get('secret') === secreto
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })

  let candidatos
  try {
    candidatos = await listarPosiblesAbandonos()
  } catch (e) {
    await registrarEvento({ fuente: 'supabase', nivel: 'error', mensaje: `cron carritos: ${e.message}` })
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }

  const ahora = Date.now()
  const resultados = []
  for (const c of candidatos.filter((x) => esAbandonado(x, ahora))) {
    const r = await avisarPedidoEnInbox({
      tiendaId: 'MANDARINA',
      telefono: telefonoInbox(c.cliente.celular),
      nombre: [c.cliente.nombre, c.cliente.apellido].filter(Boolean).join(' ') || null,
      waMessageId: idAvisoAbandono(c.id),
      texto: textoAbandono(c),
      direccion: DIRECCION_INTERNO,
      tipo: TIPO_PEDIDO_WEB,
      canalPorDefecto: CANAL_POR_DEFECTO.MANDI,
    })
    if (r?.ok) {
      await actualizarCheckout(c.id, { aviso_abandono_en: new Date().toISOString() }).catch(() => {})
    } else {
      await registrarEvento({
        fuente: 'otro', nivel: 'aviso',
        mensaje: `Carrito abandonado ${c.id} sin aviso al inbox: ${r?.motivo || 'desconocido'}`,
      })
    }
    resultados.push({ id: c.id, ok: !!r?.ok, motivo: r?.motivo || null })
  }

  return Response.json({ ok: true, revisados: candidatos.length, avisados: resultados.filter((r) => r.ok).length, resultados })
}
