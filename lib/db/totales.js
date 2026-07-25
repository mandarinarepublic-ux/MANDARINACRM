// lib/db/totales.js — Deja cuadrada la fila de PEDIDOS con sus prendas y pagos.
//
// Vive en su propio módulo porque necesita DETALLE + PAGOS + PEDIDOS a la vez, y
// meterlo en cualquiera de los tres crearía un ciclo de imports. La aritmética
// pura (y sus pruebas) está en lib/totalesPedido.js.
//
// POR QUÉ EXISTE: el editor del ADMIN cambiaba precio/cantidad de una prenda, o
// borraba/agregaba prendas, y solo se reescribía la fila del ÍTEM. La fila del
// PEDIDO conservaba el MONTO_TOTAL viejo, así que el historial, el tablero, las
// ventas del mes, el saldo por cobrar y los PDF seguían mostrando el importe
// anterior. La pantalla del editor sí sumaba bien (calcula en vivo desde los
// ítems), lo que hacía el descuadre difícil de notar: se veía bien mientras
// editabas y mal en todo lo demás.
//
// El recálculo va en el SERVIDOR, después de cada escritura de ítems, para que no
// dependa de que la pantalla se acuerde de mandar los totales.

import { listItemsByPedido } from './detalle';
import { listPagosByPedido } from './pagos';
import { updatePedido, getPedidoById } from './pedidos';
import { calcularTotales, centavos } from '../totalesPedido';

/**
 * Recalcula y guarda MONTO_TOTAL, MONTO_ABONADO, MONTO_PENDIENTE y ESTADO_PAGO.
 *
 * Los ítems eliminados NO cuentan (listItemsByPedido ya los excluye), igual que en
 * la suma que muestra la pantalla del editor.
 *
 * @returns {Promise<null | {montoTotal:number, montoAbonado:number, montoPendiente:number, estadoPago:string}>}
 *   null si el pedido quedó sin prendas vivas: ahí NO se toca nada. En producción
 *   hay pedidos viejos con cero ítems pero con total y pagos reales, y ponerlos en
 *   0 borraría plata registrada.
 */
export async function recalcTotales(pedidoId) {
  const [items, pagos] = await Promise.all([
    listItemsByPedido(pedidoId),
    listPagosByPedido(pedidoId),
  ]);

  const totales = calcularTotales(items, pagos);
  if (!totales) return null;

  await updatePedido(pedidoId, totales);
  return totales;
}

/**
 * Igual que recalcTotales pero sin tumbar la operación si algo falla, y dejando
 * constancia en la bitácora cuando el total cambia.
 *
 * Se usa desde las rutas que editan ítems: si el recálculo fallara, el cambio del
 * ítem YA está guardado, así que es preferible responder OK (con el aviso en el
 * log del servidor) a devolver un error por algo que se puede recomponer después.
 *
 * @param {Function} [logCambio] logger (pedidoId, campo, antes, después, usuario)
 */
export async function recalcTotalesSeguro(pedidoId, { logCambio, usuarioId } = {}) {
  try {
    const antes = await getPedidoById(pedidoId).catch(() => null);
    const totalAntes = centavos(parseFloat(antes?.MONTO_TOTAL) || 0);

    const res = await recalcTotales(pedidoId);

    if (!res) {   // sin prendas vivas: se dejó intacto a propósito
      await logCambio?.(
        pedidoId, 'AVISO', '',
        'El pedido quedó sin prendas: el total NO se recalculó, revísalo a mano',
        usuarioId || 'SISTEMA',
      )?.catch?.(() => {});
      return null;
    }

    if (logCambio && totalAntes !== res.montoTotal) {
      await logCambio(
        pedidoId, 'MONTO_TOTAL',
        `$${totalAntes.toFixed(2)}`, `$${res.montoTotal.toFixed(2)}`,
        usuarioId || 'SISTEMA',
      ).catch(() => {});
    }
    return res;
  } catch (e) {
    console.error(`recalcTotales(${pedidoId}) falló:`, e?.message || e);
    return null;
  }
}
