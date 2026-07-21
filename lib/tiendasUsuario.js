// lib/tiendasUsuario.js
// Acceso por TIENDA. Hasta ahora los checkboxes "Tiendas con acceso" de la
// pantalla de Usuarios se guardaban pero NINGUNA pantalla los leía: eran
// decorativos y un vendedor de Mandarina veía y podía registrar pedidos de
// Indstore igual.
//
// El filtro se aplica SOLO a los roles de venta. El trabajo de fábrica es
// transversal a las tiendas (quien borda, borda para las dos), así que
// producción, corte, impresión y despacho no se filtran: hacerlo dejaría sin
// trabajo visible a gente que hoy sí lo ve.

/** Roles a los que se les aplica el acceso por tienda. */
const ROLES_FILTRADOS = ['VENDEDOR', 'VENDEDOR_YAW']

/** Tiendas asignadas, normalizadas. */
export function tiendasDe(user) {
  const t = user?.tiendas
  if (Array.isArray(t)) return t.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
  return String(t ?? '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
}

/**
 * ¿Hay que restringir a este usuario por tienda?
 * No, si es ADMIN, si no es un rol de venta, o si no tiene ninguna tienda
 * asignada — este último caso es deliberado: un dato faltante no debe dejar a
 * nadie sin ver su trabajo. Para restringir hay que asignar tiendas.
 */
export function filtraPorTienda(user) {
  if (!user || user.rol === 'ADMIN') return false
  if (!ROLES_FILTRADOS.includes(user.rol)) return false
  return tiendasDe(user).length > 0
}

/** ¿Este usuario puede ver/usar esta tienda? */
export function puedeVerTienda(user, tiendaId) {
  if (!filtraPorTienda(user)) return true
  return tiendasDe(user).includes(String(tiendaId ?? '').trim().toUpperCase())
}

/** Deja solo los pedidos de las tiendas del usuario. */
export function filtrarPedidosPorTienda(user, pedidos) {
  if (!filtraPorTienda(user)) return pedidos || []
  return (pedidos || []).filter((p) => puedeVerTienda(user, p.TIENDA_ID))
}

/**
 * Tiendas que el usuario puede elegir al registrar una venta.
 * @param {object} user
 * @param {string[]} disponibles - las que ofrece la pantalla
 */
export function tiendasDisponibles(user, disponibles) {
  if (!filtraPorTienda(user)) return disponibles
  const suyas = tiendasDe(user)
  const permitidas = disponibles.filter((t) => suyas.includes(String(t).trim().toUpperCase()))
  // Si la configuración no cuadra con lo que ofrece la pantalla, es preferible
  // dejarle todas antes que un selector vacío con el que no pueda trabajar.
  return permitidas.length > 0 ? permitidas : disponibles
}
