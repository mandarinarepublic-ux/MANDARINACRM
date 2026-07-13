// lib/db/pagos.js
// Repositorio de PAGOS. Expone las operaciones de pagos detrás del switch
// DATA_BACKEND (Sheets vs Supabase), respetando el patrón dual-write.
//
// Particularidad de esquema:
//  - La hoja PAGOS mantiene 3 columnas placeholder VACÍAS en las posiciones 7-9
//    (histórico). En Postgres NO existen: el insert de Supabase las omite, pero
//    el append de Sheets conserva el orden con las 3 vacías.
//  - vendedor_id en Postgres es FK uuid → si llega un nombre (o algo que no es
//    uuid válido) se guarda null; en la hoja se escribe tal cual (texto libre).

import { v4 as uuid } from 'uuid';
import { readSheet, appendRow, findRow, updateCell, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write, toNum } from './_backend';

// Columnas de la hoja PEDIDOS que recalcula recalcPago (updateCell por letra):
// L ESTADO_PAGO · N MONTO_ABONADO · O MONTO_PENDIENTE
const COL_PEDIDO = { estadoPago: 'L', montoAbonado: 'N', montoPendiente: 'O' };

/**
 * Normaliza una fila de pago (venga de Sheets o de Supabase) al shape que ya
 * consume la UI (claves de la hoja PAGOS: TIPO_PAGO, FECHA_PAGO, ESTADO_PAGO,
 * FOTO_COMPROBANTE_URL, ...).
 */
function toPagoPublico(p) {
  return {
    PAGO_ID: p.PAGO_ID ?? p.pago_id,
    PEDIDO_ID: p.PEDIDO_ID ?? p.pedido_id,
    TIPO_PAGO: p.TIPO_PAGO ?? p.tipo,
    MONTO: p.MONTO ?? (p.monto != null ? String(p.monto) : ''),
    FECHA_PAGO: p.FECHA_PAGO ?? p.fecha,
    ESTADO_PAGO: p.ESTADO_PAGO ?? p.estado,
    FOTO_COMPROBANTE_URL: p.FOTO_COMPROBANTE_URL ?? p.foto_comprobante_url,
    // Header real de la hoja = REGISTRADO_POR (col 10). Se emite también como
    // VENDEDOR_ID (alias) por compatibilidad con consumidores que usen esa clave.
    REGISTRADO_POR: p.REGISTRADO_POR ?? p.vendedor_id,
    VENDEDOR_ID: p.REGISTRADO_POR ?? p.VENDEDOR_ID ?? p.vendedor_id,
    NOTAS: p.NOTAS ?? p.notas,
  };
}

