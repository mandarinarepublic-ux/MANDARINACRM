// lib/db/tablero.js
//
// El Tablero de flujo: CORTE → PRODUCCIÓN → DESPACHO.
//
// POR QUÉ EXISTE: pedía `/api/pedidos?rol=ADMIN` — los 680 pedidos con sus cinco
// tablas unidas (~970 kB) — y después el navegador **descartaba 598** porque el
// interruptor "Ver despachados" arranca apagado. O sea: se traía el 88% de los
// datos para tirarlos.
//
// Ahora se piden solo los pedidos VIVOS: 82. Los cerrados se cuentan aparte y
// solo se traen si alguien enciende el interruptor.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'

/**
 * Un pedido está CERRADO cuando ya salió: no aporta nada a un tablero de flujo.
 *
 * ⚠️ `DESPACHO` NO está en la lista, igual que en la bandeja de Despacho. Ese
 * estado lo pone el sistema cuando producción marca la última prenda como LISTO,
 * y significa "la fábrica terminó", no "ya salió". Medido el 19-ago-2026: hay 10
 * pedidos así y NINGUNO tiene guía. Contarlos como cerrados los sacaría del
 * tablero por defecto — y son justo los que hay que despachar.
 */
export const ESTADOS_CERRADOS = ['COMPLETADO', 'ENTREGADO', 'CANCELADO']

/** Tope de tarjetas cerradas cuando se enciende "Ver despachados". */
export const TOPE_CERRADOS = 200

const COLS_PEDIDO = [
  'pedido_id', 'unique_id', 'tienda_id', 'fecha_pedido', 'fecha_entrega_prometida',
  'estado_pedido', 'monto_pendiente',
  // Cuándo llegó al taller: es el único hito intermedio que la base guarda en
  // columna propia, y con él salen dos de las tres columnas de tiempo.
  'fecha_impresion_produccion',
].join(',')

const COLS_PRENDA = [
  'item_id', 'pedido_id', 'producto_nombre', 'cantidad', 'area', 'subestado', 'subestado_corte',
].join(',')

const SELECT = [
  COLS_PEDIDO,
  `prendas:detalle_pedido(${COLS_PRENDA})`,
  'clientes(nombre,cedula,celular)',
].join(',')

function aPedido(p) {
  return {
    PEDIDO_ID: p.pedido_id,
    UNIQUE_ID: p.unique_id,
    TIENDA_ID: p.tienda_id ?? '',
    FECHA_PEDIDO: p.fecha_pedido ?? '',
    FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
    ESTADO_PEDIDO: p.estado_pedido ?? '',
    MONTO_PENDIENTE: p.monto_pendiente != null ? String(p.monto_pendiente) : '',
    FECHA_IMPRESION_PRODUCCION: p.fecha_impresion_produccion ?? '',
    CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
    CLIENTE_CEDULA: p.clientes?.cedula ?? '',
    CLIENTE_CELULAR: p.clientes?.celular ?? '',
    items: (p.prendas || [])
      // El soft-delete se respeta acá y no en la pantalla: una prenda borrada no
      // es trabajo de nadie.
      .filter((d) => d.subestado !== 'ELIMINADO')
      .map((d) => ({
        ITEM_ID: d.item_id,
        PRODUCTO_NOMBRE: d.producto_nombre ?? '',
        CANTIDAD: d.cantidad != null ? String(d.cantidad) : '1',
        AREA: d.area ?? '',
        SUBESTADO: d.subestado ?? '',
        SUBESTADO_CORTE: d.subestado_corte ?? '',
      })),
  }
}

/**
 * Los pedidos del tablero.
 *
 * @param {{tiendas?: string[], incluirCerrados?: boolean}} opts
 *   tiendas — acceso por tienda del usuario (vacío = sin restricción).
 * @returns {Promise<{pedidos:object[], cerrados:number, completo:boolean, cerradosRecortados:boolean}>}
 */
