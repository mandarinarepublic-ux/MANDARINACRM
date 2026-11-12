// lib/shopifyCheckout.js — Shopify para el pago con tarjeta dentro de la tienda.
//   calcularCompra()     → draftOrderCalculate (precios, descuentos, envío REALES de Shopify)
//   crearPedidoPagado()  → draftOrderCreate + draftOrderComplete (pedido marcado PAGADO)
//
// El pedido pagado dispara orders/paid y entra solo al CRM por /api/shopify/pedidos,
// como cualquier pedido web pagado. No se crea nada en crm.pedidos desde acá.
//
// ⚠️ La app de Shopify del CRM necesita el permiso `write_draft_orders`. Sin él,
// Shopify responde "Access denied" y la pantalla lo muestra tal cual.
import { shopifyGraphQLPorTienda } from './shopify'
import { inputBorrador, resumenCalculo } from './checkoutTienda'
import { cuentaPorId } from './cuentasBancarias'
import { ETIQUETA_TRANSFERENCIA } from './transferenciaTienda'

const VERSION = '2025-07'

const CALCULAR = `
mutation Calcular($input: DraftOrderInput!) {
  draftOrderCalculate(input: $input) {
    calculatedDraftOrder {
      lineItems {
        title variantTitle quantity
        image { url(transform: { maxWidth: 160 }) }
        originalTotalSet { shopMoney { amount } }
        discountedTotalSet { shopMoney { amount } }
      }
      availableShippingRates { handle title price { amount } }
      shippingLine { title }
      discountCodes
      subtotalPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalPriceSet { shopMoney { amount } }
      warnings { message }
    }
    userErrors { field message }
  }
}`

function errores(userErrors) {
  const msgs = (userErrors || []).map((e) => e?.message).filter(Boolean)
  return msgs.length ? msgs.join(' · ') : ''
}

/**
 * Calcula la compra en dos pasos: primero sin envío (para ver las tarifas que
 * aplican a esa dirección), y luego con la tarifa elegida para que el total
 * incluya el envío y cualquier descuento sobre él.
 */
export async function calcularCompra({ tienda = 'MANDARINA', lineas, cliente, direccion, descuento, checkoutId, handleEnvio = null }) {
  const base = { lineas, cliente, direccion, descuento, checkoutId }

  const d1 = await shopifyGraphQLPorTienda(tienda, CALCULAR, { input: inputBorrador(base) }, { version: VERSION })
  const e1 = errores(d1?.draftOrderCalculate?.userErrors)
  if (e1) throw new Error(e1)
  const paso1 = resumenCalculo(d1?.draftOrderCalculate?.calculatedDraftOrder, handleEnvio)
  if (!paso1.envio) return paso1 // sin envío a esa dirección: la pantalla lo avisa

  const d2 = await shopifyGraphQLPorTienda(
    tienda, CALCULAR,
    { input: inputBorrador({ ...base, envio: { handle: paso1.envio.handle, title: paso1.envio.title } }) },
    { version: VERSION },
  )
  const e2 = errores(d2?.draftOrderCalculate?.userErrors)
  if (e2) throw new Error(e2)
  const paso2 = resumenCalculo(d2?.draftOrderCalculate?.calculatedDraftOrder, paso1.envio.handle)
  // Las tarifas y la elegida se conservan del paso 1 (el 2 ya trae el envío puesto).
  return { ...paso2, tarifas: paso1.tarifas, envio: paso1.envio }
}

const CREAR = `
mutation Crear($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id totalPriceSet { shopMoney { amount } } }
    userErrors { field message }
  }
}`

const COMPLETAR = `
mutation Completar($id: ID!) {
  draftOrderComplete(id: $id) {
    draftOrder { order { id name displayFinancialStatus } }
    userErrors { field message }
  }
}`

/**
 * Crea el pedido PAGADO. Antes de completarlo compara el total del borrador con
 * lo que cobró Payphone: si no cuadra, NO lo completa (queda el borrador para
 * revisarlo a mano) y lanza.
 */
