// lib/cortePedido.js
//
// Las dos acciones de corte que operan sobre el PEDIDO entero, no prenda a
// prenda: «Cortar las N» y «Falta algo».
//
// POR QUÉ EXISTE: el cortador marcaba prenda por prenda. Un pedido de 6 prendas
// le costaba 7 clics (abrir + 6) y scroll entre seis tarjetas con foto — desde
// el celular, eso es la mitad del trabajo de registrar el trabajo.
//
// Acá vive la REGLA (pura, sin Supabase y sin red): qué prendas cambian, qué
// columnas se escriben, qué línea va a la bitácora y qué eventos por prenda.
// `app/api/corte/pedido/[id]/route.js` solo ejecuta el plan que esto devuelve.
//
// ⚠️ Las dos acciones son SIMÉTRICAS a propósito: lo que una traba, la otra
// suelta. Cualquier tercera forma de soltar la traba (un cron, una regla del
// área, vaciar la columna a mano) rompe la promesa que se le hizo al cortador:
// el pedido no se mueve hasta que él lo diga.

/** Tope de la nota. Más largo no cabe en la cabecera y nadie lo lee. */
export const TOPE_NOTA = 500

/** El estado de corte de una prenda, normalizado. NULL y '' son PENDIENTE. */
export function estadoCorte(item) {
  const v = String(item?.SUBESTADO_CORTE ?? '').trim().toUpperCase()
  return v || 'PENDIENTE'
}

/** El texto de la traba, limpio. '' si el pedido no está trabado. */
export function notaDeTraba(pedido) {
  return String(pedido?.CORTE_PENDIENTE_NOTA ?? '').trim()
}

/**
 * ¿Este pedido está trabado en Corte?
 *
 * ⚠️ Una nota de puros espacios NO traba: si trabara, el pedido quedaría clavado
 * en la bandeja con el chip vacío — el cortador vería la traba sin poder leer de
 * qué se trata.
 */
export function estaTrabado(pedido) {
  return notaDeTraba(pedido).length > 0
}

/** «2/6 cortados» — lo que se guarda en la bitácora como punto de partida. */
export function resumenCorte(items) {
  const lista = Array.isArray(items) ? items : []
  const cortadas = lista.filter((i) => estadoCorte(i) === 'CORTADO').length
  return { total: lista.length, cortadas, texto: `${cortadas}/${lista.length} cortados` }
}

/** El estado de partida para la bitácora: el resumen, más la traba si la había. */
function situacionPrevia(pedido, items) {
  const { texto } = resumenCorte(items)
  const traba = notaDeTraba(pedido)
  return traba ? `${texto} · trabado: "${traba}"` : texto
}

function eventoPrenda(item, antes, despues, usuario) {
  return {
    item_id: item.ITEM_ID,
    pedido_id: item.PEDIDO_ID ?? '',
    area: 'CORTE',
    estado_antes: antes,
    estado_despues: despues,
    usuario: usuario || 'SISTEMA',
    // MANUAL: lo marcó una persona desde la bandeja. El origen AUTO queda
    // reservado para el auto-marcado del área, que es lo que hay que poder
    // distinguir después.
    origen: 'MANUAL',
  }
}

/**
 * Lo común a las dos acciones: a qué prendas hay que escribirles y qué eventos
 * salen de ahí. Las que ya están en el estado destino NO se reescriben — ni
 * generan evento, porque no pasó nada.
 */
function cambios(items, destino, usuario) {
  const lista = (Array.isArray(items) ? items : []).filter((i) => i?.ITEM_ID)
  const mover = lista.filter((i) => estadoCorte(i) !== destino)
  return {
    itemIds: mover.map((i) => i.ITEM_ID),
    eventos: mover.map((i) => eventoPrenda(i, estadoCorte(i), destino, usuario)),
  }
}