export async function listTablero({ tiendas, incluirCerrados = false } = {}) {
  const sb = getSupabase()
  const porTienda = Array.isArray(tiendas) && tiendas.length ? tiendas : null

  let vivos = sb.from('pedidos').select(SELECT, { count: 'exact' })
    .not('estado_pedido', 'in', `(${ESTADOS_CERRADOS.join(',')})`)
  if (porTienda) vivos = vivos.in('tienda_id', porTienda)

  let cuenta = sb.from('pedidos').select('pedido_id', { count: 'exact', head: true })
    .in('estado_pedido', ESTADOS_CERRADOS)
  if (porTienda) cuenta = cuenta.in('tienda_id', porTienda)

  const [resVivos, resCuenta] = await Promise.all([vivos, cuenta])
  if (resVivos.error) throw resVivos.error
  if (resCuenta.error) throw resCuenta.error

  const filas = resVivos.data || []
  const total = resVivos.count
  // Solo evidencia POSITIVA marca la lista incompleta: si el conteo no llega, el
  // peor caso es quedarse sin aviso, nunca gritar en falso.
  const completo = typeof total !== 'number' || filas.length >= total

  let cerradosRecortados = false
  if (incluirCerrados) {
    // Los cerrados NO se cuentan de a poco: son 598 y se traen los más recientes.
    // Un tablero de flujo con 598 tarjetas en la última columna no informa nada,
    // pero el interruptor existe y tiene que enseñar algo real.
    let q = sb.from('pedidos').select(SELECT)
      .in('estado_pedido', ESTADOS_CERRADOS)
      .order('unique_id', { ascending: false })
      .limit(TOPE_CERRADOS)
    if (porTienda) q = q.in('tienda_id', porTienda)
    const { data, error } = await q
    if (error) throw error
    const cerrados = data || []
    cerradosRecortados = cerrados.length >= TOPE_CERRADOS
    filas.push(...cerrados)
  }

  const pedidos = await conTiempos(sb, filas.map(aPedido))

  return {
    pedidos,
    cerrados: typeof resCuenta.count === 'number' ? resCuenta.count : 0,
    completo,
    cerradosRecortados,
  }
}

/** Etiquetas legibles del último evento; un campo desconocido se resume, no se calla. */
function tipoDeEvento(campo) {
  const c = String(campo ?? '')
  if (c.startsWith('SUBESTADO ')) return 'estado de prenda'
  if (c.startsWith('CORTE ')) return 'corte'
  if (c === 'IMPRESION_PRODUCCION') return 'impresión'
  if (c === 'ESTADO_PEDIDO') return 'estado de pedido'
  return c ? c.toLowerCase() : ''
}

const DIA = 86400000
const enDias = (desde, hasta) => {
  const a = new Date(desde).getTime(), b = new Date(hasta).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / DIA))
}

/**
 * Agrega las tres columnas de tiempo: venta→taller, en taller, y días quieto.
 *
 * ☠️ El "quieto" sale de la VISTA `crm.pedido_ultimo_movimiento`, que agrupa en la
 * base. Leer `logs_pedidos` en crudo para agrupar acá cruzaría el tope de 1000
 * filas de PostgREST EN SILENCIO y el dato saldría mal sin que nadie lo note.
 *
 * ⚠️ Y NO se usa `detalle_pedido.fecha_modificacion`, que parece la respuesta
 * obvia: medido el 4-sep-2026, en las 156 prendas vivas es idéntica a la fecha de
 * creación del pedido —incluidas 41 que sí se habían movido—. Nunca se actualiza.
 *
 * NO-THROW: si esto falla, el tablero sale sin las columnas de tiempo. Perder el
 * tablero entero por no poder calcular un "hace cuántos días" sería peor.
 */
async function conTiempos(sb, pedidos) {
  if (pedidos.length === 0) return pedidos
  const ahora = Date.now()
  try {
    const ids = pedidos.map((p) => p.PEDIDO_ID)
    const { data, error } = await sb
      .from('pedido_ultimo_movimiento')
      .select('pedido_id,ultimo_movimiento,ultimo_campo')
      .in('pedido_id', ids)
    if (error) throw error

    const porId = new Map((data || []).map((r) => [r.pedido_id, r]))
    for (const p of pedidos) {
      const mov = porId.get(p.PEDIDO_ID)
      const imp = p.FECHA_IMPRESION_PRODUCCION || null
      // Sin dato va null, NUNCA 0: un cero se lee como "salió el mismo día", que
      // es justo lo contrario de "no sabemos".
      p.DIAS_A_TALLER  = imp ? enDias(p.FECHA_PEDIDO, imp) : null
      p.DIAS_EN_TALLER = imp ? enDias(imp, ahora) : null
      p.DIAS_QUIETO    = mov?.ultimo_movimiento ? enDias(mov.ultimo_movimiento, ahora) : null
      p.ULTIMO_EVENTO  = tipoDeEvento(mov?.ultimo_campo)
    }
  } catch (e) {
    console.error('tablero: no se pudieron calcular los tiempos:', e?.message || e)
  }
  return pedidos
}
