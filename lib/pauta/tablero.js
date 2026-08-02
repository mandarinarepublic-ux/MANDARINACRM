// lib/pauta/tablero.js
// Une el gasto (Meta) con el embudo (nuestro) y arma la respuesta de la API.
// Acá viven las decisiones de "qué se muestra cuando falta un dato".

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/tablero.js es server-only.')
}

import { roasDe, brechaRoas, recortarFechaPiso } from './atribucion.js'
import {
  embudoPorAnuncio, gastoPorAnuncio, ventaTotalTienda,
  contarCubetas, ultimoDatoDeGasto, ventasPorOrigen,
} from './consultas.js'

/**
 * @param {string} [phoneId] filtra por UN número de la tienda. null = los dos.
 *
 * Ojo con lo que el filtro NO toca: el GASTO viene de Meta por anuncio y Meta no
 * sabe a qué número escribió cada persona, así que sigue siendo el de la cuenta
 * completa. Con un canal elegido, el gasto queda sobrestimado frente a los chats
 * de ese número y el ROAS por canal sale más bajo de lo real. Sirve para
 * comparar canales entre sí, no para leer el ROAS de uno en absoluto.
 */
export async function armarTablero({ tienda, desde, hasta, phoneId = null }) {
  const desdeReal = recortarFechaPiso(desde)

  const [embudo, gasto, ventaTienda, cubetas, ultimoDato, origenes] = await Promise.all([
    embudoPorAnuncio({ tienda, desde: desdeReal, hasta, phoneId }),
    gastoPorAnuncio({ tienda, desde: desdeReal, hasta }),
    ventaTotalTienda({ tienda, desde: desdeReal, hasta }),
    contarCubetas({ tienda, desde: desdeReal, hasta, phoneId }),
    ultimoDatoDeGasto(tienda),
    ventasPorOrigen({ tienda, desde: desdeReal, hasta }),
  ])

  const embudoPorAd = new Map(embudo.map((e) => [e.ad_id, e]))
  const gastoPorAd = new Map(gasto.map((g) => [g.adId, g]))

  // La unión de los dos lados: un anuncio puede tener gasto sin chats (no
  // convirtió) o chats sin gasto (su cuenta no está mapeada — ver §3.7).
  const todosLosAds = new Set([...embudoPorAd.keys(), ...gastoPorAd.keys()])

  const artes = [...todosLosAds].map((adId) => {
    const e = embudoPorAd.get(adId)
    const g = gastoPorAd.get(adId)
    const venta = Number(e?.venta || 0)
    const gastoAd = g ? Number(g.gasto) : null
    const roasMeta = g?.valorMeta && gastoAd ? roasDe(g.valorMeta, gastoAd) : null
    const roasCrm = roasDe(venta, gastoAd)

    return {
      adId,
      nombre: g?.adNombre || `Anuncio ${adId}`,
      estado: g?.estado || '',
      campaignId: g?.campaignId || 'SIN_CAMPANA',
      campaignNombre: g?.campaignNombre || 'Sin campaña identificada',
      adsetId: g?.adsetId || 'SIN_CONJUNTO',
      adsetNombre: g?.adsetNombre || 'Sin conjunto identificado',
      arteUrl: g?.arteUrl || null,
      arteTipo: g?.arteTipo || null,
      arteTexto: g?.arteTexto || null,
      arteTitular: g?.arteTitular || null,
      // gasto null = "⚠ sin gasto". La pantalla NUNCA debe pintar $0 acá.
      gasto: gastoAd,
      impresiones: g?.impresiones || 0,
      clics: g?.clics || 0,
      conversacionesMeta: g?.conversacionesMeta || 0,
      llegaron: e?.llegaron || 0,
      respondieron: e?.respondieron || 0,
      conversaron: e?.conversaron || 0,
      pedidos: e?.pedidos || 0,
      pagados: e?.pagados || 0,
      venta,
      roasMeta,
      roasCrm,
      brecha: brechaRoas(roasMeta, roasCrm),
      costoPorConversacion: gastoAd && e?.llegaron ? gastoAd / e.llegaron : null,
    }
  })

  const campanas = agrupar(artes)
  const gastoTotal = artes.reduce((s, a) => s + (a.gasto || 0), 0)
  const ventaAtribuida = artes.reduce((s, a) => s + a.venta, 0)
  // Lo que Meta dice que valen sus conversiones, sumado — para el ROAS de
  // Meta a nivel de tienda (mismo criterio de null que el resto: sin dato,
  // sin inventar un $0 que infle o desinfle el promedio).
  const valorMetaTotal = gasto.reduce((s, g) => s + Number(g.valorMeta || 0), 0)

  return {
    tienda,
    phoneId,
    // El gasto es de la cuenta publicitaria completa: Meta no sabe a qué número
    // escribió cada persona. Con un canal elegido hay que decirlo en pantalla o
    // el ROAS se lee mal.
    gastoEsDeTodaLaTienda: Boolean(phoneId),
    origenes,
    desde: desdeReal,
    hasta,
    recortadoAlPiso: desdeReal !== desde,
    ultimoDato,
    totales: {
      gasto: gastoTotal,
      ventaTienda,
      mer: roasDe(ventaTienda, gastoTotal),
      ventaAtribuida,
      roasMeta: valorMetaTotal ? roasDe(valorMetaTotal, gastoTotal) : null,
      roasCrm: roasDe(ventaAtribuida, gastoTotal),
    },
    cubetas: {
      pauta: cubetas.pauta, sinPauta: cubetas.sin_pauta, sinChat: cubetas.sin_chat,
    },
    embudo: {
      impresiones: artes.reduce((s, a) => s + a.impresiones, 0),
      clics: artes.reduce((s, a) => s + a.clics, 0),
      llegaron: artes.reduce((s, a) => s + a.llegaron, 0),
      respondieron: artes.reduce((s, a) => s + a.respondieron, 0),
      conversaron: artes.reduce((s, a) => s + a.conversaron, 0),
      pedidos: artes.reduce((s, a) => s + a.pedidos, 0),
      pagados: artes.reduce((s, a) => s + a.pagados, 0),
    },
    campanas,
  }
}

