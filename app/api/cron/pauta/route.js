export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'
import { traerGastoDiario, traerDetalleAnuncios } from '@/lib/pauta/meta'
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

async function correr() {
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

  return resumen
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  try {
    return Response.json(await correr())
  } catch (e) {
    await registrarEvento({ fuente: 'meta', nivel: 'error', mensaje: `Cron de pauta: ${e.message}` })
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
