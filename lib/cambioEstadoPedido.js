// lib/cambioEstadoPedido.js
//
// El combo de estado al lado del botón PDF en Producción (10-nov-2026): cambia
// el estado de TODAS las prendas del pedido que le tocan al usuario, sin abrir
// el pedido. Hace exactamente lo mismo que tocar el botón en cada prenda: un
// PATCH /api/pedidos/item/{id} por prenda (y por área, si la prenda es de
// varias), así el auto-avance a DESPACHO, la marca de corte y la bitácora
// corren igual que siempre.
//
// ☠️ Respeta el área: un diseñador de ESTAMPADO solo mueve la parte de
// estampado de una prenda "ESTAMPADO + BORDADO". ADMIN mueve todas.
//
// Puro: sin base, sin red, sin '@/'.

import { parseSubestados, serializeSubestados, subestadoGlobal } from './subestados.js'

const FUERA = new Set(['ENTREGADO_TIENDA', 'ELIMINADO'])
const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

function areasDe(item) {
  return String(item?.AREA || '').toUpperCase().split(/\s*\+\s*|\s*,\s*/)
    .map((a) => a.trim()).filter((a) => AREAS_BASE.includes(a))
}

/**
 * Los PATCH que hay que mandar.
 * @param {object[]} items       prendas del pedido (las que ve el usuario)
 * @param {string}   nuevo       estado elegido
 * @param {boolean}  esAdmin
 * @param {(item)=>string|null} areaDelUsuario  el área del usuario en esa prenda
 * @returns {{itemId:string, body:{SUBESTADO:string, AREA_ROL?:string}}[]} y `resultado` por prenda
 */
export function planCambio(items, nuevo, esAdmin, areaDelUsuario) {
  const llamadas = []
  const resultado = {}
  for (const item of items || []) {
    if (FUERA.has(String(item?.SUBESTADO || '').toUpperCase())) continue
    const areas = areasDe(item)
    if (areas.length > 1) {
      const objetivo = esAdmin ? areas : [areaDelUsuario(item)].filter((a) => a && areas.includes(a))
      if (!objetivo.length) continue
      const estados = parseSubestados(item.SUBESTADO || 'SOLICITADO', item.AREA)
      for (const a of objetivo) {
        if (estados[a] === nuevo) continue
        estados[a] = nuevo
        llamadas.push({ itemId: item.ITEM_ID, body: { SUBESTADO: nuevo, AREA_ROL: a } })
      }
      resultado[item.ITEM_ID] = serializeSubestados(estados)
    } else {
      if (item.SUBESTADO === nuevo) continue
      llamadas.push({ itemId: item.ITEM_ID, body: { SUBESTADO: nuevo } })
      resultado[item.ITEM_ID] = nuevo
    }
  }
  return { llamadas, resultado }
}

/** Qué mostrar en el combo: el estado común, o '' si las prendas están en estados distintos. */
export function estadoComun(items, esAdmin, areaDelUsuario) {
  const vistos = new Set()
  for (const item of items || []) {
    if (FUERA.has(String(item?.SUBESTADO || '').toUpperCase())) continue
    const areas = areasDe(item)
    if (areas.length > 1) {
      const estados = parseSubestados(item.SUBESTADO || 'SOLICITADO', item.AREA)
      const mias = esAdmin ? areas : [areaDelUsuario(item)].filter(Boolean)
      for (const a of mias) vistos.add(estados[a] || 'SOLICITADO')
    } else {
      vistos.add(subestadoGlobal(parseSubestados(item.SUBESTADO || 'SOLICITADO', item.AREA)))
    }
  }
  return vistos.size === 1 ? [...vistos][0] : ''
}
