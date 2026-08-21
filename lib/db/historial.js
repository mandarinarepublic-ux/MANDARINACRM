// lib/db/historial.js
//
// El Historial: TODO el registro de ventas, pero traído de a páginas.
//
// POR QUÉ EXISTE: la pantalla pedía `/api/pedidos?rol=ADMIN`, que trae los 680
// pedidos con sus cinco tablas unidas (~970 kB) para pintar 30, y después
// filtraba y paginaba en el navegador. Con `crm.pedidos` en 680 y creciendo 72
// por semana, en ~4 semanas PostgREST habría empezado a cortar en 1000 EN
// SILENCIO — y el Historial dejaría de encontrar pedidos viejos, que es su
// único trabajo. Encima es a donde mandamos a Despacho a buscar los cerrados.
//
// Ahora el servidor filtra, ordena y pagina; el navegador solo pinta.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'
import { idsClientesQueCoinciden } from './clientes'
import { identidadesDe } from '../identidad-vendedor.js'

export const TAMANO_PAGINA = 30

const COLS_PEDIDO = [
  'pedido_id', 'unique_id', 'tienda_id', 'vendedor_id', 'fecha_pedido',
  'estado_pedido', 'estado_pago', 'monto_total', 'monto_pendiente',
].join(',')

const COLS_PRENDA = [
  'item_id', 'pedido_id', 'producto_nombre', 'color', 'talla', 'subestado', 'foto_pecho_url',
].join(',')

const SELECT = [
  COLS_PEDIDO,
  `prendas:detalle_pedido(${COLS_PRENDA})`,
  'clientes(nombre,cedula,celular)',
].join(',')

/** Roles a los que se les aplica el acceso por tienda (igual que lib/tiendasUsuario). */
const ROLES_POR_TIENDA = ['VENDEDOR', 'VENDEDOR_YAW']

function tiendasDe(usuario) {
  const t = usuario?.TIENDAS ?? usuario?.tiendas
  const lista = Array.isArray(t) ? t : String(t ?? '').split(',')
  return lista.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
}

/**
 * Aplica el alcance del usuario EN EL SERVIDOR.
 *
 * Antes esto vivía en el navegador: la API mandaba todos los pedidos y la
 * pantalla escondía los que no tocaban. Esconder no es restringir.
 */
function aplicarAlcance(consulta, usuario) {
  const rol = String(usuario?.ROL ?? usuario?.rol ?? '').toUpperCase()
  if (rol === 'ADMIN') return consulta

  if (rol === 'VENDEDOR') {
    // ☠️ NADA de `.trim()` acá: `vendedor_id` guarda el nombre TAL CUAL, y
    // `Clever ` lleva un espacio al final. Recortarlo dejó a ese vendedor sin
    // ver ni uno de sus 69 pedidos. Ver lib/identidad-vendedor.js.
    const suyos = identidadesDe(usuario)
    if (suyos.length) consulta = consulta.in('vendedor_id', suyos)
  }
  if (rol === 'VENDEDOR_YAW') consulta = consulta.eq('tienda_id', 'YAW')

  // Acceso por tienda: solo roles de venta y solo si tiene tiendas asignadas.
  // Sin tiendas NO se restringe: un dato faltante no puede dejar a nadie sin ver
  // su trabajo (mismo criterio que lib/tiendasUsuario.js).
  if (ROLES_POR_TIENDA.includes(rol)) {
    const suyas = tiendasDe(usuario)
    if (suyas.length) consulta = consulta.in('tienda_id', suyas)
  }
  return consulta
}

function aPedido(p) {
  const prendas = (p.prendas || []).filter((d) => d.subestado !== 'ELIMINADO')
  return {
    PEDIDO_ID: p.pedido_id,
    UNIQUE_ID: p.unique_id,
    TIENDA_ID: p.tienda_id ?? '',
    VENDEDOR_ID: p.vendedor_id ?? '',
    FECHA_PEDIDO: p.fecha_pedido ?? '',
    ESTADO_PEDIDO: p.estado_pedido ?? '',
    ESTADO_PAGO: p.estado_pago ?? '',
    MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
    MONTO_PENDIENTE: p.monto_pendiente != null ? String(p.monto_pendiente) : '',
    CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
    CLIENTE_CEDULA: p.clientes?.cedula ?? '',
    CLIENTE_CELULAR: p.clientes?.celular ?? '',
    items: prendas.map((d) => ({
      ITEM_ID: d.item_id,
      PRODUCTO_NOMBRE: d.producto_nombre ?? '',
      COLOR: d.color ?? '',
      TALLA: d.talla ?? '',
      SUBESTADO: d.subestado ?? '',
      FOTO_PECHO_URL: d.foto_pecho_url ?? '',
    })),
  }
}

/**
 * Una página del historial, ya filtrada y ordenada por la base.
 *
 * El orden es por `unique_id` descendente y NO por fecha: el número es exacto y
 * tiene índice, mientras que dos pedidos del mismo instante desempataban
 * comparando textos (`MAN-...` contra `IND-...`), que ordena por tienda.
 *
 * @returns {Promise<{pedidos:object[], total:number|null, hayMas:boolean, pagina:number}>}
 */
export async function listHistorial({
  usuario, pagina = 0, estado, tienda, pago, desde, hasta, busqueda,
} = {}) {
  const sb = getSupabase()
  const pag = Math.max(0, Number(pagina) || 0)

  let consulta = sb.from('pedidos').select(SELECT, { count: 'exact' })
  consulta = aplicarAlcance(consulta, usuario)

  if (estado && estado !== 'TODOS') consulta = consulta.eq('estado_pedido', estado)
  if (tienda && tienda !== 'TODAS') consulta = consulta.eq('tienda_id', tienda)
  if (pago && pago !== 'TODOS') consulta = consulta.eq('estado_pago', pago)
  if (desde) consulta = consulta.gte('fecha_pedido', desde)
  if (hasta) consulta = consulta.lte('fecha_pedido', hasta)

  // Búsqueda sobre TODO el histórico, no sobre la página.
  //
  // El número de pedido se busca en la propia tabla; el nombre, la cédula y el
  // celular viven en `clientes`, así que primero se resuelve a qué clientes
  // corresponden (consulta acotada, sin tildes) y se filtra por sus ids.
  const termino = String(busqueda ?? '').trim()
  let busquedaTruncada = false
  if (termino) {
    const { ids, truncado } = await idsClientesQueCoinciden(termino)
    busquedaTruncada = truncado
    const porNumero = `pedido_id.ilike.*${termino.replace(/[*,()]/g, '')}*`
    consulta = ids.length
      ? consulta.or(`${porNumero},cliente_id.in.(${ids.join(',')})`)
      : consulta.or(porNumero)
  }

  const primera = pag * TAMANO_PAGINA
  const { data, error, count } = await consulta
    .order('unique_id', { ascending: false })
    .range(primera, primera + TAMANO_PAGINA - 1)
  if (error) throw error

  const pedidos = (data || []).map(aPedido)
  const total = typeof count === 'number' ? count : null
  // Con el total se sabe si hay más; sin él, se deduce de si la página vino
  // llena. Nunca se dice "no hay más" por no saberlo.
  const hayMas = total !== null ? primera + pedidos.length < total : pedidos.length === TAMANO_PAGINA

  return { pedidos, total, hayMas, pagina: pag, busquedaTruncada }
}
