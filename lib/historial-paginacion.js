// lib/historial-paginacion.js
//
// Cuánto se puede creer del `count` del Historial, y qué se le dice a la
// pantalla. Puro a propósito: la parte peligrosa es la decisión, no la consulta.
//
// EL FALLO QUE LO ORIGINÓ (4-sep-2026, 19:45): «El Historial fallo al cargar:
// Requested range not satisfiable» — PostgREST contestando a un `.range()` que
// arranca más allá de la última fila.
//
// ☠️ CAUSA: con filtro de área la consulta añade
// `filtro_area:detalle_pedido!inner(area)`. El `!inner` es a una relación de
// MUCHOS, así que `count: 'exact'` cuenta FILAS DEL JOIN, no pedidos. Medido:
// ESTAMPADO 441 pedidos → 733 filas (1,66×), BORDADO 308 → 439, SUBLIMACION
// 40 → 70. La cabecera mentía y `hayMas` seguía en true pasada la última página,
// hasta que «Ver más» pedía un tramo inexistente.
//
// La regla es la misma que `esCompleta` en bandeja-estado.js: un número que no
// se puede sostener NO se publica. Vale más «no sé cuántos son» que un total
// inventado, porque el inventado se lee como cierto.

/**
 * ¿El `count` de esta consulta cuenta pedidos, o filas de un join?
 * @param {{areaPedida?: ?string}} opts
 */
export function conteoEsFiable({ areaPedida } = {}) {
  // Hoy el único join que multiplica es el de área. Si algún día se agrega otro
  // embed `!inner` a una relación de muchos, tiene que sumarse acá.
  return !areaPedida
}

/**
 * Qué total y qué `hayMas` se le entregan a la pantalla.
 *
 * @param {{conteo:?number, recibidas:number, primera:number, tamano:number, fiable:boolean}} opts
 * @returns {{total:?number, hayMas:boolean}}
 */
export function resumenPagina({ conteo, recibidas, primera, tamano, fiable }) {
  // Una página vacía cierra la paginación siempre, venga de donde venga.
  if (!recibidas) return { total: fiable && typeof conteo === 'number' ? conteo : null, hayMas: false }

  if (fiable && typeof conteo === 'number') {
    return { total: conteo, hayMas: primera + recibidas < conteo }
  }

  // Sin un total creíble, la única señal honesta es si la página vino llena.
  // Cuesta un clic de más cuando el último tramo cae justo en el múltiplo, y a
  // cambio nunca ofrece una página que no existe.
  return { total: null, hayMas: recibidas === tamano }
}

/**
 * ¿Este error es «pediste un tramo que no existe» y no una avería?
 *
 * ⚠️ Solo este caso se convierte en página vacía. Tragarse cualquier otro error
 * haría que «no hay trabajo» y «no pude leer» se vieran idénticos — el bug que
 * este repo ya pagó con 21 pedidos invisibles durante 14 días.
 */
export function esFueraDeRango(error) {
  if (!error) return false
  if (error.code === 'PGRST103') return true
  return /requested range not satisfiable/i.test(String(error.message ?? ''))
}
