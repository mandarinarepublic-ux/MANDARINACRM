// lib/procesarPagoTienda.js — Lo que pasa cuando Payphone devuelve al cliente a
// /pagar/respuesta después de la Cajita.
//
//   1. Confirmar en Payphone (≤ 5 min o lo revierte solo).
//   2. Comprobar que lo cobrado es EXACTAMENTE el total guardado de esa compra.
//   3. Tomar la compra con candado (CREANDO) y crear el pedido PAGADO en Shopify.
//
// ☠️ Si el pago se aprobó y el pedido NO se pudo crear, hay plata cobrada sin
//    pedido: queda en ERROR con todo el detalle y sale una ALERTA (registrarEvento
//    nivel 'error' → Telegram). Nunca se revierte solo: lo decide una persona.
import { confirmarCajita } from './payphone'
import { idDeCtx } from './checkoutTienda'
import { leerCheckout, actualizarCheckout, tomarParaCrear } from './db/checkouts'
import { crearPedidoPagado } from './shopifyCheckout'
import { registrarEvento } from './eventos'

/**
 * Devuelve { estado: 'PAGADO'|'RECHAZADO'|'ERROR'|'INVALIDO', pedido?, mensaje }.
 * Idempotente: una recarga de la página no crea un segundo pedido.
 */
export async function procesarRespuestaPago({ id, clientTransactionId }) {
  const checkoutId = idDeCtx(clientTransactionId)
  if (!checkoutId || !id) return { estado: 'INVALIDO', mensaje: 'Faltan datos del pago' }

  const c = await leerCheckout(checkoutId)
  if (!c) return { estado: 'INVALIDO', mensaje: 'No encontramos esta compra' }
  if (c.estado === 'PAGADO') return { estado: 'PAGADO', pedido: c.shopify_order_name, mensaje: 'Pago recibido' }
  if (c.estado === 'CREANDO') return { estado: 'PAGADO', pedido: null, mensaje: 'Pago recibido, estamos registrando tu pedido' }

  let pago
  try {
    pago = await confirmarCajita({ id, clientTxId: clientTransactionId })
  } catch (e) {
    await registrarEvento({
      fuente: 'otro', nivel: 'error',
      mensaje: `Pago en tienda: no se pudo confirmar en Payphone (${checkoutId}): ${e.message}`,
      detalle: { checkoutId, payphoneId: id, clientTransactionId },
    })
    await actualizarCheckout(checkoutId, { error: `confirm: ${e.message}` }).catch(() => {})
    return { estado: 'ERROR', mensaje: 'No pudimos confirmar el pago. Si se te cobró, escríbenos por WhatsApp.' }
  }

  if (!pago.aprobada) {
    await actualizarCheckout(checkoutId, {
      estado: 'COTIZADO', payphone_detalle: pago, error: `rechazado: ${pago.mensaje || pago.transactionStatus}`,
    }).catch(() => {})
    return { estado: 'RECHAZADO', mensaje: pago.mensaje || 'El pago no fue aprobado' }
  }

  // Lo cobrado tiene que ser lo guardado. Si no cuadra, NO se crea el pedido.
  if (pago.amount !== c.total_centavos) {
    await actualizarCheckout(checkoutId, {
      estado: 'ERROR', payphone_tx_id: pago.transactionId, payphone_detalle: pago,
      error: `monto distinto: cobrado ${pago.amount} vs esperado ${c.total_centavos}`,
    }).catch(() => {})
    await registrarEvento({
      fuente: 'otro', nivel: 'error',
      mensaje: `Pago en tienda COBRADO con monto distinto (${checkoutId}): $${(pago.amount / 100).toFixed(2)} vs $${((c.total_centavos || 0) / 100).toFixed(2)}. Payphone #${pago.transactionId}. Revisar a mano.`,
      detalle: { checkoutId, pago },
    })
    return { estado: 'ERROR', mensaje: 'Recibimos tu pago pero hay una diferencia en el monto. Te contactaremos por WhatsApp.' }
  }

  const tomado = await tomarParaCrear(checkoutId)
  if (!tomado) {
    // Otra pestaña/recarga ya lo está creando o lo creó.
    const ya = await leerCheckout(checkoutId)
    return { estado: 'PAGADO', pedido: ya?.shopify_order_name || null, mensaje: 'Pago recibido' }
  }

  try {
    const pedido = await crearPedidoPagado({
      tienda: tomado.tienda, checkout: tomado, cobradoCentavos: pago.amount, payphone: pago,
    })
    await actualizarCheckout(checkoutId, {
      estado: 'PAGADO', payphone_tx_id: pago.transactionId, payphone_detalle: pago,
      shopify_order_id: pedido.orderId, shopify_order_name: pedido.orderName, error: null,
    })
    await registrarEvento({
      fuente: 'otro', nivel: 'ok',
      mensaje: `Pago en tienda: pedido ${pedido.orderName} pagado con tarjeta ($${(pago.amount / 100).toFixed(2)}, Payphone #${pago.transactionId})`,
      detalle: { checkoutId, orderId: pedido.orderId },
    })
    return { estado: 'PAGADO', pedido: pedido.orderName, mensaje: 'Pago recibido' }
  } catch (e) {
    await actualizarCheckout(checkoutId, {
      estado: 'ERROR', payphone_tx_id: pago.transactionId, payphone_detalle: pago, error: `pedido: ${e.message}`,
    }).catch(() => {})
    await registrarEvento({
      fuente: 'otro', nivel: 'error',
      mensaje: `☠️ Pago en tienda COBRADO SIN PEDIDO (${checkoutId}): $${(pago.amount / 100).toFixed(2)}, Payphone #${pago.transactionId}. ${e.message}`,
      detalle: { checkoutId, pago, cliente: tomado.cliente },
    })
    return { estado: 'ERROR', mensaje: 'Recibimos tu pago. Estamos registrando tu pedido y te escribiremos por WhatsApp.' }
  }
}
