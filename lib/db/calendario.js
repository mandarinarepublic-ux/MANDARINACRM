// lib/db/calendario.js
//
// El Calendario de entregas: los pedidos ordenados por FECHA_ENTREGA_PROMETIDA.
//
// POR QUÉ EXISTE: pedía `/api/pedidos?rol=ADMIN` — los 683 pedidos con sus cinco
// tablas unidas (~970 kB) — para pintar UN mes. Al pasar de 1000 filas PostgREST
// habría empezado a cortar en silencio y el calendario habría perdido entregas.
//
// ⚠️ SOBRE LAS FECHAS. `fecha_entrega_prometida` es timestamptz pero guarda una
// FECHA, no un instante: el formulario manda "2026-08-23" y Postgres lo escribe
// como 2026-08-23 00:00 **UTC**. Medido el 20-ago-2026: los 681 pedidos con
// fecha están a las 00:00 UTC.
//
// Por eso el rango se compara **en UTC** y NO se convierte a hora de Ecuador:
// convertir restaría 5 horas y correría cada entrega al día ANTERIOR. Es el caso
// contrario al de `fecha_pedido`, que sí es un instante real.
// La pantalla hace lo mismo con `parseFechaCalendario`.
//
// ☠️ EL SELECT SE ARMA CON join(','), NUNCA CONCATENANDO PLANTILLAS: el build se
// come el separador. Ver tests/select-no-se-rompe-en-el-build.test.js.

import { getSupabase } from '../supabase'

/** Estados que ya no esperan entrega. */
const CERRADOS = ['COMPLETADO', 'ENTREGADO', 'CANCELADO']

// Solo lo que la grilla pinta. El PDF de confección de UN pedido se pide aparte
// con /api/pedidos/{id}: traer fotos y detalles de 250 pedidos para que alguien
// abra uno sería justo el problema que esta pantalla tenía.
const COLS_PEDIDO = [
  'pedido_id', 'unique_id', 'tienda_id', 'fecha_entrega_prometida',
  'estado_pedido', 'monto_total', 'monto_pendiente',
].join(',')

const COLS_PRENDA = ['item_id', 'pedido_id', 'cantidad', 'area', 'subestado'].join(',')

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
    FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
    ESTADO_PEDIDO: p.estado_pedido ?? '',
    MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
    MONTO_PENDIENTE: p.monto_pendiente != null ? String(p.monto_pendiente) : '',
    CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
    CLIENTE_CEDULA: p.clientes?.cedula ?? '',
    CLIENTE_CELULAR: p.clientes?.celular ?? '',
    items: (p.prendas || [])
      .filter((d) => d.subestado !== 'ELIMINADO')
      .map((d) => ({
        ITEM_ID: d.item_id,
        CANTIDAD: d.cantidad != null ? String(d.cantidad) : '1',
        AREA: d.area ?? '',
        SUBESTADO: d.subestado ?? '',
      })),
  }
}

/**
 * Los pedidos que se entregan en un mes, MÁS los atrasados que siguen abiertos.
 *
 * Los atrasados vienen aunque su fecha caiga en un mes anterior: si no, el rojo
 * de "esto ya venció" desaparecería al cambiar de mes, que es justo cuando hay
 * que verlo.
 *
 * @param {{mes?: string, tiendas?: string[]}} opts  mes = 'YYYY-MM'
 * @returns {Promise<{pedidos:object[], completo:boolean, mes:string}>}
 */
export async function listCalendario({ mes, tiendas } = {}) {
  const sb = getSupabase()
  const porTienda = Array.isArray(tiendas) && tiendas.length ? tiendas : null

  // Mes válido o el actual. El formato lo fija la pantalla, pero un valor raro
  // no puede tumbar la consulta.
  const m = /^\d{4}-\d{2}$/.test(String(mes || '')) ? String(mes) : new Date().toISOString().slice(0, 7)
  const [anio, num] = m.split('-').map(Number)
  const inicio = `${m}-01T00:00:00Z`
  const finMes = num === 12 ? `${anio + 1}-01-01T00:00:00Z` : `${anio}-${String(num + 1).padStart(2, '0')}-01T00:00:00Z`

  let delMes = sb.from('pedidos').select(SELECT, { count: 'exact' })
    .gte('fecha_entrega_prometida', inicio)
    .lt('fecha_entrega_prometida', finMes)
  if (porTienda) delMes = delMes.in('tienda_id', porTienda)

  let atrasados = sb.from('pedidos').select(SELECT)
    .lt('fecha_entrega_prometida', inicio)
    .not('estado_pedido', 'in', `(${CERRADOS.join(',')})`)
  if (porTienda) atrasados = atrasados.in('tienda_id', porTienda)

  const [resMes, resAtras] = await Promise.all([delMes, atrasados])
  if (resMes.error) throw resMes.error
  if (resAtras.error) throw resAtras.error

  const filas = resMes.data || []
  // Solo evidencia POSITIVA marca la lista incompleta.
  const completo = typeof resMes.count !== 'number' || filas.length >= resMes.count

  // Un pedido no puede salir dos veces si algún día los rangos se solapan.
  const vistos = new Set(filas.map((p) => p.pedido_id))
  for (const p of resAtras.data || []) {
    if (!vistos.has(p.pedido_id)) { vistos.add(p.pedido_id); filas.push(p) }
  }

  return { pedidos: filas.map(aPedido), completo, mes: m }
}
