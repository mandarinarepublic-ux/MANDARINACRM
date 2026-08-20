// lib/prenda-se-fabrica.js
//
// ¿Esta prenda va en la hoja de producción?
//
// ☠️ Se decide acá y NO en el PDF. `components/pedido/PdfPedido.js` pintaba
// TODOS los ítems del pedido sin mirar nada:
//
//   · las ELIMINADAS se habrían mandado a fabricar igual — el taller haría algo
//     que se canceló. El 19-ago-2026 no había ninguna en toda la base y la
//     bitácora no registra ni una eliminación, pero la función existe y el día
//     que alguien la use, sale en papel;
//   · las de ENTREGA EN TIENDA sí se estaban imprimiendo: 3 ese día. No hay nada
//     que fabricar con ellas, es ruido para quien lee la orden.
//
// Vive aparte y sin dependencias para que `node --test` pueda importarlo: los
// repos de `lib/db/` arrastran `supabase` y `sheets`, que no resuelven en ESM.

export function seFabrica(prenda) {
  if (!prenda) return false
  if (prenda.eliminado === true) return false
  const sub = String(prenda.subestado ?? '').toUpperCase()
  return sub !== 'ELIMINADO' && sub !== 'ENTREGADO_TIENDA'
}
