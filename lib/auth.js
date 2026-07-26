// NOTA: el validateLogin que vivía aquí fue BORRADO. Comparaba la contraseña en
// texto plano (`u.PASSWORD_HASH === password`) y leía siempre de Sheets, así que
// habría rechazado a todo usuario con contraseña bcrypt. Nadie lo importaba, pero
// seguía siendo una trampa a un import de distancia.
// El login real vive en validateLogin de lib/db/usuarios.js.

import { cookies } from 'next/headers'
import { getUsuarioById } from './db/usuarios'
import { COOKIE_SESION, verificarSesion, secretoSesion } from './sesion'

/**
 * Cabecera con la que el cliente declaraba quién decía ser.
 * ⚠️ YA NO ES UNA CREDENCIAL: la identidad sale de la cookie firmada. El nombre
 * se conserva porque alguna pantalla todavía la manda, pero el servidor no la
 * mira para decidir permisos.
 */
export const HEADER_USUARIO = 'x-mp-usuario-id'

/** Quién llama, según la cookie firmada. null si no hay sesión de persona. */
export async function sesionActual() {
  try {
    const token = cookies().get(COOKIE_SESION)?.value
    return await verificarSesion(token, secretoSesion())
  } catch {
    return null // fuera de una petición (build, script) no hay sesión y ya
  }
}

/**
 * Autoriza una petición a una ruta de API que exige ser ADMIN.
 *
 * La identidad viene de la **cookie firmada** que emite el login: el navegador
 * la manda sola y su contenido no se puede alterar sin la llave del servidor.
 * Con ese id se relee el usuario **de la base** para comprobar que exista, esté
 * activo y sea ADMIN — nunca se confía en el rol que venga del navegador.
 *
 * Los tokens de máquina (`CRM_API_TOKEN`, que usan los agentes de WhatsApp)
 * pasan el middleware pero NO son admin: no hay persona detrás.
 *
 * @returns {Promise<{ok:true, usuario:object} | {ok:false, status:number, error:string}>}
 */
export async function requireAdmin(req) {
  const sesion = await sesionActual()
  const id = sesion?.id
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
