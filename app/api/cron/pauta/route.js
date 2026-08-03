export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'
import { traerGastoDiario, traerDetalleAnuncios } from '@/lib/pauta/meta'
import { archivarArtePendiente } from '@/lib/pauta/arte'
import { hoyEcuador, isoMasDias } from '@/lib/parseFecha'

// Baja el gasto de Meta a crm.pauta_dia.
//
// Refresca los últimos DIAS_REFRESCO días, no solo ayer: Meta sigue ajustando
// las cifras recientes durante ~3 días. Bajar solo el último día dejaría los
// anteriores congelados con datos provisionales.
const DIAS_REFRESCO = 3

// El cron de Vercel manda Authorization: Bearer $CRON_SECRET.
//
// Sin CRON_SECRET esto DEVOLVÍA TRUE, o sea que la ruta quedaba abierta a
// internet. Se verificó el 2-ago: un GET sin credenciales desde fuera respondió
// 200. Como la respuesta trae el gasto por cuenta publicitaria, eso es dejar los
// números del negocio a la vista de cualquiera que adivine la URL — y este repo
// es público. Además cada llamada quema cuota de la API de Meta.
//
// Ahora falla cerrado en producción: si no hay secreto configurado, no entra
// nadie. En local (sin VERCEL_ENV) se sigue permitiendo, que es para lo que
// servía la excepción.
function autorizado(req) {
  const secreto = String(process.env.CRON_SECRET || '').replace(/[^\x21-\x7E]/g, '')
  if (!secreto) return process.env.VERCEL_ENV !== 'production'
  const cabecera = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return cabecera === `Bearer ${secreto}` || url.searchParams.get('secret') === secreto
}

/**
 * Los anuncios que ya están en pauta_dia y todavía no tienen arte.
 *
 * El cron normal solo mira los últimos 3 días, así que los anuncios viejos se
 * quedaron con arte_url en NULL para siempre: su gasto está, pero no hay imagen
 * que mostrar en el tablero ni en la ficha del pedido. Esto los recupera de una,
 * y después el archivador los sube a Cloudinary como a cualquier otro.
 *
 * Se pide con ?arteViejo=1. Es de una sola vez: cuando no queden anuncios sin
 * arte, devuelve la lista vacía y no hace ninguna llamada a Meta.
 */
async function adsSinArte(sb, adAccountId) {
  const { data } = await sb
    .from('pauta_dia').select('ad_id')
    .eq('ad_account_id', adAccountId).is('arte_url', null)
  return [...new Set((data || []).map((f) => f.ad_id))]
}

