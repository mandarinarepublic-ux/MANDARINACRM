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
        // LAS COLUMNAS DE ARTE NO VAN ACÁ. Ver la nota de abajo.
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

      // EL ARTE SE ESCRIBE ACÁ, NUNCA EN EL UPSERT.
      //
      // Esta fue la lección más cara del día. El upsert de PostgREST usa
      // `merge-duplicates`, que reescribe TODAS las columnas de la fila: las que
      // no van en el payload vuelven a su valor por defecto, o sea NULL. No es
      // un update parcial, como yo asumía.
      //
      // Con las columnas de arte en el payload, cada corrida le borraba a las
      // filas de los últimos 3 días la URL de Cloudinary y la marca de
      // archivado. El archivador las veía pendientes, las volvía a subir, y la
      // corrida siguiente lo deshacía. Para siempre, sin un solo error, porque
      // cada paso por separado funcionaba. Costó cinco diagnósticos equivocados,
      // todos buscando en la SELECCIÓN cuando el problema estaba en la ESCRITURA.
      //
      // La pista fue que los anuncios FUERA de la ventana de 3 días sí quedaban
      // archivados y los de adentro rebotaban: solo lo explica algo que
      // reescribe justo esa ventana.
      //
      // Ahora las columnas de arte NO están en el upsert y solo se tocan acá,
      // con `.is('arte_url', null)`: se llenan una vez y nadie las vuelve a
      // pisar. El bucle deja de ser posible por construcción, no por cuidado.
      {
        const sinArte = await adsSinArte(sb, c.ad_account_id)
        // `arteViejo` amplía la búsqueda a los anuncios fuera de la ventana; sin
        // el flag solo se piden los del lote que ya se trajo, que es gratis.
        const faltantes = arteViejo ? sinArte : sinArte.filter((id) => adIds.includes(id))
        if (faltantes.length) {
          const det = arteViejo
            ? await traerDetalleAnuncios(c.ad_account_id, faltantes)
            : detalle
          // Si el anuncio YA tiene su arte a salvo, la fila nueva hereda ESA
          // imagen y su marca — no la de Meta.
          //
          // Acá estaba el bucle que costó el día entero. Cada corrida crea una
          // fila nueva para el día de hoy (sin arte, porque las columnas de arte
          // salieron del upsert). Este bloque la rellenaba con la URL de Meta y
          // SIN marca de archivado, así que el anuncio volvía a contar como
          // pendiente: el archivador lo re-subía, marcaba, y al día siguiente
          // otra fila nueva lo devolvía a pendiente. Para siempre.
          //
          // La pista fue que los anuncios FUERA de la ventana de 3 días quedaban
          // archivados y los de adentro rebotaban: solo los de adentro generan
          // filas nuevas.
          const yaASalvo = new Map()
          {
            const { data: prev } = await sb
              .from('pauta_dia').select('ad_id, arte_url, arte_archivada_at')
              .in('ad_id', faltantes).not('arte_archivada_at', 'is', null)
            for (const p of prev || []) {
              yaASalvo.set(p.ad_id, { url: p.arte_url, at: p.arte_archivada_at })
            }
          }

          let tocados = 0
          for (const [adId, d] of det) {
            const salvo = yaASalvo.get(adId)
            if (!salvo && !d.arteUrl && !d.arteTexto && !d.arteTitular) continue
            const { error: e3 } = await sb.from('pauta_dia').update({
              arte_url:  salvo?.url || d.arteUrl || null,
              arte_archivada_at: salvo?.at || null,
              arte_tipo: d.arteTipo || null,
              arte_texto: d.arteTexto || null, arte_titular: d.arteTitular || null,
            }).eq('ad_id', adId).is('arte_url', null)
            if (!e3) tocados++
          }
          resumen.arteNuevo = (resumen.arteNuevo || 0) + tocados
          // Los que Meta ya no devuelve (borrados de verdad) se informan: si no,
          // parecería que quedaron pendientes cuando no hay nada que traer.
          resumen.arteViejoSinRespuesta =
            (resumen.arteViejoSinRespuesta || 0) + (faltantes.length - det.size)
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
  //
  // Estuvo en pausa unas horas el 2-ago mientras se buscaba el bucle: el
  // archivador guardaba la imagen, la marcaba, y en la corrida siguiente el
  // anuncio volvía a aparecer pendiente.
  //
  // LA CAUSA era el bloque de arriba, no este. Cada corrida crea una fila nueva
  // para el día de hoy sin arte, y ese bloque la rellenaba con la URL de Meta y
  // SIN la marca de archivado, así que el anuncio volvía a contar como
  // pendiente. Ahora hereda la imagen y la marca del arte ya guardado.
  //
  // Se deja el interruptor por si hiciera falta frenarlo: PAUTA_ARCHIVAR_AUTO=0.
  try {
    if (process.env.PAUTA_ARCHIVAR_AUTO === '0') {
      resumen.arte = { apagado: 'archivado automático frenado a mano (PAUTA_ARCHIVAR_AUTO=0)' }
      return resumen
    }
    resumen.arte = await archivarArtePendiente()
    // Los pendientes van en la respuesta a propósito: un tope silencioso se lee
    // como "ya está todo" cuando no lo está.
    // Nivel 'error', no 'aviso': un arte que no se guarda es una imagen que se
    // va a perder cuando Meta caduque la URL, y hay una pantalla donde
    // arreglarlo (/dashboard/pauta/artes). Un aviso no se mira; un error sí, y
    // además dispara la alerta de Telegram.
    if (resumen.arte.errores.length) {
      await registrarEvento({
        fuente: 'meta', nivel: 'error',
        mensaje: `Arte de pauta: ${resumen.arte.errores.length} anuncio(s) no se pudieron guardar. ` +
                 `Se pueden subir a mano en /dashboard/pauta/artes`,
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
