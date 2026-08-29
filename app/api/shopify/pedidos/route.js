export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { tiendaPorDominio, firmaValida } from '@/lib/shopifyWebhook'
import { mapearPedido, estaPagado, normalizarCelular } from '@/lib/shopifyPedido'
import { notificarPedidoWebSinPagar, notificarPedidoWebFallido } from '@/lib/telegram'
import { firmarSesion, secretoSesion, COOKIE_SESION } from '@/lib/sesion'
import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'

// A Shopify SIEMPRE 200 cuando ya se hizo lo que había que hacer: si se le
// devuelve error, reintenta 19 veces y termina borrando la suscripción sola.
const ok = (detalle) => Response.json({ ok: true, ...detalle })

export async function POST(req) {
  // 1) CUERPO CRUDO. Parsear antes rompe la firma.
  const crudo = await req.text()
  const dominio = req.headers.get('x-shopify-shop-domain')
  const firma = req.headers.get('x-shopify-hmac-sha256')

  const tienda = tiendaPorDominio(dominio)
  if (!tienda) return Response.json({ error: 'Tienda desconocida' }, { status: 401 })
  if (!await firmaValida(crudo, firma, tienda.clientSecret)) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let order
  try { order = JSON.parse(crudo) } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const orderId = String(order.id || '')
  if (!orderId) return Response.json({ error: 'Pedido sin id' }, { status: 400 })

  // 2) ¿Ya entró? Shopify reintenta y manda orders/create + orders/paid.
  const sb = getSupabase()
  const { data: yaEsta } = await sb.from('pedidos').select('pedido_id')
    .eq('shopify_order_id', orderId).limit(1)
  if (yaEsta?.length) return ok({ duplicado: true, pedidoId: yaEsta[0].pedido_id })

  // 3) Sin pagar: NO entra al CRM, solo avisa. Si después paga, orders/paid lo trae.
  if (!estaPagado(order)) {
    const env = order.shipping_address || {}
    await notificarPedidoWebSinPagar({
      tiendaId: tienda.id,
      nombre: env.name || order.customer?.first_name,
      celular: normalizarCelular(env.phone || order.customer?.phone),
      monto: order.total_price,
      prendas: (order.line_items || []).reduce((s, i) => s + (i.quantity || 1), 0),
      urlShopify: order.order_status_url || '',
    })
    return ok({ sinPagar: true })
  }

  // 4) Pagado: se crea llamando a /api/pedidos como el usuario TIENDA WEB.
  const payload = mapearPedido(order, tienda.id, fotosDeLineItems(order))
  const token = await firmarSesion({ id: process.env.SHOPIFY_VENDEDOR_USUARIO_ID }, secretoSesion(), 1)
  const base = process.env.CRM_BASE_URL || `https://${req.headers.get('host')}`

  const res = await fetch(`${base}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_SESION}=${token}` },
    body: JSON.stringify(payload),
  })

  // ☠️ LINKPAGO: un 401 NO lanza. Sin mirar res.ok el fallo se descarta solo.
  if (!res.ok) {
    const motivo = `${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`
    await notificarPedidoWebFallido({ tiendaId: tienda.id, orderName: order.name, motivo })
    await registrarEvento({ fuente: 'shopify', nivel: 'error', mensaje: `Pedido web ${order.name}: ${motivo}` })
    return ok({ creado: false, motivo })
  }

  const { pedidoId } = await res.json()
  // `origen` NO se puede mandar en el cuerpo: /api/pedidos no lo acepta (lo
  // calcula el servidor). Se marca acá, junto con el id de Shopify.
  await sb.from('pedidos')
    .update({ shopify_order_id: orderId, origen: 'tienda_web' })
    .eq('pedido_id', pedidoId)
  return ok({ creado: true, pedidoId })
}

/** La foto del producto, por variante. Viene en el propio webhook cuando existe. */
function fotosDeLineItems(order) {
  const fotos = {}
  for (const li of order.line_items || []) {
    if (li.variant_id && li.image?.src) fotos[String(li.variant_id)] = li.image.src
  }
  return fotos
}
