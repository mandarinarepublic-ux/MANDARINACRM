// lib/pauta/meta.js
// Lectura de la Marketing API de Meta (Insights a nivel de anuncio).
//
// Es el hermano de lib/metaCapi.js: aquel ESCRIBE eventos de compra, este LEE
// el gasto. Se mantienen separados porque usan tokens y permisos distintos:
// CAPI necesita permisos de dataset, esto necesita `ads_read`.

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/meta.js es server-only: nunca lo importes en el navegador.')
}

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * El token, limpio. Si se carga a Vercel desde PowerShell le queda un BOM
 * invisible al inicio y Meta responde 400 sin explicar por qué. Mismo tratamiento
 * que middleware.js le da a CRM_API_TOKEN.
 */
function token() {
  const t = String(process.env.META_ADS_TOKEN || '').replace(/[^\x21-\x7E]/g, '')
  if (!t) throw new Error('Falta META_ADS_TOKEN')
  return t
}

/** Meta devuelve las acciones como lista de {action_type, value}. Esto busca una. */
function accion(lista, tipo) {
  const found = (lista || []).find((a) => a.action_type === tipo)
  return found ? Number(found.value) : 0
}

/**
 * Gasto e Insights por anuncio y por día.
 *
 * `time_increment: 1` hace que Meta devuelva UNA fila por día por anuncio, que es
 * exactamente la llave de crm.pauta_dia.
 */
export async function traerGastoDiario({ adAccountId, desde, hasta }) {
  const url = new URL(`${GRAPH}/act_${adAccountId}/insights`)
  url.searchParams.set('access_token', token())
  url.searchParams.set('level', 'ad')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since: desde, until: hasta }))
  // Meta EXCLUYE de los Insights los anuncios ARCHIVED y DELETED salvo que se
  // pidan por nombre explícito. Comprobado el 30-jul: el anuncio que más
  // conversaciones trajo a IND (120249663261930600, "DUO PERFECTO", $82,33 y
  // 72.666 impresiones) está ARCHIVED y no aparecía en NINGUNA consulta sin este
  // filtro. Sin él, su gasto desaparece del tablero y su ROAS sale infinito —
  // exactamente el error que este tablero existe para evitar.
  url.searchParams.set('filtering', JSON.stringify([
    { field: 'ad.effective_status', operator: 'IN', value: [
      'ACTIVE', 'PAUSED', 'DELETED', 'PENDING_REVIEW', 'DISAPPROVED',
      'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ARCHIVED',
      'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES',
    ] },
  ]))
  url.searchParams.set('limit', '500')
  url.searchParams.set('fields', [
    'date_start', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
    'campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks',
    'actions', 'action_values', 'purchase_roas',
  ].join(','))

  const filas = []
  let siguiente = url.toString()

  while (siguiente) {
    const r = await fetch(siguiente)
    const j = await r.json()
    if (j.error) throw new Error(`Insights de act_${adAccountId}: ${j.error.message}`)

    for (const d of j.data || []) {
      filas.push({
        fecha: d.date_start,
        adId: d.ad_id,
        adNombre: d.ad_name || '',
        adsetId: d.adset_id || '',
        adsetNombre: d.adset_name || '',
        campaignId: d.campaign_id || '',
        campaignNombre: d.campaign_name || '',
        gasto: Number(d.spend || 0),
        impresiones: Number(d.impressions || 0),
        clics: Number(d.clicks || 0),
        // Las conversaciones de WhatsApp iniciadas: el "lead" según Meta.
        conversaciones: accion(d.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        valorMeta: accion(d.action_values, 'omni_purchase') || null,
        roasMeta: d.purchase_roas?.[0]?.value ? Number(d.purchase_roas[0].value) : null,
      })
    }
    siguiente = j.paging?.next || null
  }

  return filas
}

/**
 * Estado y creatividad de un anuncio. Va aparte de los Insights porque son
 * atributos, no métricas, y no cambian por día.
 */
export async function traerDetalleAnuncios(adAccountId, adIds) {
  if (!adIds?.length) return new Map()
  const url = new URL(`${GRAPH}/act_${adAccountId}/ads`)
  url.searchParams.set('access_token', token())
  url.searchParams.set('limit', '500')
  url.searchParams.set('fields', 'id,name,effective_status,creative{id,thumbnail_url}')

  const porId = new Map()
  let siguiente = url.toString()
  while (siguiente) {
    const r = await fetch(siguiente)
    const j = await r.json()
    if (j.error) throw new Error(`Anuncios de act_${adAccountId}: ${j.error.message}`)
    for (const a of j.data || []) {
      if (!adIds.includes(a.id)) continue
      porId.set(a.id, {
        estado: a.effective_status || '',
        creativeId: a.creative?.id || '',
        thumbnailUrl: a.creative?.thumbnail_url || '',
      })
    }
    siguiente = j.paging?.next || null
  }
  return porId
}
