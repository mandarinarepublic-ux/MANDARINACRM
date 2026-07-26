export const dynamic = 'force-dynamic'
import { requireAdmin } from '@/lib/auth'
import { getPedidoById } from '@/lib/db/pedidos'
import { getClienteById } from '@/lib/db/clientes'
import { enviarPurchase, debeEnviarCapi } from '@/lib/metaCapi'
import { parseFecha } from '@/lib/parseFecha'

/**
 * Reenvía a Meta el Purchase de uno o varios pedidos.
 *
 * El CAPI solo se disparaba al crear el pedido, así que un fallo de Meta (token
 * sin permiso sobre el pixel, caída puntual) se perdía para siempre. Esto permite
 * reintentarlo desde el tablero de errores.
 *
 * Es seguro repetirlo: el event_id es el PEDIDO_ID, así que Meta deduplica y un
 * pedido que ya entró no se cuenta dos veces.
 *
 * Se manda la fecha REAL de la venta (no la de ahora) para que Meta la atribuya
 * al día que ocurrió. Meta rechaza eventos de más de 7 días: los más viejos
 * devuelven error y se informan tal cual, sin inventar que se enviaron.
 */
export async function POST(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.pedidoIds) ? [...new Set(body.pedidoIds.filter(Boolean))] : []

  if (ids.length === 0) return Response.json({ error: 'Manda pedidoIds' }, { status: 400 })
  if (ids.length > 50) return Response.json({ error: 'Máximo 50 pedidos por tanda' }, { status: 400 })

  const resultados = []
  for (const id of ids) {
    try {
      const pedido = await getPedidoById(id)
      if (!pedido) { resultados.push({ pedidoId: id, ok: false, error: 'Pedido no encontrado' }); continue }

      if (!debeEnviarCapi(pedido.TIENDA_ID)) {
        resultados.push({ pedidoId: id, ok: true, omitido: 'YAW no pauta en Meta' })
        continue
      }

      // El join del pedido trae nombre/cédula/celular; email y ciudad hay que
      // leerlos del cliente y suman al matching de Meta.
      const c = await getClienteById(pedido.CLIENTE_ID).catch(() => null)
      const cliente = {
        nombre:  c?.NOMBRE  || pedido.CLIENTE_NOMBRE  || '',
        cedula:  c?.CEDULA  || pedido.CLIENTE_CEDULA  || '',
        celular: c?.CELULAR || pedido.CLIENTE_CELULAR || '',
        email:   c?.EMAIL   || '',
        ciudad:  c?.CIUDAD  || '',
      }

      const fecha = parseFecha(pedido.FECHA_PEDIDO)
      const eventTime = fecha && !isNaN(fecha) ? Math.floor(fecha.getTime() / 1000) : undefined

      const r = await enviarPurchase({
        pedidoId: id,
        tiendaId: pedido.TIENDA_ID,
        cliente,
        montoTotal: pedido.MONTO_TOTAL,
        eventTime,
      })
      resultados.push({ pedidoId: id, tienda: pedido.TIENDA_ID, ...r })
    } catch (e) {
      resultados.push({ pedidoId: id, ok: false, error: e?.message || 'Error inesperado' })
    }
  }

  return Response.json({
    enviados: resultados.filter(r => r.ok && !r.omitido).length,
    omitidos: resultados.filter(r => r.omitido).length,
    fallidos: resultados.filter(r => !r.ok).length,
    resultados,
  })
}