/** Artes → conjuntos → campañas, sumando hacia arriba y ordenando por gasto. */
function agrupar(artes) {
  const camps = new Map()
  for (const a of artes) {
    if (!camps.has(a.campaignId)) {
      camps.set(a.campaignId, {
        campaignId: a.campaignId, nombre: a.campaignNombre, conjuntos: new Map(),
      })
    }
    const c = camps.get(a.campaignId)
    if (!c.conjuntos.has(a.adsetId)) {
      c.conjuntos.set(a.adsetId, { adsetId: a.adsetId, nombre: a.adsetNombre, artes: [] })
    }
    c.conjuntos.get(a.adsetId).artes.push(a)
  }

  const sumar = (items) => ({
    gasto: items.some((i) => i.gasto != null)
      ? items.reduce((s, i) => s + (i.gasto || 0), 0) : null,
    llegaron: items.reduce((s, i) => s + i.llegaron, 0),
    respondieron: items.reduce((s, i) => s + i.respondieron, 0),
    conversaron: items.reduce((s, i) => s + i.conversaron, 0),
    pedidos: items.reduce((s, i) => s + i.pedidos, 0),
    venta: items.reduce((s, i) => s + i.venta, 0),
  })

  return [...camps.values()]
    .map((c) => {
      const conjuntos = [...c.conjuntos.values()]
        .map((cj) => ({ ...cj, ...sumar(cj.artes), artes: ordenar(cj.artes) }))
        .sort((a, b) => (b.gasto || 0) - (a.gasto || 0))
      return { ...c, ...sumar(conjuntos), conjuntos }
    })
    .sort((a, b) => (b.gasto || 0) - (a.gasto || 0))
}

/** Por gasto; los sin gasto conocido al final pero ordenados por chats. */
function ordenar(artes) {
  return artes.sort((a, b) => (b.gasto || 0) - (a.gasto || 0) || b.llegaron - a.llegaron)
}
