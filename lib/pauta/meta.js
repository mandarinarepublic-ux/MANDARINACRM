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

/** `YYYY-MM-DD` uno por uno entre `desde` y `hasta`, ambos incluidos. En UTC
 * a propósito: son fechas puras, no horas, así que no hay zona horaria que
 * las pueda correr de día. */
function listaDeDias(desde, hasta) {
  const dias = []
  let actual = new Date(`${desde}T00:00:00Z`)
  const fin = new Date(`${hasta}T00:00:00Z`)
  while (actual.getTime() <= fin.getTime()) {
    dias.push(actual.toISOString().slice(0, 10))
    actual = new Date(actual.getTime() + 24 * 60 * 60 * 1000)
  }
  return dias
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * ¿Vale la pena reintentar este error de Meta? Comprobado con datos reales:
 * la cuenta 360623391212876 devuelve "Internal Server Error" de forma
 * INTERMITENTE y reintentar siempre lo resolvió. Los errores de permisos
 * (token vencido, sin `ads_read`) o de parámetros (campo mal escrito, cuenta
 * inexistente) no se arreglan repitiendo la misma llamada, así que solo se
 * reintenta esta familia para no ocultar un error real detrás de 3 intentos.
 */
function esErrorTransitorio(error) {
  const msg = String(error?.message || '').toLowerCase()
  return error?.code === 1 || error?.code === 2 || msg.includes('internal server error') || msg.includes('try again')
}

/** GET con reintento corto ante errores transitorios de Meta (ver esErrorTransitorio). */
async function fetchConReintento(url, intentosMax = 3) {
  let ultimo
  for (let intento = 1; intento <= intentosMax; intento++) {
    const r = await fetch(url)
    const j = await r.json()
    if (!j.error) return j
    ultimo = j
    if (intento === intentosMax || !esErrorTransitorio(j.error)) return j
    await esperar(600 * intento)
  }
  return ultimo
}

/**
 * Insights de UN solo día para una cuenta, ya paginado.
 *
 * `filtering` por `effective_status`: Meta EXCLUYE de los Insights los anuncios
 * ARCHIVED y DELETED salvo que se pidan por nombre explícito. Comprobado el
 * 30-jul: el anuncio que más conversaciones trajo a IND (120249663261930600,
 * "DUO PERFECTO") está ARCHIVED y no aparecía en NINGUNA consulta sin este
 * filtro. Sin él, su gasto desaparece del tablero y su ROAS sale infinito —
 * exactamente el error que este tablero existe para evitar.
 */
async function traerGastoDeUnDia(adAccountId, dia) {
  const url = new URL(`${GRAPH}/act_${adAccountId}/insights`)
  url.searchParams.set('access_token', token())
  url.searchParams.set('level', 'ad')
  url.searchParams.set('time_range', JSON.stringify({ since: dia, until: dia }))
  url.searchParams.set('filtering', JSON.stringify([
    { field: 'ad.effective_status', operator: 'IN', value: [
      'ACTIVE', 'PAUSED', 'DELETED', 'PENDING_REVIEW', 'DISAPPROVED',
      'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ARCHIVED',
      'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES',
    ] },
  ]))
  url.searchParams.set('limit', '500')
  url.searchParams.set('fields', [
    'ad_id', 'ad_name', 'adset_id', 'adset_name',
    'campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks',
    'actions', 'action_values', 'purchase_roas',
  ].join(','))

  const filas = []
  let siguiente = url.toString()

  while (siguiente) {
    const j = await fetchConReintento(siguiente)
    if (j.error) throw new Error(`Insights de act_${adAccountId} (${dia}): ${j.error.message}`)

    for (const d of j.data || []) {
      filas.push({
        // La llamada ya es de un solo día (`time_range` since=until=dia), así
        // que la fecha de la fila es `dia`: no hace falta leer `date_start`.
        fecha: dia,
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
 * Gasto e Insights por anuncio y por día.
 *
 * UNA LLAMADA POR DÍA, NO `time_increment: 1`. Contra anuncios ARCHIVED, Meta
 * responde el desglose diario como "Not available" aunque el anuncio sí haya
 * gastado ese día — el filtro de `effective_status` de arriba logra que el
 * anuncio APAREZCA, pero con `time_increment` su gasto diario viene vacío
 * igual. Medido con datos reales (IndStore, 13 al 30-jul-2026): con
 * `time_increment=1` salían $77,20 en 20 anuncios; día por día salen $350,16
 * en 37 anuncios — se perdía el 78% del gasto, incluido el anuncio que más
 * conversaciones trae a IND (120249663261930600, ARCHIVED, $82,33 él solo).
 * Con el gasto real oculto así, el tablero le habría calculado a IND un ROAS
 * 4,5 veces mejor del que es. NO "optimizar" esto de vuelta a una sola
 * llamada con `time_increment`: se pierde ese gasto otra vez, en silencio.
 *
 * Es más caro (N llamadas en vez de 1), pero el cron solo refresca unos pocos
 * días por corrida, así que en la práctica son pocas llamadas por cuenta.
 */
export async function traerGastoDiario({ adAccountId, desde, hasta }) {
  const dias = listaDeDias(desde, hasta)
  const filas = []
  for (const dia of dias) {
    const filasDelDia = await traerGastoDeUnDia(adAccountId, dia)
    filas.push(...filasDelDia)
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
    const j = await fetchConReintento(siguiente)
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
