// lib/planFabrica.js
//
// El PLAN DE FÁBRICA (9-nov-2026): una sola ventana para el jefe de fábrica.
// Tres columnas por donde va físicamente el pedido —CORTE · DISEÑO · CONFECCIÓN—
// y una cuarta, QUÉ SE HACE HOY, que arma el jefe moviendo las cajitas.
//
// ☠️ ES SOLO UNA GUÍA. Mover una cajita NO cambia el pedido ni su estado. Lo que
// se guarda es la lista del día (crm.plan_fabrica) y nada más.
//
// El camino real de una prenda (confirmado por Rodrigo): todo se compra en tela
// y se corta por pieza → CORTE → DISEÑO (estampado/bordado/sublimación) →
// CONFECCIÓN (costura) → despacho. Costura NO registra nada (no tiene tiempo):
// se deduce. Un pedido en DESPACHO = la decoración terminó = está en confección
// o por despachar.
//
// Puro: sin base, sin red, sin '@/'.

export const COLUMNAS = ['CORTE', 'DISENO', 'CONFECCION']

export const META_COLUMNA = {
  CORTE:      { titulo: 'CORTE',      emoji: '✂️', ayuda: 'Falta cortar al menos una prenda' },
  DISENO:     { titulo: 'DISEÑO',     emoji: '🎨', ayuda: 'Cortado; falta estampar, bordar o sublimar' },
  CONFECCION: { titulo: 'CONFECCIÓN', emoji: '🧵', ayuda: 'Decoración lista; falta coser y despachar' },
}

const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']
export const TECNICAS = ['SUBLIMACION', 'BORDADO', 'ESTAMPADO', 'VARIAS', 'SIN_DISENO']
export const META_TECNICA = {
  SUBLIMACION: 'Sublimado',
  BORDADO:     'Bordado',
  ESTAMPADO:   'Estampado',
  VARIAS:      'Varias técnicas',
  SIN_DISENO:  'Sin diseño',
}

const FUERA = new Set(['ELIMINADO', 'ENTREGADO_TIENDA'])

function areasBase(area) {
  return String(area || '').toUpperCase().split(/\s*\+\s*|\s*,\s*/)
    .map((a) => a.trim()).filter((a) => AREAS_BASE.includes(a))
}

/** {ESTAMPADO:'LISTO', ...} o {_simple:'X'} — misma lectura que lib/subestados.js. */
function estadosDe(item) {
  const s = String(item?.SUBESTADO || '')
  const areas = areasBase(item?.AREA)
  if (s.includes(':')) {
    const r = {}
    for (const parte of s.split('|')) {
      const [a, e] = parte.split(':')
      if (a && e) r[a.trim().toUpperCase()] = e.trim()
    }
    return r
  }
  if (areas.length === 0) return { _simple: s || 'SOLICITADO' }
  return Object.fromEntries(areas.map((a) => [a, s || 'SOLICITADO']))
}

/** Las prendas que son trabajo de la fábrica (sin tienda ni borradas). */
export function prendasDeFabrica(pedido) {
  return (pedido?.items || []).filter((it) => {
    if (String(it.AREA || '').trim().toUpperCase() === 'ENTREGA EN TIENDA') return false
    return !FUERA.has(String(it.SUBESTADO || '').toUpperCase())
  })
}

const estaLista = (it) => Object.values(estadosDe(it)).every((e) => e === 'LISTO')
const estaCortada = (it) => String(it.SUBESTADO_CORTE || '').toUpperCase() === 'CORTADO'

/**
 * En qué columna va el pedido.
 *  · CONFECCIÓN: estado DESPACHO, o todas sus prendas ya listas.
 *  · CORTE: alguna prenda que todavía falta decorar no está cortada.
 *  · DISEÑO: lo demás (cortado, falta decorar).
 */
export function columnaDe(pedido) {
  if (String(pedido?.ESTADO_PEDIDO || '').toUpperCase() === 'DESPACHO') return 'CONFECCION'
  const prendas = prendasDeFabrica(pedido)
  if (prendas.length === 0) return 'CONFECCION'
  const pendientes = prendas.filter((it) => !estaLista(it))
  if (pendientes.length === 0) return 'CONFECCION'
  if (pendientes.some((it) => !estaCortada(it))) return 'CORTE'
  return 'DISENO'
}

/** La técnica que agrupa al pedido en DISEÑO (según lo que le falta decorar). */
export function tecnicaDe(pedido) {
  const prendas = prendasDeFabrica(pedido)
  const pendientes = prendas.filter((it) => !estaLista(it))
  const base = pendientes.length ? pendientes : prendas
  const set = new Set()
  for (const it of base) {
    const est = estadosDe(it)
    for (const [a, e] of Object.entries(est)) if (a !== '_simple' && e !== 'LISTO') set.add(a)
    if (!areasBase(it.AREA).length) set.add('SIN_DISENO')
  }
  if (set.size === 0) {
    for (const it of base) for (const a of areasBase(it.AREA)) set.add(a)
  }
  const reales = [...set].filter((t) => t !== 'SIN_DISENO')
  if (reales.length > 1) return 'VARIAS'
  if (reales.length === 1) return reales[0]
  return 'SIN_DISENO'
}

/**
 * Semáforo por la fecha prometida. `dias` = días que faltan (negativo = atrasado).
 */
