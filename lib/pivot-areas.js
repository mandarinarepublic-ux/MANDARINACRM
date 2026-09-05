// lib/pivot-areas.js
//
// El Tablero por sub-área: qué le toca a cada mesa, hoy.
//
// POR QUÉ REEMPLAZA A LAS TRES COLUMNAS. Medido el 4-sep-2026: de 74 pedidos
// vivos, 69 caían en la columna CORTE, 5 en PRODUCCIÓN y 0 en DESPACHO. Un
// tablero donde el 93% está en una sola columna no reparte trabajo: solo repite
// que todo sigue atascado en el mismo sitio.
//
// ☠️ EL CORTE NO ES UNA PUERTA.
// La primera versión de esta pantalla solo dejaba ver a un área lo ya marcado
// CORTADO, y BORDADO salía en CERO teniendo 23 prendas suyas esperando. Y no
// porque estuvieran cortadas sin marcar —solo 4 lo demostraban— sino porque la
// marca no se produce cuando ocurre: el registro de corte pasó de 98 pedidos en
// julio a 5 en agosto y 0 en septiembre.
//
// De ahí la regla, que este sistema ya pagó cuatro veces en el inbox: cuando una
// señal PUEDE FALTAR, no puede ser la que decide si el trabajo se ve. Estar
// cortada o no es un DATO de la fila (`sinCorte`), nunca un filtro.
//
// Una prenda sin cortar sale a la vez en Corte y en su área. No es duplicarla:
// son dos pendientes distintos sobre la misma prenda — uno la tiene que cortar y
// el otro la está esperando.

import { parseSubestados, subestadoGlobal } from './subestados.js'
import { diasHastaEntrega } from './parseFecha.js'

