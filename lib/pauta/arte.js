// lib/pauta/arte.js — Guardar el arte de los anuncios en Cloudinary.
//
// POR QUÉ: `arte_url` viene del CDN de Meta y esas URL CADUCAN. Hoy se ven; en
// unos meses el tablero y la ficha del pedido mostrarían imágenes rotas, sin
// ningún error visible y sin forma de recuperarlas — el anuncio pudo haberse
// borrado hace rato. Lo que no está en nuestro almacenamiento no es nuestro.
//
// (Es la misma lección que dejó el 27-jul con las fotos de WhatsApp: cuando el
// número se rompió, la API de media de Meta empezó a devolver 500 y los archivos
// que solo vivían en su CDN se perdieron para siempre.)
//
// Cloudinary y no Supabase Storage porque el CRM ya lo usa para las fotos de los
// pedidos: código probado, credenciales puestas, y esto son ~57 imágenes contra
// las miles que ya sube. No vale la pena un segundo almacenamiento.
//
// El arte pertenece al ANUNCIO, no al día. Se archiva una vez por ad_id y se
// escribe la URL nueva en TODAS sus filas de pauta_dia.

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/arte.js es server-only.')
}

import { getSupabase } from '../supabase.js'
import { uploadToCloudinary } from '../cloudinary.js'

const CARPETA = 'mandarina-pro/pauta'

/**
 * Cuántos anuncios se archivan por corrida.
 *
 * El cron tiene maxDuration 60 s y cada imagen son dos viajes (bajar de Meta,
 * subir a Cloudinary). Con el atraso inicial de ~57 anuncios, hacerlos todos de
 * una lo mataría a la mitad y no quedaría constancia de cuáles alcanzó. Se hace
 * de a poco y el cron diario termina el resto en unos días; los anuncios nuevos
 * (uno o dos por día) se archivan el mismo día.
 */
const POR_CORRIDA = Number(process.env.PAUTA_ARTE_POR_CORRIDA || 10)

/** ¿Ya está en nuestro almacenamiento? */
function esNuestra(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com')
}

/**
 * Archiva el arte que todavía apunta al CDN de Meta.
 *
 * No lanza nunca: si Cloudinary falla, las filas se quedan con la URL de Meta
 * —que hoy funciona— y se reintenta en la próxima corrida. Perder el archivado
 * no puede costar la actualización del gasto, que es lo importante del cron.
 *
 * @returns {Promise<{archivados:number, pendientes:number, errores:string[]}>}
 */
export async function archivarArtePendiente() {
  const res = { archivados: 0, pendientes: 0, errores: [] }
  try {
    const sb = getSupabase()

    // Un anuncio puede tener muchas filas (una por día); interesa el ad_id.
    const { data, error } = await sb
      .from('pauta_dia')
      .select('ad_id, arte_url, arte_tipo')
      .not('arte_url', 'is', null)
    if (error) throw error

    const porAd = new Map()
    for (const f of data || []) {
      if (esNuestra(f.arte_url)) continue          // ya archivada
      if (!porAd.has(f.ad_id)) porAd.set(f.ad_id, f.arte_url)
    }

    const pendientes = [...porAd.entries()]
    res.pendientes = pendientes.length
    const tanda = pendientes.slice(0, POR_CORRIDA)

    for (const [adId, urlMeta] of tanda) {
      try {
        const r = await fetch(urlMeta)
        if (!r.ok) throw new Error(`bajar de Meta: HTTP ${r.status}`)
        const buf = Buffer.from(await r.arrayBuffer())
        const tipo = r.headers.get('content-type') || 'image/jpeg'
        const base64 = `data:${tipo};base64,${buf.toString('base64')}`

        // public_id determinístico por anuncio: volver a subirlo lo reemplaza en
        // vez de acumular copias.
        const { url } = await uploadToCloudinary(base64, `ad-${adId}`, CARPETA)
        if (!url) throw new Error('Cloudinary no devolvió URL')

        // Se escribe en TODAS las filas del anuncio: el arte es del anuncio, no
        // del día, y el tablero lee la fila más reciente de cada uno.
        const { error: e2 } = await sb
          .from('pauta_dia').update({ arte_url: url }).eq('ad_id', adId)
        if (e2) throw new Error(e2.message)

        res.archivados++
      } catch (e) {
        res.errores.push(`${adId}: ${e.message}`)
      }
    }

    res.pendientes -= res.archivados
    return res
  } catch (e) {
    res.errores.push(e.message)
    return res
  }
}