/** Calcula el estado_pago a partir de los montos (misma regla que la ruta legada). */
function calcEstadoPago(totalAbonado, montoTotal) {
  if (totalAbonado >= montoTotal) return 'PAGADO';
  if (totalAbonado > 0) return 'ABONO';
  return 'PENDIENTE';
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/** Todos los pagos de un pedido, normalizados al shape de la UI. */
export async function listPagosByPedido(pedidoId) {
  return read({
    sheets: async () => {
      const pagos = await readSheet('PAGOS');
      return pagos.filter((pg) => pg.PEDIDO_ID === pedidoId).map(toPagoPublico);
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('pagos')
        .select('*')
        .eq('pedido_id', pedidoId);
      if (error) throw error;
      return data.map(toPagoPublico);
    },
  });
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/**
 * Crea un pago para un pedido.
 * @param {string} pedidoId  id de negocio del pedido (text, p.ej. 'MAN-AND-2432').
 * @param {Object} datos     { tipo, monto, comprobanteUrl, vendedorId, notas, estado? }
 *   - estado (opcional): por defecto 'PAGADO', o 'PENDIENTE' si tipo === 'LINK_PAGO'.
 * @returns {Promise<string>} el pago_id generado.
 *
 * NOTA: NO recalcula el pedido; llama a recalcPago(pedidoId) por separado.
 */
export async function createPago(pedidoId, { tipo, monto, comprobanteUrl, vendedorId, notas, estado } = {}) {
  const pagoId = uuid();
  const montoNum = toNum(monto) ?? 0;
  const tipoPago = tipo || 'EFECTIVO';
  // Estado por defecto: LINK_PAGO nace PENDIENTE (aún no cobrado); el resto PAGADO.
  const estadoFinal = estado || (tipoPago === 'LINK_PAGO' ? 'PENDIENTE' : 'PAGADO');
  const nowSheet = fechaAhora();               // string Ecuador para la hoja
  const nowIso = new Date().toISOString();     // timestamptz para Postgres
  const comprobante = comprobanteUrl || '';

  await write({
    sheets: async () =>
      appendRow('PAGOS', [
        pagoId,
        pedidoId,
        tipoPago,
        montoNum.toFixed(2),
        nowSheet,
        estadoFinal,
        '', '', '',                            // 3 columnas placeholder (7-9)
        comprobante,
        vendedorId || '',                      // texto libre (nombre o uuid)
        notas || '',
      ]),
    supabase: async () => {
      const { error } = await getSupabase().from('pagos').insert({
        pago_id: pagoId,
        pedido_id: pedidoId,
        tipo: tipoPago,
        monto: montoNum,
        fecha: nowIso,
        estado: estadoFinal,
        foto_comprobante_url: comprobante || null,
        vendedor_id: vendedorId || null, // text: nombre o uuid, tal cual (como en Sheets)
        notas: notas || null,
      });
      if (error) throw error;
    },
  });

  return pagoId;
}

/**
 * Recalcula los totales del pedido sumando sus pagos y actualiza PEDIDOS.
 * @returns {Promise<{ totalAbonado:number, montoPendiente:number, estadoPago:string }>}
 *
 * estado_pago: 'PAGADO' si abonado>=total, 'ABONO' si >0, si no 'PENDIENTE'.
 */
export async function recalcPago(pedidoId) {
  return write({
    sheets: async () => {
      // Localiza el pedido (row para MONTO_TOTAL + index para updateCell).
      const { row: pedido, index } = await findRow('PEDIDOS', 'PEDIDO_ID', pedidoId);
      if (!pedido || index < 0) throw new Error('Pedido no encontrado');

      const montoTotal = toNum(pedido.MONTO_TOTAL) ?? 0;
      const pagos = await readSheet('PAGOS');
      const totalAbonado = pagos
        .filter((pg) => pg.PEDIDO_ID === pedidoId)
        .reduce((sum, pg) => sum + (toNum(pg.MONTO) ?? 0), 0);
      const montoPendiente = Math.max(0, montoTotal - totalAbonado);
      const estadoPago = calcEstadoPago(totalAbonado, montoTotal);

      await updateCell('PEDIDOS', index, COL_PEDIDO.estadoPago, estadoPago);
      await updateCell('PEDIDOS', index, COL_PEDIDO.montoAbonado, totalAbonado.toFixed(2));
      await updateCell('PEDIDOS', index, COL_PEDIDO.montoPendiente, montoPendiente.toFixed(2));

      return { totalAbonado, montoPendiente, estadoPago };
    },
    supabase: async () => {
      const db = getSupabase();

      // Monto total del pedido.
      const { data: pedido, error: ePedido } = await db
        .from('pedidos')
        .select('monto_total')
        .eq('pedido_id', pedidoId)
        .single();
      if (ePedido) throw ePedido;
      const montoTotal = toNum(pedido?.monto_total) ?? 0;

      // Suma de los pagos del pedido.
      const { data: pagos, error: ePagos } = await db
        .from('pagos')
        .select('monto')
        .eq('pedido_id', pedidoId);
      if (ePagos) throw ePagos;
      const totalAbonado = (pagos || []).reduce((sum, pg) => sum + (toNum(pg.monto) ?? 0), 0);
      const montoPendiente = Math.max(0, montoTotal - totalAbonado);
      const estadoPago = calcEstadoPago(totalAbonado, montoTotal);

      const { error: eUpd } = await db
        .from('pedidos')
        .update({
          monto_abonado: totalAbonado,
          monto_pendiente: montoPendiente,
          estado_pago: estadoPago,
        })
        .eq('pedido_id', pedidoId);
      if (eUpd) throw eUpd;

      return { totalAbonado, montoPendiente, estadoPago };
    },
  });
}
