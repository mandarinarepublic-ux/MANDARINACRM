// lib/procesarTransferencia.js — Transferencia dentro de la tienda (12-nov-2026).
// Spec: docs/superpowers/specs/2026-11-12-transferencia-en-tienda-design.md
//
//   procesarComprobante   el cliente sube la foto → pedido del CRM RETENIDO
//                         (PENDIENTE_FABRICA + pago TRANSFERENCIA PENDIENTE) + chat
//                         en el inbox MANDI con la foto.
//   confirmarTransferencia  SOLO ADMIN → pago PAGADO, pedido a producción, pedido
//                         PAGADO en Shopify (etiqueta: el webhook no lo duplica),
//                         Purchase a Meta y Telegram de venta.
//   rechazarTransferencia   SOLO ADMIN → pago RECHAZADO, pedido CANCELADO.
//
// ☠️ La foto es lo único que no se puede perder: se guarda PRIMERO. Lo que falle
//    después queda en ERROR + evento nivel 'error', y el cliente igual ve
//    "recibimos tu comprobante" (alguien lo carga a mano con la foto a la vista).

import { leerCheckout, actualizarCheckout, tomarParaCrear, checkoutDePedido } from './db/checkouts'
import { getPagoRaw, reclamarPago, recalcPago } from './db/pagos'
import { getPedidoById, setEstado } from './db/pedidos'
import { logCambio } from './pedidos'
import { getSupabase } from './supabase'
import { uploadToCloudinary } from './cloudinary'
import { cuentaPorId } from './cuentasBancarias'
import {
  textoAvisoTransferencia, idAvisoTransferencia, idAvisoConfirmacion, payloadPedidoTransferencia,
} from './transferenciaTienda'
import { avisarPedidoEnInbox } from './inbox-supabase'
import { DIRECCION_INTERNO, TIPO_PEDIDO_WEB, CANAL_POR_DEFECTO, telefonoInbox } from './pedidoWebPendiente'
import { crearPedidoPagado } from './shopifyCheckout'
import { firmarSesion, secretoSesion, COOKIE_SESION } from './sesion'
import { enviarPurchase, capiConfigurado } from './metaCapi'
import { esCompraParaMeta } from './compraParaMeta'
import { notificarVenta } from './telegram'
import { registrarEvento } from './eventos'

const FOTO_VALIDA = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_FOTO_CHARS = 6_000_000 // ~4,4 MB de imagen; el navegador la comprime antes

const limpio = (v) => String(v || '').replace(/[^\x21-\x7E]/g, '')

/** Avisa en el chat del cliente. Nunca lanza (avisarPedidoEnInbox tampoco). */
function avisarChat(c, { waMessageId, texto, mediaUrl = null }) {
  const cli = c?.cliente || {}
  return avisarPedidoEnInbox({
    tiendaId: 'MANDARINA',
    telefono: telefonoInbox(cli.celular),
    nombre: [cli.nombre, cli.apellido].filter(Boolean).join(' ') || null,
    waMessageId,
    texto,
    mediaUrl,
    direccion: DIRECCION_INTERNO,
    tipo: TIPO_PEDIDO_WEB,
    canalPorDefecto: CANAL_POR_DEFECTO.MANDI,
  })
}

/** Crea el pedido en el CRM como la TIENDA WEB (mismo camino que el webhook de Shopify). */
async function crearPedidoCRM(c, fotoUrl, base) {
  const idTienda = limpio(process.env.SHOPIFY_VENDEDOR_USUARIO_ID)
  if (!idTienda) throw new Error('falta SHOPIFY_VENDEDOR_USUARIO_ID')
  const token = await firmarSesion({ id: idTienda }, secretoSesion(), 1)
  const res = await fetch(`${base}/api/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_SESION}=${token}` },
    body: JSON.stringify(payloadPedidoTransferencia(c, fotoUrl)),
  })
  if (!res.ok) throw new Error(`/api/pedidos ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`)
  const d = await res.json()
  // El pedido YA existe: su número no se pierde pase lo que pase después.
  const { error: eOrigen } = await getSupabase().from('pedidos').update({ origen: 'tienda_web' }).eq('pedido_id', d.pedidoId)
  if (eOrigen) console.error('[transferencia] origen', d.pedidoId, eOrigen.message)
  return { pedidoId: d.pedidoId, retenido: !!d.retenido }
}

