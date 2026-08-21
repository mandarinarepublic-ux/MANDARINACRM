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
import { seImprime } from '../prenda-se-fabrica.js'

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
  // ☠️ El CONTEO independiente de las prendas, para poder comprobar que la lista
  // llegó entera. El count anidado NO se trunca; la lista anidada SÍ.
  //
  // Sin esto, el 17-ago-2026 el IND-XAV-5641 se imprimió con UNA de sus tres
  // prendas y nadie se enteró: la pantalla nunca supo que las otras dos
  // existían. Se fabricó y se despachó de menos.
  'total_prendas:detalle_pedido(count)',
  'clientes(nombre,cedula,celular,email,ciudad,direccion)',
].join(',')

function aPedido(p) {
  // ☠️ ¿Llegaron TODAS las prendas del pedido?
  //
  // `llegaron` cuenta las filas que vinieron en el embed; `total` sale del COUNT
  // de la base, que no se trunca. Si no coinciden, la orden de producción saldría
  // corta — y eso significa fabricar y despachar menos de lo que el cliente
  // compró, sin que nadie lo note.
  //
  // Solo se marca incompleto con evidencia POSITIVA: si el conteo no llega, se
  // asume completo. El peor caso es quedarse sin aviso, nunca bloquear una
  // impresión buena.
  const todas = (p.prendas || []).length
  const total = p.total_prendas?.[0]?.count
  const hayConteo = typeof total === 'number' && Number.isFinite(total)

  return {
    PEDIDO_ID: p.pedido_id,
    // Cuántas prendas tiene el pedido DE VERDAD, según la base.
    PRENDAS_TOTAL: hayConteo ? total : null,
    PRENDAS_LLEGARON: todas,
    COMPLETO: !hayConteo || todas >= total,
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
    // ☠️ `seImprime`, NO `seFabrica`: lo entregado en tienda va al papel con su
    // visto. Si se ocultara, la hoja diría "6 PRENDAS" y pintaría 5 — la señal
    // exacta que significa "lista recortada".
    items: (p.prendas || []).filter(seImprime).map((d) => ({
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
