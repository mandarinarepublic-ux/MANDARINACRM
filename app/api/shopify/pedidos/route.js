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
  // Shopify manda orders/create Y orders/paid del MISMO pedido con milisegundos
  // de diferencia. Sin ramificar por esto, los dos pasan el select de abajo a
  // la vez y los dos crean un pedido completo — el índice único llega un paso
  // tarde: impide dos FILAS iguales, pero los dos pedidos ya existen.
  const topic = String(req.headers.get('x-shopify-topic') || '').toLowerCase()

  const tienda = tiendaPorDominio(dominio)
  if (!tienda) return Response.json({ error: 'Tienda desconocida' }, { status: 401 })
  if (!await firmaValida(crudo, firma, tienda.clientSecret)) {
    return Response.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let order
  try { order = JSON.parse(crudo) } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400 }) }

  const orderId = String(order.id || '')
  if (!orderId) return Response.json({ error: 'Pedido sin id' }, { status: 400 })

  // ☠️ Red de seguridad: todo lo de acá para abajo puede reventar por algo que
  // no es culpa de Shopify (p.ej. firmarSesion con SESSION_SECRET vacío tira
  // "Zero-length key is not supported"). Sin este catch, un error genérico
  // hace que Shopify reintente 19 veces y termine borrando la suscripción.
  try {
    const sb = getSupabase()

    // ¿Ya entró? Cubre los reintentos de un MISMO tema (p.ej. dos orders/paid
    // del mismo pedido porque Shopify no recibió el 200 a tiempo). El índice
    // único es la red de seguridad real ante dos webhooks simultáneos; esto
    // evita el trabajo (y el aviso duplicado) en el caso normal.
    const { data: yaEsta } = await sb.from('pedidos').select('pedido_id')
      .eq('shopify_order_id', orderId).limit(1)
    if (yaEsta?.length) return ok({ duplicado: true, pedidoId: yaEsta[0].pedido_id })

    if (topic === 'orders/create') {
      // Si ya viene pagado, no se hace nada acá: lo crea orders/paid, que
      // llega aparte. Crear también acá sería el pedido duplicado de siempre.
      if (estaPagado(order)) {
        return ok({ ignorado: true, motivo: 'orders/create pagado; lo crea orders/paid' })
      }
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

    if (topic !== 'orders/paid') {
      // Cualquier otro tema (o ninguno): no hay nada que hacer acá.
      return ok({ ignorado: true, tema: topic || 'sin tema' })
    }

    // orders/paid es el ÚNICO tema que crea el pedido.
    if (!estaPagado(order)) {
      // Defensivo: un orders/paid con financial_status distinto de 'paid'
      // sería un dato raro de Shopify. No se crea nada a ciegas.
      return ok({ ignorado: true, motivo: 'orders/paid pero financial_status no es paid' })
    }

    const payload = mapearPedido(order, tienda.id, fotosDeLineItems(order))

    // Sin prendas, /api/pedidos igual crearía el pedido — y `todosItemsListos`
    // usa `.every()`, que sobre un arreglo vacío da `true`: el pedido se
    // auto-despacharía como si ya estuviera listo, sin que nadie lo tocara.
    if (!payload.items?.length) {
      await notificarPedidoWebFallido({
        tiendaId: tienda.id,
        orderName: order.name,
        motivo: 'pedido sin prendas (line_items vacío)',
      })
      return ok({ creado: false, motivo: 'sin prendas' })
    }

    // Pagado y con prendas: se crea llamando a /api/pedidos como TIENDA WEB.
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
    const { error: errorMarcado } = await sb.from('pedidos')
      .update({ shopify_order_id: orderId, origen: 'tienda_web' })
      .eq('pedido_id', pedidoId)

    if (errorMarcado) {
      // ☠️ El pedido YA existe, creado, pero sin shopify_order_id. Si esto se
      // pierde en silencio, el próximo reintento de Shopify no lo reconoce
      // como duplicado y crea uno segundo. Tiene que hacer ruido para que
      // alguien lo concilie a mano.
      await notificarPedidoWebFallido({
        tiendaId: tienda.id,
        orderName: order.name,
        motivo: `pedido ${pedidoId} creado pero SIN marcar (shopify ${orderId}): ${errorMarcado.message}`,
      })
      return ok({ creado: true, pedidoId, marcado: false })
    }

    return ok({ creado: true, pedidoId, marcado: true })
  } catch (e) {
    const motivo = String(e?.message || e).slice(0, 200)
    await notificarPedidoWebFallido({ tiendaId: tienda.id, orderName: order.name, motivo })
    return ok({ creado: false, motivo })
  }
}

/** La foto del producto, por variante. Viene en el propio webhook cuando existe. */
function fotosDeLineItems(order) {
  const fotos = {}
  for (const li of order.line_items || []) {
    if (li.variant_id && li.image?.src) fotos[String(li.variant_id)] = li.image.src
  }
  return fotos
}
