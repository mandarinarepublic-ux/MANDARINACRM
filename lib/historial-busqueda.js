// lib/historial-busqueda.js
//
// Cómo se busca en el Historial: regla pura, sin base, para poder probarla.
//
// ☠️ POR QUÉ EXISTE (7-oct-2026): los ids de los clientes que coinciden viajan
// en la URL (`cliente_id.in.(…)`). Con la primera tecla de un número de pedido
// —`6`— coincidían 979 clientes por su celular: ~26 KB de URL y el servidor
// contestaba "Bad Request". 75 errores desde el 18-sep, casi todos de Despacho
// buscando un pedido. Escribir el número completo funcionaba, por eso nadie lo
// reportó: solo se veía el error un instante.

/** Por debajo de esto el término solo se busca en el número de pedido. */
export const MIN_CARACTERES_CLIENTE = 3

/**
 * Cuántos ids de cliente pueden ir en la URL. Es el mismo tramo que usa
 * Impresión (`listClientesPorIds`, de 200 en 200), que ya funciona en producción.
 */
export const MAX_IDS_EN_URL = 200

/** ¿Este término merece buscarse también entre los clientes? */
export function buscaEnClientes(termino) {
  return String(termino ?? '').trim().length >= MIN_CARACTERES_CLIENTE
}

/**
 * El filtro `or` de PostgREST para la búsqueda, o null si no hay término.
 *
 * @param {string} termino   lo que escribió la persona
 * @param {string[]} ids     clientes que coinciden (ya recortados a MAX_IDS_EN_URL)
 */
export function filtroBusqueda(termino, ids = []) {
  const limpio = String(termino ?? '').trim().replace(/[*,()]/g, '')
  if (!limpio) return null
  const porNumero = `pedido_id.ilike.*${limpio}*`
  const lista = (ids || []).filter(Boolean).slice(0, MAX_IDS_EN_URL)
  return lista.length ? `${porNumero},cliente_id.in.(${lista.join(',')})` : porNumero
}