/**
 * «Cortar las N»: el pedido entero queda CORTADO y la traba se suelta.
 *
 * @param {{pedido:object, items:object[], usuario:string, ahora?:string}} args
 * @returns {{ok:boolean, error?:string, subestado?:string, itemIds?:string[],
 *            columnas?:object, log?:object, eventos?:object[]}}
 */
export function planCortarTodo({ pedido, items, usuario, ahora }) {
  const lista = (Array.isArray(items) ? items : []).filter((i) => i?.ITEM_ID)

  // ☠️ Sin prendas no hay corte que registrar. `todosItemsListos` usa `.every()`
  // y da `true` con la lista vacía, auto-despachando un pedido sin nada dentro;
  // esa mina no se rearma acá. Y un pedido que llegó sin prendas es justo el que
  // hay que mirar, no el que hay que dar por hecho.
  if (lista.length === 0) {
    return { ok: false, error: 'Este pedido no tiene prendas en el taller: no hay nada que cortar.' }
  }

  const fecha = ahora || new Date().toISOString()
  const antes = situacionPrevia(pedido, lista)
  const { itemIds, eventos } = cambios(lista, 'CORTADO', usuario)

  return {
    ok: true,
    subestado: 'CORTADO',
    itemIds,
    columnas: {
      // Cortar todo SUELTA la traba: es la única forma de soltarla.
      corte_pendiente_nota: null,
      corte_pendiente_fecha: null,
      corte_pendiente_usuario: null,
      corte_terminado_fecha: fecha,
      corte_terminado_usuario: usuario || 'SISTEMA',
    },
    // UNA línea, no una por prenda: seis líneas por pedido inundarían la ficha y
    // la bitácora dejaría de leerse. El detalle por prenda va a `prenda_eventos`,
    // que existe justo para eso.
    log: {
      campo: 'CORTE PEDIDO',
      antes,
      despues: `CORTADO (${lista.length} prenda${lista.length === 1 ? '' : 's'})`,
    },
    eventos,
  }
}

/**
 * «Falta algo»: el pedido entero vuelve a PENDIENTE y queda trabado con el
 * motivo escrito.
 *
 * ⚠️ Vuelven a pendiente TODAS, incluidas las que ya estaban cortadas. Es una
 * decisión de producto, no un descuido: no se sabe cuál de las prendas es la que
 * falta, así que la única fuente de verdad es el texto que escribe el cortador.
 *
 * @param {{pedido:object, items:object[], nota:string, usuario:string, ahora?:string}} args
 */
export function planFaltaAlgo({ pedido, items, nota, usuario, ahora }) {
  const texto = String(nota ?? '').trim().slice(0, TOPE_NOTA)

  // Sin texto no hay traba: una traba muda deja el pedido clavado en la bandeja
  // sin decir por qué, y nadie puede resolverla.
  if (!texto) {
    return { ok: false, error: 'Escribe qué falta: ese texto es lo único que nos dice por qué el pedido se queda.' }
  }

  const lista = (Array.isArray(items) ? items : []).filter((i) => i?.ITEM_ID)
  const fecha = ahora || new Date().toISOString()
  const antes = situacionPrevia(pedido, lista)
  // Un pedido sin prendas igual se puede trabar: «no llegaron las prendas al
  // taller» es precisamente un motivo válido.
  const { itemIds, eventos } = cambios(lista, 'PENDIENTE', usuario)

  return {
    ok: true,
    subestado: 'PENDIENTE',
    itemIds,
    columnas: {
      corte_pendiente_nota: texto,
      corte_pendiente_fecha: fecha,
      corte_pendiente_usuario: usuario || 'SISTEMA',
      // Deja de estar terminado: si se quedara la fecha vieja, un pedido trabado
      // se vería como cortado en cualquier reporte que mire esa columna.
      corte_terminado_fecha: null,
      corte_terminado_usuario: null,
    },
    log: {
      campo: 'CORTE PEDIDO',
      antes,
      despues: `PENDIENTE · falta: "${texto}"`,
    },
    eventos,
  }
}
