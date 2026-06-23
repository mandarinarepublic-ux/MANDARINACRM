import { readSheet } from './sheets'

export async function validateLogin(username, password) {
  const usuarios = await readSheet('USUARIOS')
  const user = usuarios.find(u =>
    (u.USERNAME?.toLowerCase() === username.toLowerCase() ||
     u.EMAIL?.toLowerCase() === username.toLowerCase() ||
     u.NOMBRE?.toLowerCase() === username.toLowerCase()) &&
    u.PASSWORD_HASH === password &&
    u.ACTIVO === 'TRUE'
  )
  if (!user) return null
  return {
    id: user.USUARIO_ID,
    nombre: user.NOMBRE,
    codigo: user.CODIGO,
    email: user.EMAIL,
    rol: user.ROL,
    areas: user.AREAS ? user.AREAS.split(',').map(a => a.trim()) : [],
    tiendas: user.TIENDAS ? user.TIENDAS.split(',').map(t => t.trim()) : [],
  }
}

export function canAccess(user, module) {
  const perms = {
    ADMIN:        ['nuevo_pedido', 'historial', 'produccion', 'despacho', 'pagos', 'usuarios', 'reportes'],
    VENDEDOR:     ['nuevo_pedido', 'historial'],
    VENDEDOR_YAW: ['nuevo_pedido', 'historial'],
    DISEÑO:       ['produccion'],
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