async function correr({ arteViejo = false } = {}) {
  const sb = getSupabase()
  const { data: cuentas, error } = await sb
    .from('pauta_cuentas').select('*').eq('activa', true)
  if (error) throw new Error(`No se pudo leer pauta_cuentas: ${error.message}`)
  if (!cuentas?.length) throw new Error('crm.pauta_cuentas está vacía: corre primero la Tarea 1')

  // Aritmética de fechas pura en UTC (isoMasDias), nunca Date local + slice: ya nos
  // costó caro mezclar hora local con offset explícito (ver lib/parseFecha.js).
  const hasta = hoyEcuador()
  const desde = isoMasDias(hasta, -DIAS_REFRESCO)
  const resumen = { desde, hasta, cuentas: [], filas: 0, errores: [] }

  for (const c of cuentas) {
    try {
      const filas = await traerGastoDiario({ adAccountId: c.ad_account_id, desde, hasta })
      const adIds = [...new Set(filas.map((f) => f.adId))]
      const detalle = await traerDetalleAnuncios(c.ad_account_id, adIds)

      // El arte que YA está en Cloudinary no se pisa.
      //
      // El cron refresca los últimos 3 días, así que sin esto cada corrida
      // sobreescribiría `arte_url` con la URL de Meta y desharía el archivado de
      // la vuelta anterior — un ciclo infinito de archivar y perder, que además
      // no daría ningún error. Lo archivado gana siempre: es lo que no caduca.
      const yaArchivada = new Map()
      {
        const { data: previas } = await sb
          .from('pauta_dia').select('ad_id, arte_url')
          .in('ad_id', adIds).ilike('arte_url', '%res.cloudinary.com%')
        for (const p of previas || []) yaArchivada.set(p.ad_id, p.arte_url)
      }

      const registros = filas.map((f) => ({
        fecha: f.fecha,
        ad_id: f.adId,
        ad_account_id: c.ad_account_id,
        tienda_id: c.tienda_id,
        campaign_id: f.campaignId,
        campaign_nombre: f.campaignNombre,
        adset_id: f.adsetId,
        adset_nombre: f.adsetNombre,
        ad_nombre: f.adNombre,
        estado: detalle.get(f.adId)?.estado || '',
        gasto: f.gasto,
        impresiones: f.impresiones,
        clics: f.clics,
        conversaciones_meta: f.conversaciones,
        valor_meta: f.valorMeta,
        roas_meta: f.roasMeta,
        creative_id: detalle.get(f.adId)?.creativeId || '',
        // El ARTE. Sin esto las columnas quedaban NULL y el tablero mostraba un
        // ad_id que no le dice nada a nadie; el punto era poder VER qué imagen
        // produjo la venta. `|| null` y no `|| ''`: una cadena vacía se leería
        // como "hay arte y está en blanco".
        arte_url:     yaArchivada.get(f.adId) || detalle.get(f.adId)?.arteUrl || null,
        arte_tipo:    detalle.get(f.adId)?.arteTipo || null,
        arte_texto:   detalle.get(f.adId)?.arteTexto || null,
        arte_titular: detalle.get(f.adId)?.arteTitular || null,
        actualizado_at: new Date().toISOString(),
      }))

      if (registros.length) {
        // upsert por (fecha, ad_id): volver a correr el cron el mismo día
        // corrige las cifras en vez de duplicarlas.
        const { error: e2 } = await sb
          .from('pauta_dia').upsert(registros, { onConflict: 'fecha,ad_id' })
        if (e2) throw new Error(e2.message)
      }

      resumen.cuentas.push({ cuenta: c.nombre, tienda: c.tienda_id, filas: registros.length })
      resumen.filas += registros.length

      // Recuperar el arte de los anuncios VIEJOS (fuera de la ventana de 3 días).
      // Solo con ?arteViejo=1 y solo mientras queden: es una operación de una vez.
      if (arteViejo) {
        const viejos = await adsSinArte(sb, c.ad_account_id)
        if (viejos.length) {
          const det = await traerDetalleAnuncios(c.ad_account_id, viejos)
          let tocados = 0
          for (const [adId, d] of det) {
            if (!d.arteUrl && !d.arteTexto && !d.arteTitular) continue
            const { error: e3 } = await sb.from('pauta_dia').update({
              arte_url: d.arteUrl || null, arte_tipo: d.arteTipo || null,
              arte_texto: d.arteTexto || null, arte_titular: d.arteTitular || null,
            }).eq('ad_id', adId).is('arte_url', null)
            if (!e3) tocados++
          }
          resumen.arteViejo = (resumen.arteViejo || 0) + tocados
          // Los que Meta ya no devuelve (borrados de verdad) se informan: si no,
          // parecería que quedaron pendientes cuando no hay nada que traer.
          resumen.arteViejoSinRespuesta =
            (resumen.arteViejoSinRespuesta || 0) + (viejos.length - det.size)
        }
      }
    } catch (e) {
      // Una cuenta que falla no debe dejar sin actualizar a las demás.
      resumen.errores.push({ cuenta: c.nombre, error: e.message })
      await registrarEvento({
        fuente: 'meta',
        nivel: 'error',
        mensaje: `Cron de pauta: falló la cuenta ${c.nombre}`,
        detalle: { adAccountId: c.ad_account_id, error: e.message },
      })
    }
  }

  // Guardar el arte en Cloudinary. Va DESPUÉS de escribir el gasto y en su
  // propio try: las URL de Meta caducan, pero el gasto es lo importante del
  // cron y no puede quedarse sin actualizar porque falle una subida.
  //
  // Se archiva de a poco (ver POR_CORRIDA): el cron tiene 60 s y cada imagen son
  // dos viajes. El atraso inicial de ~57 anuncios se termina en unos días y los
  // nuevos se archivan el mismo día.
  try {
    resumen.arte = await archivarArtePendiente()
    // Los pendientes van en la respuesta a propósito: un tope silencioso se lee
    // como "ya está todo" cuando no lo está.
    if (resumen.arte.errores.length) {
      await registrarEvento({
        fuente: 'meta', nivel: 'aviso',
        mensaje: `Arte de pauta: ${resumen.arte.errores.length} no se pudieron archivar`,
        detalle: { errores: resumen.arte.errores.slice(0, 10) },
      })
    }
  } catch (e) {
    resumen.arte = { error: e.message }
  }

  return resumen
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  try {
    const arteViejo = new URL(req.url).searchParams.get('arteViejo') === '1'
    return Response.json(await correr({ arteViejo }))
  } catch (e) {
    await registrarEvento({ fuente: 'meta', nivel: 'error', mensaje: `Cron de pauta: ${e.message}` })
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
