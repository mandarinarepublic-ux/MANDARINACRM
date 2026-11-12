// lib/checkoutTienda.js — Lo PURO del pago con tarjeta dentro de la tienda.
// Sin red ni base: se prueba directo (tests/checkout-tienda.test.js).
//
// Flujo (11-nov-2026, pedido de Rodrigo: "que nunca salga de la tienda"):
//   carrito de mandarinaec.com → "Pagar con tarjeta" → recuadro con /pagar del CRM
//   → datos + envío + total (Shopify calcula) → Cajita de Payphone → al aprobarse,
//   pedido PAGADO en Shopify → entra solo al CRM (orders/paid).
//
// ☠️ Nada de precios del navegador: el carrito solo manda variantes y cantidades.
//    Los montos los calcula Shopify (draftOrderCalculate) y lo que se cobra en
//    Payphone es lo que quedó guardado en la base, nunca lo que diga el cliente.

import { cuentaPorId } from './cuentasBancarias.js'

// ── El carrito que manda la tienda ──────────────────────────────────────────
// Llega en la URL del recuadro como "variante:cantidad,variante:cantidad".
// Topes chicos a propósito: un carrito real de esta tienda no pasa de unas
// pocas prendas, y la ruta es pública.
export const MAX_LINEAS = 30
export const MAX_CANTIDAD = 50

export function leerCarrito(texto) {
  const lineas = []
  for (const parte of String(texto || '').split(',')) {
    const m = parte.trim().match(/^(\d{5,20}):(\d{1,3})$/)
    if (!m) continue
    const cantidad = Number(m[2])
    if (cantidad < 1 || cantidad > MAX_CANTIDAD) continue
    const ya = lineas.find((l) => l.variantId === m[1])
    if (ya) ya.cantidad = Math.min(MAX_CANTIDAD, ya.cantidad + cantidad)
    else lineas.push({ variantId: m[1], cantidad })
    if (lineas.length >= MAX_LINEAS) break
  }
  return lineas
}

/**
 * Id de la compra (va dentro del clientTransactionId de Payphone). Es la LLAVE
 * de esa compra en la ruta pública: tiene que ser impredecible. 20 caracteres
 * base 36 de un generador criptográfico (~103 bits), no Math.random.
 * Payphone admite hasta 50 caracteres en el clientTransactionId de la Cajita.
 */
export const LARGO_ID = 20
export const ID_VALIDO = /^[0-9a-z]{20}$/

export function nuevoIdCheckout() {
  const bytes = new Uint8Array(LARGO_ID)
  globalThis.crypto.getRandomValues(bytes)
  // 252 = 36 × 7: se descartan los bytes ≥ 252 para no sesgar los dígitos.
  let s = ''
  while (s.length < LARGO_ID) {
    for (const b of bytes) {
      if (s.length === LARGO_ID) break
      if (b < 252) s += (b % 36).toString(36)
    }
    if (s.length < LARGO_ID) globalThis.crypto.getRandomValues(bytes)
  }
  return s
}

/**
 * clientTransactionId de cada Cajita: "<id>-<intento>". Payphone NO deja usar
 * el mismo dos veces ("ClientTransactionIdAreadyExist"), así que cada vez que se
 * abre la Cajita sube el intento. Del id se saca la compra al volver.
 */
export const ctxDeIntento = (id, intento) => `${id}-${intento}`
export function idDeCtx(ctx) {
  const m = String(ctx || '').match(/^([0-9a-z]{20})-\d{1,4}$/)
  return m ? m[1] : null
}

// ── Datos del cliente ───────────────────────────────────────────────────────
const limpio = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Celular de Ecuador → 09XXXXXXXX, o null. */
export function celularEC(entrada) {
  const d = String(entrada || '').replace(/\D/g, '')
  if (/^09\d{8}$/.test(d)) return d
  if (/^9\d{8}$/.test(d)) return '0' + d
  if (/^5939\d{8}$/.test(d)) return '0' + d.slice(3)
  return null
}

/** Cédula (10) o RUC (13) de Ecuador, solo dígitos. Sin validar el dígito verificador. */
export function cedulaEC(entrada) {
  const d = String(entrada || '').replace(/\D/g, '')
  return d.length === 10 || d.length === 13 ? d : null
}

/**
 * Valida lo que el cliente escribió. Devuelve { ok, datos } o { ok:false, errores }.
 * `errores` es un objeto campo → mensaje, para pintarlo al lado de cada campo.
 */
