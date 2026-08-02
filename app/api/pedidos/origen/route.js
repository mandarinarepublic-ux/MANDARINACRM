// app/api/pedidos/origen/route.js
export const dynamic = 'force-dynamic'

import { getSupabase } from '@/lib/supabase'

/**
 * GET /api/pedidos/origen?pedidoId=MAN-JAC-5497
 *
 * De dónde vino esta venta, con el arte del anuncio si vino de uno.
 *
 * Lee las columnas `origen_*` que se congelaron al grabar el pedido — NO
 * recalcula el cruce. Esa es la gracia: la ficha muestra lo que se decidió
 * entonces (y lo que se le reportó a Meta), no lo que daría el cruce de hoy.
 *
 * No es ADMIN a propósito: lo puede ver cualquiera que ya tenga acceso a la
 * ficha del pedido. No expone nada que no esté en esa pantalla, salvo de qué
 * anuncio vino, que es justo lo que el vendedor gana con esto.
 */
export async function GET(req) {
  const pedidoId = new URL(req.url).searchParams.get('pedidoId')
  if (!pedidoId) return Response.json({ error: 'Falta pedidoId' }, { status: 400 })

  try {
    const sb = getSupabase()
    const { data: p, error } = await sb
      .from('pedidos')
      .select('pedido_id, tienda_id, origen, origen_ad_id, origen_ctwa_clid, origen_telefono, origen_at')
      .eq('pedido_id', pedidoId)
      .maybeSingle()
    if (error) throw error
    if (!p) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const out = {
      origen: p.origen,
      telefonoChat: p.origen_telefono,
      tieneClid: Boolean(p.origen_ctwa_clid),
      resueltoEn: p.origen_at,
      anuncio: null,
    }

    // El arte del anuncio. Se toma la fila MÁS RECIENTE de pauta_dia: hay una
    // por día y el nombre o el creativo pueden haber cambiado; la última es la
    // que refleja cómo se ve hoy en Meta.
    if (p.origen_ad_id) {
      const { data: ad } = await sb
        .from('pauta_dia')
        .select('ad_id, ad_nombre, campaign_nombre, adset_nombre, estado, arte_url, arte_tipo, arte_texto, arte_titular')
        .eq('ad_id', p.origen_ad_id)
        .order('fecha', { ascending: false })
        .limit(1)

      const a = ad?.[0]
      out.anuncio = a
        ? {
            adId: a.ad_id, nombre: a.ad_nombre, campana: a.campaign_nombre,
            conjunto: a.adset_nombre, estado: a.estado,
            arteUrl: a.arte_url, arteTipo: a.arte_tipo,
            arteTexto: a.arte_texto, arteTitular: a.arte_titular,
          }
        // El anuncio existe pero el cron no lo ha traído (o es de una cuenta que
        // no está mapeada). Se devuelve el id igual: es mejor que un hueco.
        : { adId: p.origen_ad_id, nombre: null }
    }

    return Response.json(out)
  } catch (e) {
    console.error('/api/pedidos/origen:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