export const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']
export const SUBAREAS = ['CORTE', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO', 'SIN_AREA', 'POR_ENTREGAR']

export const META_SUBAREA = {
  CORTE:        { label: 'Corte',             icon: '✂️', nota: 'Puerta de entrada al taller' },
  ESTAMPADO:    { label: 'Estampado',         icon: '🎨', nota: 'Área de producción' },
  SUBLIMACION:  { label: 'Sublimación',       icon: '💙', nota: 'Área de producción' },
  BORDADO:      { label: 'Bordado',           icon: '🧵', nota: 'Área de producción' },
  SIN_AREA:     { label: 'Sin área asignada', icon: '❓', nota: 'Ninguna mesa las reclama' },
  POR_ENTREGAR: { label: 'Por entregar',      icon: '📦', nota: 'La fábrica ya terminó' },
}

/** Estados en los que una prenda ya no es trabajo de nadie. */
const TERMINADOS = new Set(['LISTO', 'ENTREGADO_TIENDA', 'ELIMINADO'])

const uds = (i) => parseInt(i?.CANTIDAD || 1) || 1
const cortada = (i) => String(i?.SUBESTADO_CORTE ?? '').trim().toUpperCase() === 'CORTADO'

/** Las áreas de producción de una prenda: "ESTAMPADO + BORDADO" → las dos. */
function areasDe(areaStr) {
  return String(areaStr ?? '')
    .split(/\s*\+\s*|\s*,\s*/)
    .map((a) => a.trim().toUpperCase())
    .filter((a) => AREAS_BASE.includes(a))
}

/**
 * A qué sub-áreas le toca esta prenda, y en qué estado la ve cada una.
 * @returns {{sub:string, estado:string}[]}
 */
function subareasDe(item) {
  const estados = parseSubestados(item.SUBESTADO, item.AREA)
  const global = subestadoGlobal(estados)
  // Ya terminada: no es pendiente de nadie. ⚠️ Tampoco vuelve a Corte aunque le
  // falte la marca — mandar a cortar algo ya listo es inventar trabajo.
  if (TERMINADOS.has(global)) return []

  const areas = areasDe(item.AREA)
  const salida = []
  for (const a of areas) {
    const est = estados[a] ?? 'SOLICITADO'
    if (est !== 'LISTO' && est !== 'ENTREGADO_TIENDA') salida.push({ sub: a, estado: est })
  }
  if (areas.length === 0) salida.push({ sub: 'SIN_AREA', estado: global })
  if (!cortada(item)) salida.push({ sub: 'CORTE', estado: global })
  return salida
}

/**
 * El pivot por sub-área.
 *
 * @param {object[]} pedidos  tal como los devuelve /api/tablero
 * @param {{ahora?:Date}} opts
 * @returns {Array} una entrada por sub-área CON trabajo, en el orden de SUBAREAS
 */
export function construirPivot(pedidos, { ahora = new Date() } = {}) {
  const acc = {}
  for (const s of SUBAREAS) acc[s] = { estados: {}, sinCorte: 0, pedidos: new Map() }

  for (const p of pedidos || []) {
    // ☠️ Un pedido que no cae en NINGUNA mesa no desaparece: va a «Por entregar».
    //
    // Son los que tienen todas sus prendas por ENTREGA EN TIENDA, o ya listas.
    // No hay nada que cortar ni producir — lo pendiente es entregarlo. La versión
    // anterior del tablero los borraba (`clasificarPedido` devolvía null y un
    // `.filter` los tiraba): el 19-ago-2026 había TRES vivos e invisibles, uno
    // creado ese mismo día. Sin prendas que fabricar NO significa que no pase nada.
    let cayoEnAlguna = false

    for (const item of p.items || []) {
      for (const { sub, estado } of subareasDe(item)) {
        cayoEnAlguna = true
        const b = acc[sub]
        b.estados[estado] = (b.estados[estado] || 0) + 1
        if (sub !== 'CORTE' && !cortada(item)) b.sinCorte += 1

        if (!b.pedidos.has(p.PEDIDO_ID)) {
          b.pedidos.set(p.PEDIDO_ID, {
            ...filaBase(p, ahora),
            prendas: 0, unidades: 0, sinCorte: 0, estados: {}, productos: {},
          })
        }
        const fila = b.pedidos.get(p.PEDIDO_ID)
        fila.prendas += 1
        fila.unidades += uds(item)
        if (!cortada(item)) fila.sinCorte += 1
        fila.estados[estado] = (fila.estados[estado] || 0) + 1
        const nombre = (item.PRODUCTO_NOMBRE ?? '').trim() || 'prenda'
        fila.productos[nombre] = (fila.productos[nombre] || 0) + uds(item)
      }
    }

    if (!cayoEnAlguna) {
      const b = acc.POR_ENTREGAR
      const vivas = (p.items || []).filter((i) => {
        const g = subestadoGlobal(parseSubestados(i.SUBESTADO, i.AREA))
        return g !== 'ELIMINADO'
      })
      b.estados.LISTO = (b.estados.LISTO || 0) + Math.max(1, vivas.length)
      b.pedidos.set(p.PEDIDO_ID, {
        ...filaBase(p, ahora),
        prendas: vivas.length,
        unidades: vivas.reduce((t, i) => t + uds(i), 0),
        sinCorte: 0,
        estados: { LISTO: Math.max(1, vivas.length) },
        productos: vivas.reduce((acc2, i) => {
          const n = (i.PRODUCTO_NOMBRE ?? '').trim() || 'prenda'
          acc2[n] = (acc2[n] || 0) + uds(i)
          return acc2
        }, {}),
      })
    }
  }

  return SUBAREAS.map((sub) => {
    const b = acc[sub]
    const lista = [...b.pedidos.values()]
      .map((x) => ({ ...x, productos: Object.entries(x.productos).map(([n, c]) => `${c}× ${n}`) }))
      // El más atrasado primero. Sin promesa va al final: no hay atraso que medir
      // y colarlo arriba sería inventar urgencia.
      .sort((a, z) => (z.atraso ?? -Infinity) - (a.atraso ?? -Infinity))
    return {
      sub,
      ...META_SUBAREA[sub],
      pedidos: lista.length,
      prendas: lista.reduce((t, x) => t + x.prendas, 0),
      unidades: lista.reduce((t, x) => t + x.unidades, 0),
      vencidos: lista.filter((x) => x.atraso > 0).length,
      urgentes: lista.filter((x) => x.atraso !== null && x.atraso <= 0 && x.atraso >= -2).length,
      sinCorte: b.sinCorte,
      masViejo: lista.length ? Math.max(...lista.map((x) => x.edad || 0)) : 0,
      estados: b.estados,
      lista,
    }
    // Una sub-área sin NADA pendiente no se pinta. ⚠️ Es lo único que se filtra,
    // y solo cuando de verdad no hay trabajo: si alguna vez una tarjeta con
    // carga desapareciera, este `filter` es el primer sospechoso.
  }).filter((s) => s.pedidos > 0)
}

/** Los datos del PEDIDO en una fila, iguales en cualquier sub-área. */
function filaBase(p, ahora) {
  return {
    id: p.PEDIDO_ID,
    tienda: p.TIENDA_ID ?? '',
    cliente: (p.CLIENTE_NOMBRE ?? '').trim(),
    creado: String(p.FECHA_PEDIDO ?? '').slice(0, 10),
    promesa: String(p.FECHA_ENTREGA_PROMETIDA ?? '').slice(0, 10),
    // ⚠️ `null` y no 0 cuando no hay promesa: un cero se lee como "vence hoy" y
    // pondría urgencia donde no la hay.
    atraso: p.FECHA_ENTREGA_PROMETIDA ? -diasHastaEntrega(p.FECHA_ENTREGA_PROMETIDA, ahora) : null,
    edad: diasDesde(p.FECHA_PEDIDO, ahora),
    pendiente: Number(p.MONTO_PENDIENTE || 0),
    aTaller: numeroONull(p.DIAS_A_TALLER),
    enTaller: numeroONull(p.DIAS_EN_TALLER),
    quieto: numeroONull(p.DIAS_QUIETO),
    ultimoEvento: p.ULTIMO_EVENTO ?? '',
  }
}

function diasDesde(fecha, ahora) {
  const t = new Date(fecha).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86400000))
}

function numeroONull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Qué tarjetas puede ver este usuario. `null` = todas, sin recorte.
 *
 * ☠️ Un rol transversal (CORTE, DESPACHO, ADMIN) NO tiene `areas` asignadas.
 * Recortarle a "sus áreas" lo dejaría con la pantalla vacía — el mismo error que
 * deja sin ver nada a un DISEÑO sin áreas. Sin áreas ⇒ ve todo.
 *
 * A quien SÍ tiene áreas se le suma siempre CORTE: lo que no se corta es lo que
 * no le llega, así que es su cola de entrada, no el trabajo de otro.
 */
export function subareasVisibles(usuario) {
  const areas = (usuario?.areas || usuario?.AREAS || [])
  const lista = (Array.isArray(areas) ? areas : String(areas).split(','))
    .map((a) => String(a).trim().toUpperCase())
    .filter((a) => AREAS_BASE.includes(a))
  if (lista.length === 0) return null
  return [...new Set([...lista, 'CORTE'])]
}
