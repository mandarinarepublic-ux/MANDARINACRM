// lib/prendaEventos.js
//
// El registro de eventos POR PRENDA — la llave que le falta al CRM.
//
// POR QUÉ EXISTE. `crm.logs_pedidos` guarda los movimientos con `campo` de texto
// libre y el nombre del producto dentro: "SUBESTADO HOODIE PREMIUM", con erratas
// reales como "HODIE", y SIN `item_id`. Dos hoodies iguales en un pedido son
// indistinguibles, así que hoy es imposible medir cuánto tarda cada área.
// Auditado el 4-sep-2026: los saltos de ESTADO_PEDIDO sí son limpios (801
// pedidos), pero el detalle por prenda no se puede reconstruir.
//
// Esta capa es PURA a propósito: decide QUÉ eventos ocurren, sin tocar la base.
// Quien los escribe es `lib/db/prendaEventos.js`. Así la regla —que es la parte
// peligrosa— se prueba sin Supabase.
//
// ☠️ LA REGLA QUE NO SE PUEDE AFLOJAR: `ENVIADO_APROBACION` NO implica corte.
// Mandar el arte al cliente no exige tocar la tela. Medido el 4-sep-2026: 42 de
// las 46 prendas vivas "en curso sin marca de corte" estaban justo ahí. Tratarlas
// como cortadas las saca de la bandeja de Corte — y esas prendas SÍ hay que
// cortarlas. El error barato es dejar una prenda de más en la bandeja; el caro
// es borrarla.

import { parseSubestados } from './subestados.js'

/** Estados de un área que solo son posibles si la tela ya se cortó. */
const ESTADOS_QUE_PRUEBAN_CORTE = new Set(['EN_PROCESO', 'LISTO'])

/**
 * ¿Este estado de área demuestra que la prenda ya está cortada?
 *
 * Lista blanca a propósito, y el default es NO. Un estado nuevo que nadie
 * previó no puede empezar a borrar prendas de la bandeja de Corte en silencio.
 */
export function implicaCorte(estado) {
  return ESTADOS_QUE_PRUEBAN_CORTE.has(String(estado ?? '').trim().toUpperCase())
}

/** El estado que tenía esa área antes del cambio. */
function estadoAnterior(item, areaRol) {
  const previos = parseSubestados(item.SUBESTADO, item.AREA)
  if (areaRol) return previos[areaRol] ?? 'SOLICITADO'
  // Área simple: parseSubestados devuelve `_simple` cuando el ítem no tiene
  // ninguna de las tres áreas base (p. ej. "PRODUCTO SIN DISEÑO").
  const valores = Object.entries(previos).filter(([k]) => k !== '_simple')
  if (valores.length === 1) return valores[0][1]
  return previos._simple ?? item.SUBESTADO ?? 'SOLICITADO'
}

/** El área a la que se le atribuye el cambio; '' si la prenda no tiene área base. */
function areaDelCambio(item, areaRol) {
  if (areaRol) return String(areaRol).toUpperCase()
  const areas = Object.keys(parseSubestados(item.SUBESTADO, item.AREA)).filter(k => k !== '_simple')
  return areas.length === 1 ? areas[0] : ''
}

function nuevoEvento({ item, area, antes, despues, usuario, origen }) {
  return {
    item_id: item.ITEM_ID,
    pedido_id: item.PEDIDO_ID ?? '',
    area,
    estado_antes: antes ?? '',
    estado_despues: despues ?? '',
    usuario: usuario || 'SISTEMA',
    origen,
  }
}

/**
 * Los eventos que produce mover el subestado de una prenda.
 *
 * Devuelve el evento del área y, cuando corresponde, el del corte automático.
 *
 * @param {{item:object, areaRol:?string, estadoNuevo:string, usuario:?string}} args
 * @returns {object[]} vacío si no hay nada que registrar
 */
export function eventosDelCambio({ item, areaRol, estadoNuevo, usuario }) {
  // ⚠️ Sin `item_id` no hay evento. Inventar uno con el nombre del producto sería
  // reproducir exactamente el defecto que esta tabla viene a arreglar.
  if (!item || !item.ITEM_ID) return []

  const eventos = []
  const area = areaDelCambio(item, areaRol)
  const antes = estadoAnterior(item, areaRol)
  const despues = String(estadoNuevo ?? '').trim().toUpperCase()

  if (antes !== despues) {
    eventos.push(nuevoEvento({ item, area, antes, despues, usuario, origen: 'MANUAL' }))
  }

  // ── Pieza 4: la marca de corte que se pone sola ──
  // Si el área ya está trabajando la prenda, la tela está cortada. Se registra
  // como evento aparte y con origen AUTO para que quede claro que no lo marcó
  // una persona y se pueda auditar (o revertir) después.
  const yaCortada = String(item.SUBESTADO_CORTE ?? '').trim().toUpperCase() === 'CORTADO'
  if (!yaCortada && implicaCorte(despues)) {
    eventos.push(nuevoEvento({
      item, area: 'CORTE',
      antes: item.SUBESTADO_CORTE || 'PENDIENTE', despues: 'CORTADO',
      usuario, origen: 'AUTO',
    }))
  }

  return eventos
}

/**
 * El evento de marcar (o desmarcar) el corte a mano desde la bandeja de Corte.
 * @returns {?object} null si no hay `item_id`
 */
export function eventoDeCorte({ item, estadoNuevo, usuario }) {
  if (!item || !item.ITEM_ID) return null
  return nuevoEvento({
    item, area: 'CORTE',
    antes: item.SUBESTADO_CORTE || 'PENDIENTE',
    despues: String(estadoNuevo ?? '').trim().toUpperCase(),
    usuario, origen: 'MANUAL',
  })
}

/** ¿Este cambio de subestado debe además marcar la prenda como cortada? */
export function debeAutoMarcarCorte(item, estadoNuevo) {
  if (!item || !item.ITEM_ID) return false
  if (String(item.SUBESTADO_CORTE ?? '').trim().toUpperCase() === 'CORTADO') return false
  return implicaCorte(estadoNuevo)
}
