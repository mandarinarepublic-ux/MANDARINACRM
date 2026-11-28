// lib/pedidoAjeno.js — candado de ESCRITURA por vendedor (27-nov-2026).
//
// Un VENDEDOR solo modifica sus propios pedidos (lib/tiendasUsuario.js →
// puedeModificarPedido). Quien tiene VER_TODAS_LAS_VENTAS ve los de todos, pero
// no los toca. La identidad sale de la COOKIE FIRMADA; sin sesión solo se llega
// con el token de máquina (agentes, webhooks), que no es un vendedor.

import { sesionActual } from './auth'
import { getUsuarioById } from './db/usuarios'
import { getPedidoById } from './db/pedidos'
import { puedeModificarPedido } from './tiendasUsuario'

/**
 * Devuelve una respuesta 403 si quien llama es un vendedor y el pedido es de
 * otro; null si puede seguir. Acepta el pedido ya leído o solo su id.
 */
export async function rechazoSiPedidoAjeno(pedidoOId) {
  const sesion = await sesionActual()
  if (!sesion?.id) return null
  const usuario = await getUsuarioById(sesion.id).catch(() => null)
  if (String(usuario?.ROL ?? '').toUpperCase() !== 'VENDEDOR') return null
  const pedido = typeof pedidoOId === 'string' ? await getPedidoById(pedidoOId) : pedidoOId
  if (!pedido) return null   // la ruta ya responde su propio 404
  if (puedeModificarPedido(usuario, { vendedorId: pedido.VENDEDOR_ID })) return null
  return Response.json(
    { ok: false, error: 'Este pedido es de otro vendedor: lo puedes ver, pero no modificar.' },
    { status: 403 },
  )
}