export function validarDatos(entrada = {}) {
  const errores = {}
  const nombre = limpio(entrada.nombre, 60)
  const apellido = limpio(entrada.apellido, 60)
  const email = limpio(entrada.email, 120).toLowerCase()
  const celular = celularEC(entrada.celular)
  const cedula = cedulaEC(entrada.cedula)
  const direccion = limpio(entrada.direccion, 200)
  const referencia = limpio(entrada.referencia, 200)
  const ciudad = limpio(entrada.ciudad, 60)
  const provincia = limpio(entrada.provincia, 60)
  const descuento = limpio(entrada.descuento, 40).toUpperCase()

  if (!nombre) errores.nombre = 'Escribe tu nombre'
  if (!apellido) errores.apellido = 'Escribe tu apellido'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.email = 'Correo no válido'
  if (!celular) errores.celular = 'Celular no válido (ej. 0987654321)'
  if (!cedula) errores.cedula = 'Cédula (10 dígitos) o RUC (13)'
  if (direccion.length < 5) errores.direccion = 'Escribe tu dirección'
  if (!ciudad) errores.ciudad = 'Escribe tu ciudad'
  if (!provincia) errores.provincia = 'Elige tu provincia'

  if (Object.keys(errores).length) return { ok: false, errores }
  return {
    ok: true,
    datos: {
      cliente: { nombre, apellido, email, celular, cedula },
      direccion: { direccion, referencia, ciudad, provincia },
      descuento: descuento || null,
    },
  }
}

export const PROVINCIAS_EC = [
  'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro', 'Esmeraldas',
  'Galápagos', 'Guayas', 'Imbabura', 'Loja', 'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo',
  'Orellana', 'Pastaza', 'Pichincha', 'Santa Elena', 'Santo Domingo de los Tsáchilas',
  'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe',
]

// ── Lo que se le manda a Shopify ────────────────────────────────────────────
/**
 * El DraftOrderInput. `envio` es la tarifa elegida ({ handle, title, price }) o
 * null para que Shopify devuelva las disponibles.
 */
export function inputBorrador({ lineas, cliente, direccion, descuento, envio, checkoutId, extra = {} }) {
  const input = {
    lineItems: lineas.map((l) => ({
      variantId: `gid://shopify/ProductVariant/${l.variantId}`,
      quantity: l.cantidad,
    })),
    email: cliente.email,
    phone: '+593' + cliente.celular.slice(1),
    shippingAddress: {
      firstName: cliente.nombre,
      lastName: cliente.apellido,
      address1: direccion.direccion,
      // MailingAddressInput no tiene "province" (solo provinceCode, y Shopify no
      // define provincias para Ecuador): la provincia va en la segunda línea.
      address2: [direccion.referencia, direccion.provincia].filter(Boolean).join(' · ') || null,
      city: direccion.ciudad,
      countryCode: 'EC',
      phone: '+593' + cliente.celular.slice(1),
    },
    customAttributes: [
      { key: 'Cédula', value: cliente.cedula },
      { key: 'Pago', value: 'Tarjeta · Payphone (en la tienda)' },
      { key: 'Checkout', value: checkoutId },
    ],
    note: `Cédula/RUC: ${cliente.cedula}`,
    tags: ['payphone', 'pago-en-tienda'],
    // ☠️ Sin esto el borrador IGNORA los descuentos automáticos (ej. la preventa
    // de navidad): el cliente pagaría más que en el checkout normal de Shopify.
    acceptAutomaticDiscounts: true,
    ...extra,
  }
  input.billingAddress = { ...input.shippingAddress }
  if (descuento) input.discountCodes = [descuento]
  if (envio) input.shippingLine = { shippingRateHandle: envio.handle, title: envio.title }
  return input
}

const centavos = (money) => Math.round(Number(money?.shopMoney?.amount ?? money?.amount ?? 0) * 100)

/**
 * Lo que importa del draftOrderCalculate, en un formato estable para la base y
 * la pantalla. Elige la tarifa de envío: la pedida si sigue existiendo, si no la
 * más barata (en esta tienda hay una sola aplicable: $5 o gratis desde $20).
 */
export function resumenCalculo(calc, handlePedido = null) {
  const tarifas = (calc?.availableShippingRates || []).map((r) => ({
    handle: r.handle, title: r.title, centavos: centavos(r.price),
  }))
  const elegida = tarifas.find((t) => t.handle === handlePedido)
    || [...tarifas].sort((a, b) => a.centavos - b.centavos)[0]
    || null
  return {
    lineas: (calc?.lineItems || []).map((li) => ({
      titulo: li.title,
      variante: li.variantTitle || '',
      cantidad: li.quantity,
      centavos: centavos(li.discountedTotalSet || li.originalTotalSet),
      imagen: li.image?.url || null,
    })),
    subtotal: centavos(calc?.subtotalPriceSet),
    descuentos: centavos(calc?.totalDiscountsSet),
    impuestos: centavos(calc?.totalTaxSet),
    codigos: calc?.discountCodes || [],
    tarifas,
    envio: elegida,
    // Con la tarifa ya puesta (2.º cálculo), el total de Shopify la incluye, con
    // descuentos de envío y todo. En el 1.er cálculo no hay tarifa: se suma acá.
    total: calc?.shippingLine
      ? centavos(calc?.totalPriceSet)
      : centavos(calc?.subtotalPriceSet) + centavos(calc?.totalTaxSet) + (elegida?.centavos || 0),
    avisos: (calc?.warnings || []).map((w) => w.message).filter(Boolean),
  }
}

