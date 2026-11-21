// Estados que SACAN el pedido de las bandejas del taller. Un toque equivocado en
// el combo (o una flecha del teclado sobre un <select> cerrado, en Windows)
// cerraba o cancelaba el pedido al instante y desaparecía de la lista. Por eso
// estos tres piden confirmación antes de mandarse (crítica Impeccable, 21-nov-2026).
export const ESTADOS_FINALES = ['COMPLETADO', 'ENTREGADO', 'CANCELADO']

export function pideConfirmacion(antes, nuevo) {
  if (!nuevo || nuevo === antes) return false
  return ESTADOS_FINALES.includes(nuevo)
}

// Cuánto se queda a la vista una prenda recién marcada ✅ Listo, con su botón
// «Deshacer», antes de que el filtro «Todos» la esconda.
export const MS_DESHACER_LISTO = 5000

// El filtro «Todos» de Producción esconde lo LISTO. Una prenda recién marcada se
// queda visible unos segundos para poder deshacer el toque.
export function visibleEnTodos(estadoGlobal, { busqueda = '', recienListo = false } = {}) {
  if (busqueda) return true
  if (estadoGlobal !== 'LISTO') return true
  return recienListo
}
