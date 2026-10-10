// lib/db/seguimiento.js
// Repositorio del seguimiento PÚBLICO del pedido (mandarinaec.com/pedido).
// Solo Supabase: Sheets está apagado desde el 19-ago y esto es nuevo.
//
// Cada lectura trae SOLO las columnas que hacen falta. La lista blanca de lo que
// le llega al cliente está en lib/seguimientoPublico.js (armarRespuesta); aquí
// se evita además que viajen montos o la dirección más allá del servidor.

import { getSupabase } from '../supabase'
import { LIMITE, TIENDA_PUBLICA } from '../seguimientoPublico'

const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'cliente_id', 'fecha_pedido', 'fecha_actualizacion',
  'estado_pedido', 'estado_pago', 'monto_total', 'monto_abonado',
  'fecha_impresion_produccion', 'guia_numero', 'guia_transportista',
].join(',')

const COLS_ITEM = [
  'producto_nombre', 'color', 'talla', 'cantidad', 'area', 'subestado', 'subestado_corte',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url', 'eliminado',
].join(',')

const COLS_CLIENTE = ['nombre', 'cedula', 'celular', 'ciudad'].join(',')
const COLS_LOG = ['fecha', 'campo', 'valor_despues'].join(',')
const COLS_GUIA = ['numero_guia', 'transportista', 'fecha_despacho', 'foto_guia_url'].join(',')

/** Candidatos por número. `like '%-6308'` no atrapa MAN-JAC-16308 (exige el guion). */
export async function buscarPedidosPorNumero(n) {
  if (!n) return []
  // Solo la tienda pública: que otras tiendas no copen el límite de 5 filas.
  let q = getSupabase().from('pedidos').select(COLS_PEDIDO).eq('tienda_id', TIENDA_PUBLICA)
  q = n.id ? q.eq('pedido_id', n.id) : q.like('pedido_id', `%-${n.numero}`)
  const { data, error } = await q.limit(5)
  if (error) throw error
  return data || []
}

export async function cargarDetallePublico(pedido) {
  const sb = getSupabase()
  const id = pedido.pedido_id
  const [it, lg, cl, gu] = await Promise.all([
    sb.from('detalle_pedido').select(COLS_ITEM).eq('pedido_id', id).eq('eliminado', false),
    sb.from('logs_pedidos').select(COLS_LOG).eq('pedido_id', id).order('fecha', { ascending: true }),
    pedido.cliente_id
      ? sb.from('clientes').select(COLS_CLIENTE).eq('cliente_id', pedido.cliente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from('guias_despacho').select(COLS_GUIA).eq('pedido_id', id)
      .order('fecha_despacho', { ascending: false }).limit(1),
  ])
  for (const r of [it, lg, cl, gu]) if (r.error) throw r.error

  const g = gu.data?.[0]
  const guia = g?.numero_guia
    ? { numero: g.numero_guia, transportista: g.transportista, fecha: g.fecha_despacho, foto: g.foto_guia_url }
    : pedido.guia_numero ? { numero: pedido.guia_numero, transportista: pedido.guia_transportista, fecha: null, foto: null } : null

  return {
    items: it.data || [],
    logs: (lg.data || []).map((l) => ({ fecha: l.fecha, campo: l.campo, despues: l.valor_despues })),
    cliente: cl.data || null,
    guia,
  }
}

/** Solo el celular: así revisas el candidato sin cargar el detalle entero. */
export async function celularDelCliente(clienteId) {
  if (!clienteId) return null
  const { data, error } = await getSupabase().from('clientes')
    .select('celular').eq('cliente_id', clienteId).maybeSingle()
  if (error) throw error
  return data?.celular ?? null
}

/**
 * Reserva la consulta ANTES de contar: así las peticiones simultáneas se ven
 * entre sí. THROW si no se puede anotar: la ruta responde 500 (falla cerrado).
 */
export async function abrirConsulta({ ip, numero }) {
  const { data, error } = await getSupabase().from('consultas_publicas')
    .insert({ ip, numero: numero || null, resultado: 'pendiente' })
    .select('id').single()
  if (error) throw error
  return data.id
}

/** Cuenta solo lo anterior a la reserva (id < antesDe). Un 'pendiente' cuenta como intento. */
export async function contarIntentos({ ip, numero, antesDe }) {
  const desde = new Date(Date.now() - LIMITE.ventanaMin * 60 * 1000).toISOString()
  const sb = getSupabase()
  const [a, b] = await Promise.all([
    sb.from('consultas_publicas').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('fecha', desde).lt('id', antesDe),
    sb.from('consultas_publicas').select('id', { count: 'exact', head: true })
      .eq('numero', numero).in('resultado', ['fallo', 'pendiente']).gte('fecha', desde).lt('id', antesDe),
  ])
  if (a.error) throw a.error
  if (b.error) throw b.error
  return { intentosIp: a.count || 0, fallosNumero: b.count || 0 }
}

/** NO-THROW: que no se pueda cerrar no le quita la respuesta al cliente. */
export async function cerrarConsulta(id, resultado, pedidoId) {
  try {
    const { error } = await getSupabase().from('consultas_publicas')
      .update({ resultado, pedido_id: pedidoId || null }).eq('id', id)
    if (error) throw error
  } catch (e) {
    console.error('consultas_publicas error:', e?.message || e)
  }
}

const PROMO_CLAVE = 'promo_mandarina'

export async function leerPromo() {
  const { data, error } = await getSupabase().from('config_publica')
    .select('valor').eq('clave', PROMO_CLAVE).maybeSingle()
  if (error) throw error
  return data?.valor || null
}

/** Se mandan TODAS las columnas: un upsert parcial pone en NULL lo que no viaja. */
export async function guardarPromo(promo, usuario) {
  const { error } = await getSupabase().from('config_publica').upsert({
    clave: PROMO_CLAVE,
    valor: promo,
    actualizado_en: new Date().toISOString(),
    actualizado_por: usuario || 'SISTEMA',
  }, { onConflict: 'clave' })
  if (error) throw error
}
