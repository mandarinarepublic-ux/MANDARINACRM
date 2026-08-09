// lib/capi-destino.js — ¿A dónde va el Purchase de un pedido, y con qué origen?
//
// Vive APARTE de lib/metaCapi.js a propósito: es la regla de seguridad de todo
// el envío a Meta y tiene que poder probarse sin red y sin variables de entorno.
// (metaCapi.js importa Supabase y la bitácora, así que `node --test` no puede
// cargarlo directo — el mismo motivo por el que lib/origenes.js también está solo.)

/**
 * ¿A dónde va este Purchase, y con qué `action_source`?
 *
 * Dos reglas, las dos aprendidas rompiéndose en producción:
 *
 * 1. Un evento `business_messaging` va al DATASET de su WABA. Al pixel de la web
 *    NO se puede: el pixel no tiene cuenta de WhatsApp asociada y Meta rechaza el
 *    evento ENTERO con "Invalid parameter". Medido el 8-ago-2026: así se
 *    perdieron **21 compras por $1.624,98** entre el 3 y el 8-ago — el 100% de
 *    las que venían de un anuncio, o sea justo las únicas que le enseñan a Meta a
 *    buscar compradores en vez de curiosos.
 *
 * 2. Si no se puede llegar al dataset (falta `META_TOKEN`, o esa WABA todavía no
 *    tiene dataset), la venta se reporta IGUAL por el pixel, pero como venta de
 *    `chat`. Perder la atribución al anuncio es malo; perder la compra entera es
 *    peor, y es lo que venía pasando. Con esto el peor caso vuelve a ser el de
 *    julio —Meta ve el dinero aunque no sepa de qué anuncio vino— en vez de cero.
 *
 * La invariante que resume las dos: **nunca sale un `business_messaging` hacia un
 * pixel.** Si alguna vez vuelve a pasar, se pierde la venta y no se entera nadie.
 *
 * @param {object} p
 * @param {string} p.origenPedido  'business_messaging' | 'physical_store' | 'chat'
 * @param {string|null} p.datasetId  dataset de la WABA, o null si no se resolvió
 * @param {string} p.tokenWaba  META_TOKEN (el de la Cloud API), '' si no está
 * @param {string} p.pixelId  pixel de la tienda
 * @returns {{porDataset: boolean, origen: string, destinoId: string}}
 */
export function decidirDestino({ origenPedido, datasetId, tokenWaba, pixelId }) {
  const quiereDataset = origenPedido === 'business_messaging'
  const porDataset = Boolean(quiereDataset && datasetId && tokenWaba)
  return {
    porDataset,
    origen: quiereDataset && !porDataset ? 'chat' : origenPedido,
    destinoId: porDataset ? datasetId : pixelId,
  }
}