export function semaforo(dias) {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return { color: 'gris', texto: 'Sin fecha', peso: 50 }
  if (dias < 0) return { color: 'negro', texto: `Atrasado ${-dias} día${dias === -1 ? '' : 's'}`, peso: dias }
  if (dias === 0) return { color: 'rojo', texto: 'Vence HOY', peso: 0 }
  if (dias === 1) return { color: 'naranja', texto: 'Vence mañana', peso: 1 }
  if (dias <= 3) return { color: 'amarillo', texto: `En ${dias} días`, peso: dias }
  return { color: 'verde', texto: `En ${dias} días`, peso: dias }
}

/** Qué le pasa al pedido, en frases cortas para la cajita. */
export function resumenPedido(pedido) {
  const prendas = prendasDeFabrica(pedido)
  const unidades = (it) => Math.max(1, parseInt(it.CANTIDAD || 1) || 1)
  const total = prendas.reduce((s, it) => s + unidades(it), 0)
  const listas = prendas.filter(estaLista).reduce((s, it) => s + unidades(it), 0)
  const sinCortar = prendas.filter((it) => !estaLista(it) && !estaCortada(it)).reduce((s, it) => s + unidades(it), 0)
  let esperando = 0, aprobacion = 0, proceso = 0
  for (const it of prendas) {
    const vals = Object.values(estadosDe(it))
    if (vals.includes('ESPERANDO_PRENDA')) esperando += unidades(it)
    else if (vals.includes('ENVIADO_APROBACION')) aprobacion += unidades(it)
    else if (vals.includes('EN_PROCESO')) proceso += unidades(it)
  }
  const frases = []
  if (sinCortar) frases.push(`✂️ ${sinCortar} sin cortar`)
  if (esperando) frases.push(`⏸️ ${esperando} esperando prenda`)
  if (aprobacion) frases.push(`📤 ${aprobacion} en aprobación`)
  if (proceso) frases.push(`🔧 ${proceso} en proceso`)
  if (listas) frases.push(`✅ ${listas}/${total} listas`)
  return { total, listas, sinCortar, esperando, aprobacion, proceso, frases }
}

/**
 * Arma el tablero: cada pedido vivo en su columna, del más urgente al menos.
 * Los que están en el plan de HOY salen solo en HOY (no repetidos).
 *
 * @param {object[]} pedidos  los de listTablero (vivos)
 * @param {string[]} planIds  ids del plan de hoy, en orden
 * @param {(fecha:string)=>number|null} diasHasta  días hasta la fecha prometida
 */
export function armarTablero(pedidos, planIds = [], diasHasta = () => null) {
  const enPlan = new Set(planIds)
  const porId = new Map()
  const tarjetas = []
  for (const p of pedidos || []) {
    if (FUERA_PEDIDO.has(String(p.ESTADO_PEDIDO || '').toUpperCase())) continue
    if (prendasDeFabrica(p).length === 0 && String(p.ESTADO_PEDIDO).toUpperCase() !== 'DESPACHO') continue
    const dias = diasHasta(p.FECHA_ENTREGA_PROMETIDA)
    const t = {
      id: p.PEDIDO_ID,
      pedido: p,
      columna: columnaDe(p),
      tecnica: tecnicaDe(p),
      dias,
      semaforo: semaforo(dias),
      resumen: resumenPedido(p),
    }
    porId.set(t.id, t)
    tarjetas.push(t)
  }
  const urgencia = (a, b) => a.semaforo.peso - b.semaforo.peso || String(a.id).localeCompare(String(b.id), 'es', { numeric: true })
  const columnas = Object.fromEntries(COLUMNAS.map((c) => [c, []]))
  for (const t of tarjetas) if (!enPlan.has(t.id)) columnas[t.columna].push(t)
  for (const c of COLUMNAS) columnas[c].sort(urgencia)
  const disenoPorTecnica = Object.fromEntries(TECNICAS.map((k) => [k, columnas.DISENO.filter((t) => t.tecnica === k)]))
  // Lo del plan que ya no está vivo = ya salió (se cerró): se muestra tachado.
  const hoy = planIds.map((id) => porId.get(id) || { id, salio: true })
  return { columnas, disenoPorTecnica, hoy }
}

const FUERA_PEDIDO = new Set(['COMPLETADO', 'ENTREGADO', 'CANCELADO'])

/** Mueve `id` dentro de la lista del plan: lo saca de donde esté y lo pone antes de `antesDe` (o al final). */
export function moverEnPlan(lista, id, antesDe = null) {
  const sin = (lista || []).filter((x) => x !== id)
  if (!antesDe || antesDe === id) return antesDe === id ? [...(lista || [])] : [...sin, id]
  const i = sin.indexOf(antesDe)
  if (i === -1) return [...sin, id]
  return [...sin.slice(0, i), id, ...sin.slice(i)]
}

/** Limpia lo que llega del navegador: ids de texto, sin repetir, con tope. */
export function limpiarPlan(ids, tope = 300) {
  if (!Array.isArray(ids)) return null
  const vistos = new Set()
  const r = []
  for (const x of ids) {
    const s = String(x ?? '').trim()
    if (!s || s.length > 60 || vistos.has(s)) continue
    vistos.add(s); r.push(s)
    if (r.length >= tope) break
  }
  return r
}

export const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))
