// lib/orden-produccion.js
//
// Orden y textos de la bandeja de Producción.
//
// La bandeja ordenaba por FECHA_PEDIDO, lo más nuevo arriba: lo que vencía hoy
// podía quedar en la página 3 detrás de pedidos con dos semanas de margen. En el
// taller lo que aprieta es la fecha PROMETIDA, así que ahora manda esa: lo
// atrasado primero, luego lo que vence antes, y lo que no tiene fecha al final
// (sin fecha no se puede afirmar que sea urgente, pero tampoco se esconde).
//
// Vive fuera de la pantalla y con imports RELATIVOS porque `node --test` no
// entiende ni el alias `@/` ni el JSX de un `page.js` (igual que orden-corte.js).

import { parseFecha, diasHastaEntrega } from './parseFecha.js'

const AL_FINAL = Number.POSITIVE_INFINITY

const msPedido = (p) => {
  const f = parseFecha(p?.FECHA_PEDIDO)
  const t = f ? f.getTime() : NaN
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY   // sin fecha: al final del desempate
}

/**
 * Comparador por urgencia: días hasta la entrega prometida, ascendente (lo
 * atrasado, con días negativos, queda arriba). Sin fecha prometida, al final.
 * Empate: FECHA_PEDIDO más nueva primero y, al final, PEDIDO_ID — así dos
 * cargas seguidas dan SIEMPRE el mismo orden y nada salta de sitio.
 *
 * @param {Date} [ahora]  para las pruebas
 */
export function comparadorUrgencia(ahora) {
  const cache = new Map()
  const dias = (p) => {
    if (cache.has(p)) return cache.get(p)
    const d = diasHastaEntrega(p?.FECHA_ENTREGA_PROMETIDA, ahora)
    const v = d === null || !Number.isFinite(d) ? AL_FINAL : d
    cache.set(p, v)
    return v
  }
  return (a, b) => {
    const da = dias(a), db = dias(b)
    if (da !== db) return da < db ? -1 : 1
    const fa = msPedido(a), fb = msPedido(b)
    if (fa !== fb) return fb > fa ? 1 : -1
    return String(b?.PEDIDO_ID || '').localeCompare(String(a?.PEDIDO_ID || ''))
  }
}

/**
 * En qué tramo de entrega cae un pedido, a partir de sus días restantes.
 * 'ATRASADO' (ya pasó), 'PRONTO' (hoy o en ≤2 días), o null.
 */
export function tramoEntrega(dias) {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null
  if (dias < 0) return 'ATRASADO'
  if (dias <= 2) return 'PRONTO'
  return null
}

/** ¿El pedido pasa el filtro de entrega? ('TODOS' | 'ATRASADOS' | 'PRONTO') */
export function pasaFiltroEntrega(pedido, filtro, ahora) {
  if (!filtro || filtro === 'TODOS') return true
  const t = tramoEntrega(diasHastaEntrega(pedido?.FECHA_ENTREGA_PROMETIDA, ahora))
  if (filtro === 'ATRASADOS') return t === 'ATRASADO'
  if (filtro === 'PRONTO') return t === 'PRONTO'
  return true
}

/** Cuántos pedidos van atrasados y cuántos vencen en ≤2 días. */
export function contarEntregas(pedidos, ahora) {
  let atrasados = 0, pronto = 0
  for (const p of pedidos || []) {
    const t = tramoEntrega(diasHastaEntrega(p?.FECHA_ENTREGA_PROMETIDA, ahora))
    if (t === 'ATRASADO') atrasados++
    else if (t === 'PRONTO') pronto++
  }
  return { atrasados, pronto }
}

/** "1 pedido" / "3 pedidos". Sin "(s)": se lee mal y en voz alta peor. */
export function plural(n, singular, pluralTexto = singular + 's') {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

/** Texto de la entrega para la fila del pedido. null si no hay fecha. */
export function textoEntrega(dias) {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null
  if (dias < 0) return { txt: `Atrasado ${plural(-dias, 'día')}`, tono: 'atrasado' }
  if (dias === 0) return { txt: 'Vence hoy', tono: 'hoy' }
  return { txt: `${dias}d restantes`, tono: dias <= 2 ? 'pronto' : 'normal' }
}

// Cómo se nombra lo que se está contando según el filtro de estado: decir
// "pendientes" con el filtro en ✅ Listo era decir lo contrario de lo que se ve.
const ADJETIVO = {
  TODOS:              ['pendiente', 'pendientes'],
  SOLICITADO:         ['solicitado', 'solicitados'],
  ESPERANDO_PRENDA:   ['esperando prenda', 'esperando prenda'],
  EN_PROCESO:         ['en proceso', 'en proceso'],
  ENVIADO_APROBACION: ['en aprobación', 'en aprobación'],
  LISTO:              ['listo', 'listos'],
}

/**
 * "12 ítems pendientes", "1 ítem listo"… Con búsqueda y filtro «Todos» la lista
 * incluye lo LISTO (visibleEnTodos), así que ahí no se dice "pendientes".
 */
export function textoConteo(n, filtroSubestado = 'TODOS', { busqueda = '' } = {}) {
  const base = plural(n, 'ítem')
  if ((filtroSubestado || 'TODOS') === 'TODOS' && busqueda) return `${base} encontrado${n === 1 ? '' : 's'}`
  const adj = ADJETIVO[filtroSubestado]
  if (!adj) return base
  return `${base} ${n === 1 ? adj[0] : adj[1]}`
}

/** "hace un momento", "hace 3 min", "hace 2 h". */
export function haceCuanto(desde, ahora = Date.now()) {
  const min = Math.floor((ahora - desde) / 60000)
  if (!Number.isFinite(min) || min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h`
}
