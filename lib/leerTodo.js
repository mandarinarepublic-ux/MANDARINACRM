// lib/leerTodo.js
//
// ☠️ PostgREST devuelve como mucho 1000 filas, con `error: null`. No avisa.
// `leerTodo` pide página tras página con `.range()` hasta que llega una
// incompleta. Es PURO respecto de Supabase: recibe una función que ARMA la
// consulta (sin `.range()`), así se puede probar con una base falsa.
//
// La consulta tiene que ordenar por algo TOTAL (único): si dos filas empatan en
// el orden, PostgREST puede devolverlas en distinto orden en cada página y una
// fila se repite mientras otra desaparece. En `pauta_dia` es `fecha + ad_id`
// (la clave única del upsert).
//
// 20-nov-2026: `/api/pauta/arte` leía la tabla entera sin rango. Con 1.382
// filas escondía 38 de 89 anuncios y $765 de $2.949 de gasto.

export const PAGINA_POSTGREST = 1000

/**
 * @param {() => any} armar  devuelve la consulta de Supabase, YA ordenada, sin `.range()`.
 * @param {{ maxPaginas?: number }} [opc]  freno: pasarlo es un error, no un recorte silencioso.
 * @returns {Promise<object[]>}
 */
export async function leerTodo(armar, { maxPaginas = 50 } = {}) {
  const filas = []
  for (let p = 0; p < maxPaginas; p++) {
    const ini = p * PAGINA_POSTGREST
    const { data, error } = await armar().range(ini, ini + PAGINA_POSTGREST - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < PAGINA_POSTGREST) return filas
  }
  throw new Error(`leerTodo: más de ${maxPaginas * PAGINA_POSTGREST} filas; acota la consulta`)
}
