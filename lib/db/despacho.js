// lib/db/despacho.js
//
// La bandeja de DESPACHO: solo lo que todavía no ha salido.
//
// POR QUÉ EXISTE: la pantalla comía de `/api/pedidos`, que trae las cinco tablas
// enteras — 661 pedidos y 969 kB para pintar 20. De esos, 590 eran pedidos ya
// cerrados que solo servían para la pestaña "Completados", que casi no se usa.
//
// Y sobre todo: mientras trajera los cerrados, Despacho quedaba expuesto al mismo
// tope de 1000 filas de PostgREST que dejó 21 pedidos invisibles en Producción
// durante 14 días. `crm.pedidos` va por 661 y cruza las 1000 en septiembre.
//
// Trayendo solo lo vivo (71 pedidos hoy) el problema desaparece por construcción,
// no por vigilancia: lo pendiente está acotado por el trabajo del taller, no por
// la historia. Los cerrados se consultan en Historial, que es la pantalla hecha
// para eso.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver lib/db/produccion.js y
// tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'
import { esCompleta } from '../bandeja-estado.js'

/** Un pedido está CERRADO cuando alguien lo dio por salido. */
export const ESTADOS_CERRADOS = ['COMPLETADO', 'ENTREGADO', 'CANCELADO']

// Solo lo que la pantalla pinta. Verificado campo por campo contra
// app/dashboard/despacho/page.js.
const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'fecha_pedido', 'estado_pedido',
  'monto_total', 'monto_pendiente',
].join(',')

const COLS_PRENDA = [
  'item_id', 'pedido_id', 'producto_nombre', 'talla', 'color', 'area', 'subestado',
  'foto_pecho_url',
].join(',')

const COLS_GUIA = [
  'guia_id', 'pedido_id', 'numero_guia', 'transportista', 'foto_guia_url', 'fecha_despacho',
].join(',')

const SELECT = [
  COLS_PEDIDO,
  `prendas:prendas_en_taller(${COLS_PRENDA})`,
  `guias:guias_despacho(${COLS_GUIA})`,
  'clientes(nombre,cedula,celular)',
].join(',')

function aPrenda(d) {
  return {
    ITEM_ID: d.item_id,
    PEDIDO_ID: d.pedido_id,
    PRODUCTO_NOMBRE: d.producto_nombre ?? '',
    TALLA: d.talla ?? '',
    COLOR: d.color ?? '',
    AREA: d.area ?? '',
    SUBESTADO: d.subestado ?? '',
    FOTO_PECHO_URL: d.foto_pecho_url ?? '',
  }
}

/**
 * Los pedidos que todavía no han salido, con sus prendas, su cliente y su guía.
 *
 * @returns {Promise<{pedidos:object[], meta:{pedidos:number, completo:boolean, cerrados:number}}>}
 */
export async function listBandejaDespacho() {
  const sb = getSupabase()

  const { data, error, count } = await sb
    .from('pedidos')
    .select(SELECT, { count: 'exact' })
    .not('estado_pedido', 'in', `(${ESTADOS_CERRADOS.join(',')})`)
  if (error) throw error

  const filas = data || []
  const completo = esCompleta({ recibidas: filas.length, total: count })

  // Cuántos hay cerrados. Es un NÚMERO, no 590 filas: la pantalla lo muestra en el
  // enlace a Historial sin pagar el peso de traerlos.
  let cerrados = null
  try {
    const { count: c } = await sb
      .from('pedidos')
      .select('pedido_id', { count: 'exact', head: true })
      .in('estado_pedido', ESTADOS_CERRADOS)
    cerrados = c ?? null
  } catch (e) {
    // Es un dato de adorno: si falla, la pantalla enseña el enlace sin número.
    console.error('listBandejaDespacho: no se pudo contar los cerrados:', e?.message || e)
  }

  const pedidos = filas.map((p) => {
    // La guía vigente es la más reciente por fecha de despacho (un pedido puede
    // tener varias si se corrigió).
    const guia = (p.guias || [])
      .slice()
      .sort((a, b) => String(b.fecha_despacho || '').localeCompare(String(a.fecha_despacho || '')))[0] || null

    return {
      PEDIDO_ID: p.pedido_id,
      TIENDA_ID: p.tienda_id ?? '',
      FECHA_PEDIDO: p.fecha_pedido ?? '',
      ESTADO_PEDIDO: p.estado_pedido ?? '',
      MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
      MONTO_PENDIENTE: p.monto_pendiente != null ? String(p.monto_pendiente) : '',
      CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
      CLIENTE_CEDULA: p.clientes?.cedula ?? '',
      CLIENTE_CELULAR: p.clientes?.celular ?? '',
      GUIA_NUMERO: guia?.numero_guia ?? '',
      GUIA_TRANSPORTISTA: guia?.transportista ?? '',
      GUIA_FOTO_URL: guia?.foto_guia_url ?? '',
      GUIA_FECHA: guia?.fecha_despacho ?? '',
      items: (p.prendas || []).map(aPrenda),
    }
  })

  return { pedidos, meta: { pedidos: pedidos.length, completo, cerrados } }
}
