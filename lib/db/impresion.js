// lib/db/impresion.js
//
// La cola de Impresión: las órdenes de producción que hay que sacar en papel.
//
// POR QUÉ EXISTE: pedía `/api/pedidos?rol=ADMIN` — los 683 pedidos con sus cinco
// tablas unidas (~970 kB) — para mostrar 75. Con `crm.pedidos` creciendo 72 por
// semana, al pasar de 1000 PostgREST habría empezado a cortar EN SILENCIO y la
// lista dejaría de mostrar pedidos que hay que imprimir.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'
import { seFabrica } from '../prenda-se-fabrica.js'

const COLS_PEDIDO = [
  'pedido_id', 'unique_id', 'tienda_id', 'cliente_id', 'vendedor_id',
  'fecha_pedido', 'fecha_entrega_prometida', 'estado_pedido', 'monto_total',
  'notas_vendedor', 'direccion_pedido', 'fecha_impresion_produccion', 'impreso_por',
].join(',')

// Todo lo que la hoja de producción pinta (components/pedido/PdfPedido.js).
const COLS_PRENDA = [
  'item_id', 'pedido_id', 'producto_nombre', 'detalle_personalizado', 'color', 'talla',
  'cantidad', 'area', 'subestado', 'notas_area',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url', 'archivo_diseno',
].join(',')

const SELECT = [
  COLS_PEDIDO,
  `prendas:detalle_pedido(${COLS_PRENDA})`,
  'clientes(nombre,cedula,celular,email,ciudad,direccion)',
].join(',')

function aPedido(p) {
  return {
    PEDIDO_ID: p.pedido_id,
    UNIQUE_ID: p.unique_id,
    TIENDA_ID: p.tienda_id ?? '',
    CLIENTE_ID: p.cliente_id ?? '',
    VENDEDOR_ID: p.vendedor_id ?? '',
    FECHA_PEDIDO: p.fecha_pedido ?? '',
    FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
    ESTADO_PEDIDO: p.estado_pedido ?? '',
    MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
    NOTAS_VENDEDOR: p.notas_vendedor ?? '',
    DIRECCION_PEDIDO: p.direccion_pedido ?? '',
    DIRECCION_TEXTO: p.direccion_pedido ?? '',
    FECHA_IMPRESION_PRODUCCION: p.fecha_impresion_produccion ?? '',
    IMPRESO_POR: p.impreso_por ?? '',
    CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
    CLIENTE_CEDULA: p.clientes?.cedula ?? '',
    CLIENTE_CELULAR: p.clientes?.celular ?? '',
    items: (p.prendas || []).filter(seFabrica).map((d) => ({
      ITEM_ID: d.item_id,
      PRODUCTO_NOMBRE: d.producto_nombre ?? '',
      DETALLE_PERSONALIZADO: d.detalle_personalizado ?? '',
      COLOR: d.color ?? '',
      TALLA: d.talla ?? '',
      CANTIDAD: d.cantidad != null ? String(d.cantidad) : '1',
      AREA: d.area ?? '',
      SUBESTADO: d.subestado ?? '',
      NOTAS_AREA: d.notas_area ?? '',
      'NOTAS_AREA ': d.notas_area ?? '',       // clave real de la hoja (paridad)
      FOTO_PECHO_URL: d.foto_pecho_url ?? '',
      FOTO_ESPALDA_URL: d.foto_espalda_url ?? '',
      FOTO_MANGA_D_URL: d.foto_manga_d_url ?? '',
      FOTO_MANGA_I_URL: d.foto_manga_i_url ?? '',
      ARCHIVO_DISENO: d.archivo_diseno ?? '',
      'ARCHIVO_DISEÑO_URL': d.archivo_diseno ?? '',
    })),
  }
}

/**
 * Los pedidos que están en fábrica, con sus prendas fabricables.
 *
 * ⚠️ NO se filtra por `PENDIENTE_FABRICA`: ese estado NO EXISTE. Cero pedidos lo
 * han tenido nunca, y la condición estaba copiada en cinco archivos haciendo
 * creer que era parte del flujo.
 *
 * @returns {Promise<{pedidos:object[], completo:boolean}>}
 */
export async function listImpresion() {
  const { data, error, count } = await getSupabase()
    .from('pedidos')
    .select(SELECT, { count: 'exact' })
    .eq('estado_pedido', 'EN_FABRICA')
    .order('unique_id', { ascending: true })   // FIFO: lo que lleva más esperando
  if (error) throw error

  const filas = data || []
  // Solo evidencia POSITIVA marca la lista incompleta.
  const completo = typeof count !== 'number' || filas.length >= count

  return { pedidos: filas.map(aPedido), completo }
}
