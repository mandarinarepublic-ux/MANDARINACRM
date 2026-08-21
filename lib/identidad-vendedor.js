// lib/identidad-vendedor.js
//
// Con qué valores se busca a un vendedor en `crm.pedidos.vendedor_id`.
//
// ☠️ ESA COLUMNA GUARDA EL NOMBRE **TAL CUAL**, espacios incluidos.
//
// `Clever ` tiene un espacio al final en `crm.usuarios.nombre`, y sus 69 pedidos
// guardan exactamente `Clever ` con el espacio. Al recortar el nombre antes de
// buscar se comparaba `Clever` contra `Clever ` — cero coincidencias — y el
// vendedor se quedaba sin ver NI UNO de sus pedidos en Historial y en Mis
// pedidos. Reportado por Rodrigo el 21-ago-2026; lo introduje yo el 19-ago al
// mover el filtro por vendedor al servidor.
//
// Por eso se buscan las DOS formas: el valor crudo y el recortado. Un pedido
// viejo puede tener una y uno nuevo la otra, y ninguna de las dos puede dejar a
// nadie sin su trabajo.
//
// ⚠️ NO se arregla "limpiando" el nombre en `usuarios`: eso dejaría huérfanos
// los 69 pedidos ya guardados. Por lo mismo NOMBRE no es editable desde la
// pantalla de Usuarios.

/**
 * Los valores con los que buscar los pedidos de este usuario.
 *
 * @param {{NOMBRE?: string, nombre?: string, USUARIO_ID?: string, id?: string}} usuario
 * @returns {string[]} sin repetidos ni vacíos
 */
export function identidadesDe(usuario) {
  const crudos = [
    usuario?.NOMBRE ?? usuario?.nombre,
    usuario?.USUARIO_ID ?? usuario?.id,
  ]
  const salida = new Set()
  for (const v of crudos) {
    const s = String(v ?? '')
    if (s) salida.add(s)                 // tal cual: `Clever `
    const t = s.trim()
    if (t) salida.add(t)                 // y recortado: `Clever`
  }
  return [...salida]
}