/**
 * El cliente subió el comprobante.
 * Devuelve { ok, estado: 'COMPROBANTE'|'INVALIDO'|'ERROR', pedido?, mensaje }.
 * Idempotente: dos toques o una recarga no crean dos pedidos (candado CREANDO).
 */
export async function procesarComprobante({ checkoutId, banco, foto, base }) {
  const cuenta = cuentaPorId(banco)
  if (!cuenta) return { ok: false, estado: 'INVALIDO', mensaje: 'Elige un banco' }
  const f = String(foto || '')
  if (!FOTO_VALIDA.test(f)) return { ok: false, estado: 'INVALIDO', mensaje: 'Sube una foto (JPG o PNG) del comprobante' }
  if (f.length > MAX_FOTO_CHARS) return { ok: false, estado: 'INVALIDO', mensaje: 'La foto es muy pesada. Intenta con una captura de pantalla.' }

  const actual = await leerCheckout(checkoutId)
  if (!actual) return { ok: false, estado: 'INVALIDO', mensaje: 'No encontramos esta compra' }
  if (actual.estado === 'COMPROBANTE') return { ok: true, estado: 'COMPROBANTE', pedido: actual.crm_pedido_id, mensaje: 'Ya recibimos tu comprobante' }
  if (!(actual.total_centavos > 0)) return { ok: false, estado: 'INVALIDO', mensaje: 'Primero completa tus datos' }

  const c = await tomarParaCrear(checkoutId, ['COTIZADO', 'PAGANDO'])
  if (!c) {
    const ya = await leerCheckout(checkoutId)
    if (ya?.estado === 'COMPROBANTE') return { ok: true, estado: 'COMPROBANTE', pedido: ya.crm_pedido_id, mensaje: 'Ya recibimos tu comprobante' }
    return { ok: false, estado: 'INVALIDO', mensaje: 'Esta compra ya se está procesando. Espera un momento.' }
  }

  // 1) La foto, primero. Si no sube, se suelta el candado y el cliente reintenta.
  let fotoUrl
  try {
    fotoUrl = (await uploadToCloudinary(f, `comprobante_tienda_${checkoutId}_${Date.now()}.jpg`, 'mandarina-pro/comprobantes')).url
    if (!fotoUrl) throw new Error('Cloudinary no devolvió la URL')
  } catch (e) {
    await actualizarCheckout(checkoutId, { estado: 'COTIZADO', error: `foto: ${e.message}` }).catch(() => {})
    return { ok: false, estado: 'ERROR', mensaje: 'No pudimos subir la foto. Intenta de nuevo.' }
  }
  const conFoto = await actualizarCheckout(checkoutId, {
    metodo: 'TRANSFERENCIA', banco: cuenta.id, comprobante_url: fotoUrl,
    // ya no es un carrito abandonado: tiene comprobante
    aviso_abandono_en: new Date().toISOString(),
  })

  // 2) Pedido del CRM, retenido.
  let pedidoId = null
  let fallo = null
  try {
    const r = await crearPedidoCRM(conFoto, fotoUrl, base)
    pedidoId = r.pedidoId
    // ☠️ Creado SIN retener = un pedido sin plata confirmada camino a producción.
    if (!r.retenido) fallo = `☠️ el pedido ${pedidoId} NO quedó retenido (revisar SHOPIFY_VENDEDOR_USUARIO_ID): pasarlo a PENDIENTE_FABRICA a mano`
  } catch (e) {
    fallo = `pedido CRM: ${e.message}`
  }

  // 3) Chat en el inbox con la foto (aunque el pedido haya fallado: así alguien lo carga a mano).
  const aviso = await avisarChat(conFoto, {
    waMessageId: idAvisoTransferencia(checkoutId),
    texto: textoAvisoTransferencia(conFoto, { pedidoId }),
    mediaUrl: fotoUrl,
  })
  if (!aviso.ok) fallo = [fallo, `inbox: ${aviso.motivo}`].filter(Boolean).join(' · ')

  await actualizarCheckout(checkoutId, {
    estado: pedidoId ? 'COMPROBANTE' : 'ERROR', crm_pedido_id: pedidoId, error: fallo,
  }).catch(() => {})

  const total = `$${(conFoto.total_centavos / 100).toFixed(2)}`
  if (fallo) {
    await registrarEvento({
      fuente: 'otro', nivel: 'error', pedidoId,
      mensaje: `Transferencia de la tienda con problemas (${checkoutId}, ${cuenta.banco}, ${total}): ${fallo}. Comprobante: ${fotoUrl}`,
      detalle: { checkoutId, fotoUrl, cliente: conFoto.cliente },
    })
  } else {
    await registrarEvento({
      fuente: 'otro', nivel: 'ok', pedidoId,
      mensaje: `Transferencia de la tienda: comprobante recibido (${cuenta.banco}, ${total}) → ${pedidoId} retenido hasta confirmar`,
    })
  }
  return { ok: true, estado: 'COMPROBANTE', pedido: pedidoId, mensaje: 'Recibimos tu comprobante' }
}

