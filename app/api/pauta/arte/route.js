// app/api/pauta/arte/route.js — Administrar a mano el arte de los anuncios.
//
// Existe porque el archivado automático puede fallar y de hecho falla: hay 11
// anuncios que se suben a Cloudinary y cuya marca no queda guardada, por una
// causa que no se logró aislar. Antes eso era invisible (el cron reportaba
// éxito) y no había forma de arreglarlo sin tocar la base a mano.
//
// GET  → qué anuncios tienen arte, cuáles faltan y cuáles fallaron
// POST → subir una imagen a mano para un anuncio
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { requireAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { registrarEvento } from '@/lib/eventos'

const CARPETA = 'mandarina-pro/pauta'

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const sb = getSupabase()
    // Una fila por anuncio: la más reciente, que es la que muestra el tablero.
    const { data, error } = await sb
      .from('pauta_dia')
      .select('ad_id, ad_nombre, tienda_id, arte_url, arte_tipo, arte_titular, arte_archivada_at, fecha, gasto')
      .order('fecha', { ascending: false })
    if (error) throw error

    const porAd = new Map()
    for (const f of data || []) {
      const a = porAd.get(f.ad_id)
      if (!a) {
        porAd.set(f.ad_id, {
          adId: f.ad_id, nombre: f.ad_nombre, tienda: f.tienda_id,
          arteUrl: f.arte_url, arteTipo: f.arte_tipo, titular: f.arte_titular,
          archivada: Boolean(f.arte_archivada_at), gasto: Number(f.gasto || 0),
        })
      } else {
        a.gasto += Number(f.gasto || 0)
        // Con que UNA fila esté archivada, el anuncio cuenta como resuelto.
        if (f.arte_archivada_at) a.archivada = true
      }
    }

    const anuncios = [...porAd.values()].map((a) => ({
      ...a,
      // Tres estados, y la diferencia importa: sin arte no hay nada que subir
      // salvo a mano; "en Meta" se ve hoy pero puede caducar; "a salvo" es
      // nuestro.
      estado: !a.arteUrl ? 'sin_arte' : a.archivada ? 'a_salvo' : 'en_meta',
    })).sort((x, y) => y.gasto - x.gasto)

    return Response.json({
      anuncios,
      resumen: {
        aSalvo: anuncios.filter((a) => a.estado === 'a_salvo').length,
        enMeta: anuncios.filter((a) => a.estado === 'en_meta').length,
        sinArte: anuncios.filter((a) => a.estado === 'sin_arte').length,
      },
    })
  } catch (e) {
    console.error('/api/pauta/arte GET:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

/** Sube una imagen a mano y la deja como arte del anuncio. */
export async function POST(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    const { adId, imagen } = await req.json()
    if (!adId || !imagen) {
      return Response.json({ error: 'Faltan adId e imagen' }, { status: 400 })
    }
    if (!String(imagen).startsWith('data:')) {
      return Response.json({ error: 'La imagen tiene que venir en base64' }, { status: 400 })
    }

    const sb = getSupabase()
    const { data: existe } = await sb
      .from('pauta_dia').select('ad_id').eq('ad_id', adId).limit(1)
    if (!existe?.length) {
      return Response.json({ error: `El anuncio ${adId} no está en pauta_dia` }, { status: 404 })
    }

    // Mismo public_id que usa el archivador automático: si mañana el automático
    // funciona para este anuncio, reemplaza esta imagen en vez de duplicarla.
    const { url } = await uploadToCloudinary(imagen, `ad-${adId}`, CARPETA)
    if (!url) throw new Error('Cloudinary no devolvió URL')

    const { data: tocadas, error } = await sb
      .from('pauta_dia')
      .update({ arte_url: url, arte_tipo: 'imagen', arte_archivada_at: new Date().toISOString() })
      .eq('ad_id', adId)
      .select('ad_id')
    if (error) throw error
    if (!tocadas?.length) throw new Error('el update no modificó ninguna fila')

    await registrarEvento({
      fuente: 'meta', nivel: 'ok',
      mensaje: `Arte de pauta subido a mano (${adId})`,
      detalle: { adId, filas: tocadas.length },
    })

    return Response.json({ ok: true, adId, url, filas: tocadas.length })
  } catch (e) {
    console.error('/api/pauta/arte POST:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
