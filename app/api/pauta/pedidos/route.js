// app/api/pauta/pedidos/route.js
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { pedidosDeAnuncio, pedidosPorOrigen } from '@/lib/pauta/consultas'
import { TIENDAS, FECHA_PISO } from '@/lib/pauta/constantes'
import { hoyEcuador } from '@/lib/parseFecha'

const ORIGENES = ['digital_a_fisico', 'por_chat', 'cliente_de_paso', 'chat_sin_pauta', 'sin_rastro']

/**
 * El detalle detrás de un número del tablero. Dos formas de pedirlo:
 *
 *   ?anuncio=<ad_id>   los pedidos que produjo ESE anuncio
 *   ?origen=<origen>   los pedidos de esa categoría
 *
 * SOLO ADMIN, igual que /api/pauta: acá salen nombres, celulares y montos de
 * clientes. La frontera es la ruta, no la pantalla.
 */
export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const tienda = searchParams.get('tienda') || TIENDAS[0].id
  const desde = searchParams.get('desde') || FECHA_PISO
  const hasta = searchParams.get('hasta') || hoyEcuador()
  const anuncio = searchParams.get('anuncio')
  const origen = searchParams.get('origen')

  if (!TIENDAS.some((t) => t.id === tienda)) {
    return Response.json({ error: `Tienda desconocida: ${tienda}` }, { status: 400 })
  }
  if (!anuncio && !origen) {
    return Response.json({ error: 'Falta ?anuncio= o ?origen=' }, { status: 400 })
  }
  // Lista blanca: el origen entra en una consulta a la base.
  if (origen && !ORIGENES.includes(origen)) {
    return Response.json({ error: `Origen desconocido: ${origen}` }, { status: 400 })
  }

  try {
    const pedidos = anuncio
      ? await pedidosDeAnuncio({ tienda, desde, hasta, adId: anuncio })
      : await pedidosPorOrigen({ tienda, desde, hasta, origen })
    return Response.json({ pedidos })
  } catch (e) {
    console.error('/api/pauta/pedidos:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