const falla = (mensaje, status) => Object.assign(new Error(mensaje), { status })

async function transferenciaDe(pagoId) {
  const pago = await getPagoRaw(pagoId)
  if (!pago) throw falla('Pago no encontrado', 404)
  if (String(pago.tipo).toUpperCase() !== 'TRANSFERENCIA') throw falla('Ese pago no es una transferencia', 400)
  return pago
}

/**
 * SOLO ADMIN (lo exige la ruta). Devuelve { ok, pedidoId, shopify?, avisos[] }.
 *
 * ☠️ El pago se RECLAMA de forma atómica (PENDIENTE → PAGADO solo si sigue
 *    PENDIENTE): dos clics o dos ADMIN a la vez no crean dos pedidos en Shopify.
 * Si algo falla DESPUÉS de reclamarlo (pago PAGADO pero pedido aún en
 *    PENDIENTE_FABRICA), volver a tocar "Confirmar" termina los pasos que faltan.
 */
export async function confirmarTransferencia({ pagoId, admin }) {
  const pago = await transferenciaDe(pagoId)
  const pedidoId = pago.pedido_id
  const avisos = []

  const previo = await getPedidoById(pedidoId)
  if (!previo) throw falla('Pedido no encontrado', 404)
  if (previo.ESTADO_PEDIDO === 'CANCELADO') throw falla('El pedido está CANCELADO: no se puede confirmar su transferencia', 409)

  const estadoPago = String(pago.estado).toUpperCase()
  if (estadoPago === 'PENDIENTE') {
    const reclamado = await reclamarPago(pagoId, 'PENDIENTE', 'PAGADO', {
      notas: `${pago.notas || ''} · ✅ confirmada por ${admin}`.replace(' · SIN CONFIRMAR', ''),
    })
    if (!reclamado) throw falla('Otra persona acaba de confirmar o rechazar esta transferencia. Recarga la página.', 409)
  } else if (!(estadoPago === 'PAGADO' && previo.ESTADO_PEDIDO === 'PENDIENTE_FABRICA')) {
    // Ya confirmada y el pedido ya avanzó (o rechazada): nada que hacer.
    throw falla(`Esa transferencia ya está ${estadoPago.toLowerCase()}`, 409)
  }
  await recalcPago(pedidoId)

  const pedido = await getPedidoById(pedidoId)
  // ☠️ Paso a producción ATÓMICO: de dos confirmaciones simultáneas (p. ej. dos
  // "Terminar confirmación"), solo una mueve el pedido; la otra se detiene acá.
  const { data: movido, error: eMov } = await getSupabase().from('pedidos')
    .update({ estado_pedido: 'EN_FABRICA' })
    .eq('pedido_id', pedidoId).eq('estado_pedido', 'PENDIENTE_FABRICA')
    .select('pedido_id')
  if (eMov) throw eMov
  if (!movido?.length) throw falla('Otra confirmación ya pasó este pedido a producción. Recarga la página.', 409)
  await setEstado(pedidoId, 'EN_FABRICA') // misma escritura por el repo (respaldo en la hoja)
  await logCambio(pedidoId, 'ESTADO_PEDIDO', 'PENDIENTE_FABRICA', 'EN_FABRICA', admin)
  await logCambio(pedidoId, 'PAGO', 'TRANSFERENCIA PENDIENTE', 'TRANSFERENCIA PAGADA', admin)

  // Shopify: el pedido PAGADO, con la etiqueta que el webhook ignora.
  const c = await checkoutDePedido(pedidoId).catch(() => null)
  let shopify = null
  // ☠️ Candado del pedido de Shopify: solo UNA confirmación (aunque sean dos
  // "Terminar confirmación" a la vez) pasa la compra a CREANDO y crea el pedido.
  const tomada = c && !c.shopify_order_id ? await tomarParaCrear(c.id, ['COMPROBANTE', 'ERROR']).catch(() => null) : null
  if (c && !c.shopify_order_id && !tomada) {
    avisos.push('El pedido de Shopify ya lo está creando otra confirmación: revisa Shopify en un minuto.')
  }
  if (tomada) {
    try {
      shopify = await crearPedidoPagado({
        tienda: c.tienda, checkout: c, cobradoCentavos: c.total_centavos,
        transferencia: { confirmadoPor: admin },
      })
      await getSupabase().from('pedidos').update({ shopify_order_id: shopify.orderId }).eq('pedido_id', pedidoId)
      await actualizarCheckout(c.id, { estado: 'PAGADO', shopify_order_id: shopify.orderId, shopify_order_name: shopify.orderName, error: null })
    } catch (e) {
      // Se suelta el candado: "Terminar confirmación" puede reintentarlo.
      await actualizarCheckout(c.id, { estado: 'COMPROBANTE', error: `shopify: ${e.message}` }).catch(() => {})
      avisos.push(`No se creó el pedido en Shopify: ${e.message}`)
      await registrarEvento({ fuente: 'shopify', nivel: 'error', pedidoId, mensaje: `Transferencia confirmada ${pedidoId} SIN pedido en Shopify: ${e.message}` })
    }
  }

  // Recién ahora es una venta: Telegram + Purchase a Meta.
  const cli = c?.cliente || {}
  const cliente = {
    nombre: [cli.nombre, cli.apellido].filter(Boolean).join(' ') || pedido?.CLIENTE_NOMBRE,
    cedula: cli.cedula, celular: cli.celular, email: cli.email, ciudad: c?.direccion?.ciudad,
  }
  const montoTotal = Number(pedido?.MONTO_TOTAL || 0)
  await notificarVenta({
    pedidoId, tiendaId: 'MANDARINA', vendedor: 'TIENDA WEB (transferencia)', cliente: cliente.nombre,
    monto: montoTotal, prendas: undefined,
  }).catch(() => {})
  if (esCompraParaMeta('MANDARINA', montoTotal) && capiConfigurado()) {
    await enviarPurchase({ pedidoId, tiendaId: 'MANDARINA', cliente, montoTotal, vendedorId: pedido?.VENDEDOR_ID })
      .catch((e) => avisos.push(`Meta: ${e.message}`))
  }

  if (c) {
    await avisarChat(c, {
      waMessageId: idAvisoConfirmacion(pagoId, 'confirmar'),
      texto: `✅ Transferencia CONFIRMADA por ${admin}\n\nEl pedido ${pedidoId} pasa a producción.${shopify ? ` Shopify ${shopify.orderName}.` : ''}`,
    })
  }
  return { ok: true, pedidoId, shopify: shopify?.orderName || null, avisos }
}

