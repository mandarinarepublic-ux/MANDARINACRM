// NOTA: el validateLogin que vivía aquí fue BORRADO. Comparaba la contraseña en
// texto plano (`u.PASSWORD_HASH === password`) y leía siempre de Sheets, así que
// habría rechazado a todo usuario con contraseña bcrypt. Nadie lo importaba, pero
// seguía siendo una trampa a un import de distancia.
// El login real vive en validateLogin de lib/db/usuarios.js.

import { getUsuarioById } from './db/usuarios'

/** Cabecera con la que el cliente declara quién dice ser. */
export const HEADER_USUARIO = 'x-mp-usuario-id'

/**
 * Autoriza una petición a una ruta de API que exige ser ADMIN.
 *
 * La app no tiene sesión firmada (el usuario vive en localStorage), así que el
 * cliente manda su USUARIO_ID y aquí se comprueba **contra la base**: que exista,
 * que esté activo y que su rol sea ADMIN. No se confía en el rol que venga del
 * navegador — ese es justamente el que se puede falsificar editando localStorage.
 *
 * Esto NO es autenticación fuerte: quien conozca un USUARIO_ID de admin puede
 * suplantarlo. Cierra el agujero de "cualquiera en internet crea un usuario ADMIN"
 * y es el paso previo a mover la sesión a una cookie firmada.
 *
 * @returns {Promise<{ok:true, usuario:object} | {ok:false, status:number, error:string}>}
 */
export async function requireAdmin(req) {
  const id = req.headers.get(HEADER_USUARIO)
  if (!id) return { ok: false, status: 401, error: 'No autenticado' }

  let usuario
  try {
    usuario = await getUsuarioById(id)
  } catch (e) {
    console.error('requireAdmin: fallo verificando la sesión:', e?.message || e)
    return { ok: false, status: 500, error: 'No se pudo verificar la sesión' }
  }

  if (!usuario) return { ok: false, status: 401, error: 'Sesión inválida, vuelve a entrar' }
  if (usuario.ACTIVO !== 'TRUE') return { ok: false, status: 403, error: 'Usuario desactivado' }
  if (usuario.ROL !== 'ADMIN') return { ok: false, status: 403, error: 'Solo un ADMIN puede hacer esto' }

  return { ok: true, usuario }
}

export function canAccess(user, module) {
  const perms = {
    ADMIN:        ['nuevo_pedido', 'historial', 'produccion', 'despacho', 'pagos', 'usuarios', 'reportes'],
    VENDEDOR:     ['nuevo_pedido', 'historial'],
    VENDEDOR_YAW: ['nuevo_pedido', 'historial'],
    'DISEÑO':     ['produccion'],
    ESTAMPADO:    ['produccion'],
    SUBLIMACION:  ['produccion'],
    BORDADO:      ['produccion'],
    CORTE:        ['produccion'],
    DESPACHO:     ['despacho'],
  }
  return perms[user.rol]?.includes(module) || false
}

export function getTiendaConfig(tiendaId) {
  return {
    MANDARINA: {
      id: 'MANDARINA',
      nombre: 'Mandarina Republic',
      prefijo: 'MAN',
      color: '#FF6B00',
      shopifyStore: process.env.SHOPIFY_MANDARINA_STORE,
      shopifyToken: process.env.SHOPIFY_MANDARINA_TOKEN,
    },
    INDSTORE: {
      id: 'INDSTORE',
      nombre: 'Indstore',
      prefijo: 'IND',
      color: '#1A1A2E',
      shopifyStore: process.env.SHOPIFY_INDSTORE_STORE,
      shopifyToken: process.env.SHOPIFY_INDSTORE_TOKEN,
    },
    YAW: {
      id: 'YAW',
      nombre: 'YAW',
      prefijo: 'YAW',
      color: '#6C3FC5',
    },
  }[tiendaId]
}
