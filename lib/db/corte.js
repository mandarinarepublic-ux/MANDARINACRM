// lib/db/corte.js
//
// La bandeja de CORTE: las prendas de los pedidos que están en fábrica.
//
// POR QUÉ EXISTE: la pantalla comía de `/api/pedidos`, que trae las cinco tablas
// enteras — 663 filas y 972 kB para trabajar sobre 136 prendas. Y con ello
// heredaba el tope de 1000 filas de PostgREST, el mismo que dejó 21 pedidos
// invisibles en Producción durante 14 días.
//
// Acá se piden solo los pedidos EN_FABRICA con sus prendas: 204 filas, ~80 kB.
//
// ⚠️ CORTE NO SE REPARTE POR ÁREA, a diferencia de Producción: corta la tela de
// cualquier área, así que ve todas las prendas. Lo único que queda fuera son las
// de ENTREGA EN TIENDA, que la vista `prendas_en_taller` ya excluye — nacen
// entregadas y nunca pasan por fábrica.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'
import { esCompleta } from '../bandeja-estado.js'

// Solo lo que la pantalla pinta. Verificado campo por campo contra
// app/dashboard/corte/page.js.
const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'fecha_pedido', 'fecha_entrega_prometida',
].join(',')

const COLS_PRENDA = [
  'item_id', 'pedido_id', 'producto_nombre', 'color', 'talla', 'cantidad',
  'area', 'subestado', 'subestado_corte', 'detalle_personalizado',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url',
].join(',')

const SELECT = [
  COLS_PEDIDO,
  `prendas:prendas_en_taller(${COLS_PRENDA})`,
  'total_prendas:prendas_en_taller(count)',
  'clientes(nombre,cedula,celular)',
].join(',')

function aPrenda(d) {
  return {
    ITEM_ID: d.item_id,
    PEDIDO_ID: d.pedido_id,
    PRODUCTO_NOMBRE: d.producto_nombre ?? '',
    COLOR: d.color ?? '',
    TALLA: d.talla ?? '',
    CANTIDAD: d.cantidad != null ? String(d.cantidad) : '',
    AREA: d.area ?? '',
    SUBESTADO: d.subestado ?? '',
    SUBESTADO_CORTE: d.subestado_corte ?? '',
    DETALLE_PERSONALIZADO: d.detalle_personalizado ?? '',
    FOTO_PECHO_URL: d.foto_pecho_url ?? '',
    FOTO_ESPALDA_URL: d.foto_espalda_url ?? '',
    FOTO_MANGA_D_URL: d.foto_manga_d_url ?? '',
    FOTO_MANGA_I_URL: d.foto_manga_i_url ?? '',
  }
}

/**
 * Los pedidos EN_FABRICA con TODAS sus prendas de taller.
 *
 * Se traen también las ya cortadas: son pocas y el filtro de la pantalla
 * (Pendiente / Solicitado / Cortado) necesita poder enseñarlas.
 *
 * @returns {Promise<{pedidos:object[], meta:{pedidos:number, prendas:number, porCortar:number, completo:boolean, pedidosIncompletos:number}}>}
 */
export async function listBandejaCorte() {
  const sb = getSupabase()

  const { data, error, count } = await sb
    .from('pedidos')
    .select(SELECT, { count: 'exact' })
    .eq('estado_pedido', 'EN_FABRICA')
  if (error) throw error

  const filas = data || []
  const completo = esCompleta({ recibidas: filas.length, total: count })

  const pedidos = []
  let prendas = 0
  let porCortar = 0
  let incompletos = 0

  for (const p of filas) {
    const llegaron = (p.prendas || []).length
    const totalPrendas = p.total_prendas?.[0]?.count

    // Solo se marca incompleto con evidencia POSITIVA. Si el conteo no llega, el
    // peor caso es quedarse sin aviso — nunca gritar en falso ni vaciar la
    // bandeja. Es la lección de la alarma de los 64 del 19-ago.
    const hayConteo = typeof totalPrendas === 'number' && Number.isFinite(totalPrendas)
    const completoPedido = !hayConteo || llegaron >= totalPrendas
    if (!completoPedido) incompletos++

    const items = (p.prendas || []).map(aPrenda)
    if (items.length === 0 && completoPedido) continue

    prendas += items.length
    porCortar += items.filter((i) => (i.SUBESTADO_CORTE || 'PENDIENTE') !== 'CORTADO').length

    pedidos.push({
      PEDIDO_ID: p.pedido_id,
      TIENDA_ID: p.tienda_id ?? '',
      FECHA_PEDIDO: p.fecha_pedido ?? '',
      FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
      ESTADO_PEDIDO: 'EN_FABRICA',
      CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
      CLIENTE_CEDULA: p.clientes?.cedula ?? '',
      CLIENTE_CELULAR: p.clientes?.celular ?? '',
      PRENDAS_LLEGARON: llegaron,
      PRENDAS_TOTAL: hayConteo ? totalPrendas : null,
      COMPLETO: completoPedido,
      items,
    })
  }

  return {
    pedidos,
    meta: { pedidos: pedidos.length, prendas, porCortar, completo, pedidosIncompletos: incompletos },
  }
}