/**
 * Montos para la Cajita (centavos, suma exacta). Si Shopify cobró IVA aparte se
 * usa ese; si no (esta tienda tiene taxesIncluded=false y no suma impuestos), el
 * precio ya incluye el 15 % y se desglosa igual que en los links.
 */
export function montosPayphone(totalCentavos, impuestosCentavos = 0, iva = 0.15) {
  const amount = Math.round(totalCentavos)
  if (!Number.isFinite(amount) || amount <= 0) return null
  let tax, amountWithTax
  if (impuestosCentavos > 0 && impuestosCentavos < amount) {
    tax = Math.round(impuestosCentavos)
    amountWithTax = Math.min(amount - tax, Math.round(tax / iva))
  } else {
    amountWithTax = Math.round(amount / (1 + iva))
    tax = amount - amountWithTax
  }
  return { amount, amountWithoutTax: amount - amountWithTax - tax, amountWithTax, tax }
}

// ── Carrito abandonado ──────────────────────────────────────────────────────
export const MINUTOS_ABANDONO = 30
export const HORAS_MAX_ABANDONO = 48 // más viejo que esto ya no se avisa

/** ¿Este intento de compra merece aviso al inbox? */
export function esAbandonado(c, ahora = Date.now()) {
  if (!c || c.aviso_abandono_en) return false
  if (!['COTIZADO', 'PAGANDO'].includes(c.estado)) return false
  if (!c.cliente?.celular) return false
  const edad = ahora - Date.parse(c.actualizado_en || c.creado_en)
  return edad >= MINUTOS_ABANDONO * 60000 && edad <= HORAS_MAX_ABANDONO * 3600000
}

const dinero = (cent) => `$${(Number(cent || 0) / 100).toFixed(2)}`

/** El aviso INTERNO que ve el vendedor en el chat del cliente. */
export function textoAbandono(c) {
  const r = c?.calculo || {}
  const lineas = (r.lineas || []).map((l) =>
    `• ${[l.titulo, l.variante].filter(Boolean).join(' · ')} · x${l.cantidad} — ${dinero(l.centavos)}`)
  const cli = c?.cliente || {}
  const dir = c?.direccion || {}
  if (c?.metodo === 'TRANSFERENCIA') {
    const cuenta = cuentaPorId(c.banco)
    return [
      '🛒 CARRITO SIN PAGAR — transferencia en la tienda web',
      '',
      ...(lineas.length ? lineas : ['• (sin detalle de productos)']),
      '',
      `Total: ${dinero(c?.total_centavos || r.total)}`,
      `Banco elegido: ${cuenta ? cuenta.banco : (c.banco || 'ninguno todavía')}`,
      `Cliente: ${[cli.nombre, cli.apellido].filter(Boolean).join(' ')}${cli.email ? ` · ${cli.email}` : ''}`,
      ...(dir.ciudad ? [`Envío: ${[dir.ciudad, dir.provincia].filter(Boolean).join(', ')}`] : []),
      '',
      '⚠️ Eligió pagar por transferencia y no subió el comprobante. Escríbele para ayudarle con el pago.',
    ].join('\n')
  }
  return [
    '🛒 CARRITO SIN PAGAR — tarjeta en la tienda web',
    '',
    ...(lineas.length ? lineas : ['• (sin detalle de productos)']),
    '',
    `Total: ${dinero(c?.total_centavos || r.total)}`,
    `Cliente: ${[cli.nombre, cli.apellido].filter(Boolean).join(' ')}${cli.email ? ` · ${cli.email}` : ''}`,
    ...(dir.ciudad ? [`Envío: ${[dir.ciudad, dir.provincia].filter(Boolean).join(', ')}`] : []),
    '',
    '⚠️ Llenó sus datos para pagar con tarjeta y no terminó. Envíale la plantilla de ayuda con el pago.',
  ].join('\n')
}

export const idAvisoAbandono = (checkoutId) => `carrito_${checkoutId}`