export async function crearPedidoPagado({ tienda = 'MANDARINA', checkout, cobradoCentavos, payphone, transferencia = null }) {
  if (transferencia) return crearPedidoTransferencia({ tienda, checkout, cobradoCentavos, transferencia })
  const input = inputBorrador({
    lineas: checkout.lineas,
    cliente: checkout.cliente,
    direccion: checkout.direccion,
    descuento: checkout.descuento,
    checkoutId: checkout.id,
    envio: checkout.calculo?.envio ? { handle: checkout.calculo.envio.handle, title: checkout.calculo.envio.title } : null,
    extra: {
      note: [
        `Cédula/RUC: ${checkout.cliente?.cedula || '-'}`,
        `Pagado con tarjeta en la tienda (Payphone #${payphone?.transactionId || '-'}, autorización ${payphone?.authorizationCode || '-'})`,
      ].join('\n'),
    },
  })
  input.customAttributes = [
    ...(input.customAttributes || []),
    { key: 'Payphone', value: String(payphone?.transactionId || '') },
  ]

  const c = await shopifyGraphQLPorTienda(tienda, CREAR, { input }, { version: VERSION })
  const ec = errores(c?.draftOrderCreate?.userErrors)
  if (ec) throw new Error(`Shopify no creó el borrador: ${ec}`)
  const borrador = c?.draftOrderCreate?.draftOrder
  if (!borrador?.id) throw new Error('Shopify no devolvió el borrador')

  const totalBorrador = Math.round(Number(borrador.totalPriceSet?.shopMoney?.amount || 0) * 100)
  if (totalBorrador !== cobradoCentavos) {
    throw new Error(`El total cambió: Shopify $${(totalBorrador / 100).toFixed(2)} vs cobrado $${(cobradoCentavos / 100).toFixed(2)} (borrador ${borrador.id} sin completar)`)
  }

  const k = await shopifyGraphQLPorTienda(tienda, COMPLETAR, { id: borrador.id }, { version: VERSION })
  const ek = errores(k?.draftOrderComplete?.userErrors)
  if (ek) throw new Error(`Shopify no completó el pedido: ${ek} (borrador ${borrador.id})`)
  const order = k?.draftOrderComplete?.draftOrder?.order
  if (!order?.id) throw new Error(`Shopify no devolvió el pedido (borrador ${borrador.id})`)
  return { orderId: String(order.id).split('/').pop(), orderName: order.name, estadoPago: order.displayFinancialStatus }
}

/**
 * 🏦 Transferencia de la tienda (12-nov-2026): el pedido de Shopify se crea recién
 * cuando un ADMIN CONFIRMA la plata, ya PAGADO, con la etiqueta que hace que el
 * webhook NO lo vuelva a crear en el CRM (el pedido del CRM existe desde que el
 * cliente subió el comprobante). Mismo borrador y misma comprobación de total.
 */
async function crearPedidoTransferencia({ tienda, checkout, cobradoCentavos, transferencia }) {
  const cuenta = cuentaPorId(checkout.banco)
  const banco = cuenta?.banco || checkout.banco || '-'
  const input = inputBorrador({
    lineas: checkout.lineas,
    cliente: checkout.cliente,
    direccion: checkout.direccion,
    descuento: checkout.descuento,
    checkoutId: checkout.id,
    envio: checkout.calculo?.envio ? { handle: checkout.calculo.envio.handle, title: checkout.calculo.envio.title } : null,
    extra: {
      note: [
        `Cédula/RUC: ${checkout.cliente?.cedula || '-'}`,
        `Pagado por TRANSFERENCIA (${banco}) desde la tienda; confirmada por ${transferencia.confirmadoPor || 'ADMIN'}.`,
        `Pedido CRM: ${checkout.crm_pedido_id || '-'}`,
        `Comprobante: ${checkout.comprobante_url || '-'}`,
      ].join('\n'),
      tags: [ETIQUETA_TRANSFERENCIA, 'pago-en-tienda'],
    },
  })
  input.customAttributes = (input.customAttributes || [])
    .map((a) => (a.key === 'Pago' ? { key: 'Pago', value: `Transferencia · ${banco} (en la tienda)` } : a))
    .concat([{ key: 'Pedido CRM', value: String(checkout.crm_pedido_id || '') }])

  const c = await shopifyGraphQLPorTienda(tienda, CREAR, { input }, { version: VERSION })
  const ec = errores(c?.draftOrderCreate?.userErrors)
  if (ec) throw new Error(`Shopify no creó el borrador: ${ec}`)
  const borrador = c?.draftOrderCreate?.draftOrder
  if (!borrador?.id) throw new Error('Shopify no devolvió el borrador')

  const totalBorrador = Math.round(Number(borrador.totalPriceSet?.shopMoney?.amount || 0) * 100)
  if (totalBorrador !== cobradoCentavos) {
    throw new Error(`El total cambió: Shopify $${(totalBorrador / 100).toFixed(2)} vs transferido $${(cobradoCentavos / 100).toFixed(2)} (borrador ${borrador.id} sin completar)`)
  }

  const k = await shopifyGraphQLPorTienda(tienda, COMPLETAR, { id: borrador.id }, { version: VERSION })
  const ek = errores(k?.draftOrderComplete?.userErrors)
  if (ek) throw new Error(`Shopify no completó el pedido: ${ek} (borrador ${borrador.id})`)
  const order = k?.draftOrderComplete?.draftOrder?.order
  if (!order?.id) throw new Error(`Shopify no devolvió el pedido (borrador ${borrador.id})`)
  return { orderId: String(order.id).split('/').pop(), orderName: order.name, estadoPago: order.displayFinancialStatus }
}
