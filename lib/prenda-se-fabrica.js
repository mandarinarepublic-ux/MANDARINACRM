// lib/prenda-se-fabrica.js
//
// Dos preguntas DISTINTAS sobre una prenda, y confundirlas cuesta caro:
//
//   · seImprime(prenda)  → ¿sale en el papel?
//   · seFabrica(prenda)  → ¿hay que producirla?
//
// ☠️ Del 19 al 21-ago-2026 fueron la misma función, y las prendas de ENTREGA EN
// TIENDA se ocultaban de la hoja. Al poner el TOTAL en la franja de control, ese
// atajo volvió la hoja mentirosa: la cabecera decía "6 PRENDAS" y solo se
// pintaban 5, o sea exactamente la señal que inventamos para delatar una lista
// recortada. Medido el 21-ago: 5 pedidos EN_FABRICA daban esa falsa alarma.
//
// Ahora la entregada en tienda SÍ se imprime, con un ✓ que dice que ya salió.
// Quien fabrica ve las 6 prendas, cuenta 6, y sabe que una no la toca.
//
// La ELIMINADA es otra cosa: se canceló, no existe. No se imprime ni se fabrica.
// (El 21-ago-2026 no hay ninguna en toda la base, pero el día que alguien use el
// botón, no puede salir en papel.)
//
// Vive aparte y sin dependencias para que `node --test` pueda importarlo: los
// repos de `lib/db/` arrastran `supabase` y `sheets`, que no resuelven en ESM.

const sub = (prenda) => String(prenda?.subestado ?? '').toUpperCase()

/** ¿Se canceló? Ni se imprime ni se fabrica. */
export function estaEliminada(prenda) {
  if (!prenda) return true
  return prenda.eliminado === true || sub(prenda) === 'ELIMINADO'
}

/** ¿El cliente ya se la llevó de la tienda? Se imprime, pero con el visto. */
export function entregadaEnTienda(prenda) {
  return !!prenda && sub(prenda) === 'ENTREGADO_TIENDA'
}

/** ¿Va en el papel? Todo menos lo cancelado. */
export function seImprime(prenda) {
  return !!prenda && !estaEliminada(prenda)
}

/** ¿Hay algo que producir? Lo entregado en tienda ya no. */
export function seFabrica(prenda) {
  return seImprime(prenda) && !entregadaEnTienda(prenda)
}
