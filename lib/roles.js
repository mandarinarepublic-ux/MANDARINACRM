// lib/roles.js
// Fuente ÚNICA de los roles del CRM.
//
// Existía la misma lista escrita a mano en varios sitios y se desfasaron: el
// formulario de Usuarios solo ofrecía 4 roles (ADMIN, VENDEDOR, DISEÑO, DESPACHO)
// mientras el menú y las pantallas de producción usaban 9. Consecuencia real en
// producción: al editar a un usuario CORTE o VENDEDOR_YAW el desplegable salía en
// blanco y bastaba tocarlo para degradarlo sin posibilidad de volver a su rol.

/** Roles de producción: trabajan sobre las prendas y tienen "áreas" asignables. */
export const ROLES_PRODUCCION = ['DISEÑO', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO', 'CORTE']

/** Áreas asignables a un usuario de producción. */
export const AREAS = ['SUBLIMACION', 'ESTAMPADO', 'BORDADO']

/**
 * Todos los roles válidos, en el orden en que conviene mostrarlos.
 * Debe coincidir con los roles usados en app/dashboard/layout.js (NAV_ALL).
 */
export const ROLES = [
  'ADMIN',
  'VENDEDOR',
  'VENDEDOR_YAW',
  'DISEÑO',
  'ESTAMPADO',
  'SUBLIMACION',
  'BORDADO',
  'CORTE',
  'DESPACHO',
]

/** Etiqueta legible para los desplegables. */
export const ROL_LABEL = {
  ADMIN:        'ADMIN — acceso total',
  VENDEDOR:     'VENDEDOR — ventas Mandarina/Indstore',
  VENDEDOR_YAW: 'VENDEDOR_YAW — ventas YAW',
  'DISEÑO':     'DISEÑO — producción (con áreas)',
  ESTAMPADO:    'ESTAMPADO — producción',
  SUBLIMACION:  'SUBLIMACION — producción',
  BORDADO:      'BORDADO — producción',
  CORTE:        'CORTE — corte de prendas',
  DESPACHO:     'DESPACHO — envíos y guías',
}

export function esRolValido(rol) {
  return ROLES.includes(rol)
}

/** ¿A este rol tiene sentido asignarle áreas? */
export function usaAreas(rol) {
  return ROLES_PRODUCCION.includes(rol)
}

/**
 * Qué pasa realmente si un usuario de producción se queda SIN áreas.
 * No es lo mismo para todos los roles, y decirlo mal lleva al admin a "arreglar"
 * cosas que no están rotas:
 *  - DISEÑO no tiene área propia → sin áreas no ve nada.
 *  - ESTAMPADO/SUBLIMACION/BORDADO caen en su propio rol como área.
 *  - CORTE ve todas las prendas, las áreas no le afectan en Producción.
 * (ver itemEsDeUsuario en app/dashboard/produccion/page.js)
 */
export function avisoSinAreas(rol) {
  if (rol === 'DISEÑO') return '⚠️ Sin áreas asignadas no verá ninguna prenda en Producción.'
  if (rol === 'CORTE') return 'CORTE ve todas las prendas en Producción; las áreas no le afectan.'
  if (['ESTAMPADO', 'SUBLIMACION', 'BORDADO'].includes(rol)) {
    return `Sin áreas asignadas verá únicamente las prendas de ${rol}.`
  }
  return ''
}
