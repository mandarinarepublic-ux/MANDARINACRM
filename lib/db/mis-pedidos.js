// lib/db/mis-pedidos.js
//
// "Mis pedidos": lo que un vendedor tiene en fábrica.
//
// POR QUÉ EXISTE: pedía `/api/pedidos?...&scope=mios`, y ese `scope` **no
// filtraba en la base**: `joinSupabase` hacía `select('*')` de los 690 pedidos,
// los filtraba en MEMORIA y recién entonces pedía las cuatro tablas del join con
// un `.in()` de 690 ids. Ahí `detalle_pedido` pedía 1314 filas cuando PostgREST
// devuelve 1000 como mucho: **314 prendas se perdían ya**.
//
// Acá el vendedor y el estado van en la consulta, así que llegan solo sus
// pedidos en fábrica — hoy, el que más tiene son 267 en total.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'

// Solo lo que la pantalla pinta, más lo que necesita el buscador.
const COLS = [
  'pedido_id', 'unique_id', 'tienda_id', 'vendedor_id', 'fecha_pedido',
  'estado_pedido', 'estado_pago', 'monto_total',
].join(',')

const SELECT = [
  COLS,
  // El conteo de prendas como COUNT anidado: el numero exacto sin traer las
  // filas, y el count anidado NO se trunca (la lista anidada si).
  'total_prendas:detalle_pedido(count)',
  'clientes(nombre,cedula,celular)',
].join(',')

/**
 * Los pedidos EN FÁBRICA de un vendedor.
 *
 * @param {{nombre?: string, id?: string, verTodo?: boolean}} quien
 *   verTodo = ADMIN y roles de taller, que no se filtran por vendedor.
 * @returns {Promise<{pedidos:object[], completo:boolean}>}
 */
export async function listMisPedidos({ nombre, id, verTodo = false } = {}) {
  let consulta = getSupabase()
    .from('pedidos')
    .select(SELECT, { count: 'exact' })
    .eq('estado_pedido', 'EN_FABRICA')

  if (!verTodo) {
    // `vendedor_id` guarda el NOMBRE en unos pedidos y el uuid en otros: se
    // aceptan los dos, igual que hacía el filtro viejo en memoria.
    const suyos = [nombre, id].map((v) => String(v ?? '').trim()).filter(Boolean)
    // Sin identidad NO se devuelve todo: se devuelve nada. Un fallo de datos no
    // puede acabar enseñándole a un vendedor los pedidos de los demás.
    if (suyos.length === 0) return { pedidos: [], completo: true }
    consulta = consulta.in('vendedor_id', suyos)
  }

  const { data, error, count } = await consulta.order('unique_id', { ascending: false })
  if (error) throw error

  const filas = data || []
  // Solo evidencia POSITIVA marca la lista incompleta.
  const completo = typeof count !== 'number' || filas.length >= count

  return {
    pedidos: filas.map((p) => ({
      PEDIDO_ID: p.pedido_id,
      UNIQUE_ID: p.unique_id,
      TIENDA_ID: p.tienda_id ?? '',
      VENDEDOR_ID: p.vendedor_id ?? '',
      FECHA_PEDIDO: p.fecha_pedido ?? '',
      ESTADO_PEDIDO: p.estado_pedido ?? '',
      ESTADO_PAGO: p.estado_pago ?? '',
      MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
      CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
      CLIENTE_CEDULA: p.clientes?.cedula ?? '',
      CLIENTE_CELULAR: p.clientes?.celular ?? '',
      PRENDAS: p.total_prendas?.[0]?.count ?? null,
    })),
    completo,
  }
}