/** SOLO ADMIN. Pago RECHAZADO, pedido CANCELADO. */
export async function rechazarTransferencia({ pagoId, admin, motivo = '' }) {
  const pago = await transferenciaDe(pagoId)
  const pedidoId = pago.pedido_id
  const reclamado = await reclamarPago(pagoId, 'PENDIENTE', 'RECHAZADO', {
    notas: `${pago.notas || ''} · ❌ rechazada por ${admin}${motivo ? `: ${motivo}` : ''}`.replace(' · SIN CONFIRMAR', ''),
  })
  if (!reclamado) throw falla(`Esa transferencia ya está ${String(pago.estado).toLowerCase()}. Recarga la página.`, 409)
  await recalcPago(pedidoId)
  const pedido = await getPedidoById(pedidoId)
  const antes = pedido?.ESTADO_PEDIDO || ''
  await setEstado(pedidoId, 'CANCELADO')
  await logCambio(pedidoId, 'ESTADO_PEDIDO', antes, 'CANCELADO', admin)

  const c = await checkoutDePedido(pedidoId).catch(() => null)
  if (c) {
    await actualizarCheckout(c.id, { error: `transferencia rechazada por ${admin}${motivo ? `: ${motivo}` : ''}` }).catch(() => {})
    await avisarChat(c, {
      waMessageId: idAvisoConfirmacion(pagoId, 'rechazar'),
      texto: `❌ Transferencia RECHAZADA por ${admin}${motivo ? `\nMotivo: ${motivo}` : ''}\n\nEl pedido ${pedidoId} quedó CANCELADO. Escríbele al cliente.`,
    })
  }
  await registrarEvento({ fuente: 'otro', nivel: 'aviso', pedidoId, mensaje: `Transferencia de la tienda RECHAZADA por ${admin} (${pedidoId})` })
  return { ok: true, pedidoId }
}
