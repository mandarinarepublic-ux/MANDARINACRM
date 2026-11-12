// lib/transferenciaTienda.js — Reglas de la transferencia dentro de la tienda (12-nov-2026).
// Puro (sin red, sin '@/'). Spec: docs/superpowers/specs/2026-11-12-transferencia-en-tienda-design.md
//
// El cliente sube el comprobante en el recuadro → el pedido entra al CRM RETENIDO
// (PENDIENTE_FABRICA) con un pago TRANSFERENCIA en PENDIENTE. Solo un ADMIN lo
// confirma (→ producción) o lo rechaza (→ cancelado).

import { cuentaPorId } from './cuentasBancarias.js'
import { normalizarCelular, tallaYColor, AREA_WEB } from './shopifyPedido.js'

/** Etiqueta del pedido de Shopify creado al confirmar: el webhook NO lo vuelve a crear. */
export const ETIQUETA_TRANSFERENCIA = 'transferencia-tienda'

/** Estados a los que un pedido NO puede pasar mientras la transferencia no esté confirmada. */
export const ESTADOS_QUE_EXIGEN_PAGO = new Set(['EN_FABRICA', 'DESPACHO', 'COMPLETADO', 'ENTREGADO'])

// Los pagos llegan en tres formas: Postgres (tipo/estado), la hoja y el pedido
// armado por lib/db/pedidos (TIPO_PAGO/ESTADO_PAGO).
const campo = (p, k) => {
  const K = k.toUpperCase()
  return String(p?.[k] ?? p?.[K] ?? p?.[`${K}_PAGO`] ?? '').toUpperCase()
}

/** ¿Hay una transferencia esperando que un ADMIN la confirme? */
export function transferenciaSinConfirmar(pagos) {
  return (Array.isArray(pagos) ? pagos : []).some(
    (p) => campo(p, 'tipo') === 'TRANSFERENCIA' && campo(p, 'estado') === 'PENDIENTE',
  )
}

/**
 * ¿Este pago suma al abonado? Todo cuenta como siempre, MENOS la transferencia
 * sin confirmar o rechazada (LINK_PAGO pendiente sigue contando: no se mueven
 * los números de cobranza que ya existen).
 */
export function cuentaComoAbono(pago) {
  if (campo(pago, 'tipo') !== 'TRANSFERENCIA') return true
  return !['PENDIENTE', 'RECHAZADO'].includes(campo(pago, 'estado'))
}

/** ¿El pedido de Shopify (webhook REST) trae nuestra etiqueta? */
export function tieneEtiquetaTransferencia(order) {
  const tags = Array.isArray(order?.tags) ? order.tags : String(order?.tags || '').split(',')
  return tags.map((t) => String(t).trim().toLowerCase()).includes(ETIQUETA_TRANSFERENCIA)
}

export const idAvisoTransferencia = (checkoutId) => `transferencia_${checkoutId}`
export const idAvisoConfirmacion = (pagoId, accion) => `transferencia_${accion}_${pagoId}`

const dinero = (cent) => `$${(Number(cent || 0) / 100).toFixed(2)}`

/** El aviso INTERNO que ve el vendedor en el chat, junto a la foto del comprobante. */
export function textoAvisoTransferencia(c, { pedidoId } = {}) {
  const r = c?.calculo || {}
  const cli = c?.cliente || {}
  const dir = c?.direccion || {}
  const cuenta = cuentaPorId(c?.banco)
  const lineas = (r.lineas || []).map((l) =>
    `• ${[l.titulo, l.variante].filter(Boolean).join(' · ')} · x${l.cantidad} — ${dinero(l.centavos)}`)
  return [
    '🏦 TRANSFERENCIA DESDE LA TIENDA WEB — comprobante adjunto',
    '',
    ...(lineas.length ? lineas : ['• (sin detalle de productos)']),
    '',
    `Total: ${dinero(c?.total_centavos || r.total)}`,
    `Banco: ${cuenta ? `${cuenta.banco} (${cuenta.tipo} ${cuenta.numero})` : (c?.banco || '-')}`,
    `Pedido CRM: ${pedidoId || '(no se pudo crear, cargarlo a mano)'}`,
    `Cliente: ${[cli.nombre, cli.apellido].filter(Boolean).join(' ')} · CI ${cli.cedula || '-'}${cli.email ? ` · ${cli.email}` : ''}`,
    `Envío: ${[dir.direccion, dir.referencia, dir.ciudad, dir.provincia].filter(Boolean).join(', ')}`,
    '',
    '⚠️ Verifica en el banco que la plata entró. Un ADMIN confirma o rechaza en el CRM (sección Pagos del pedido).',
  ].join('\n')
}

/**
 * Lo que se le manda a /api/pedidos (como TIENDA WEB) cuando el cliente sube el
 * comprobante. Mismo criterio que `mapearPedido` de los pedidos web pagados
 * (área web, pago = total de las prendas, sin factura Dátil), pero con la cédula
 * REAL del cliente y el pedido RETENIDO hasta que un ADMIN confirme.
 * Las líneas de Shopify (`calculo.lineas`) vienen en el MISMO orden que `lineas`.
 */
export function payloadPedidoTransferencia(c, fotoUrl) {
  const cli = c?.cliente || {}
  const dir = c?.direccion || {}
  const calc = c?.calculo || {}
  const cuenta = cuentaPorId(c?.banco)
  const items = (c?.lineas || []).map((l, i) => {
    const li = calc.lineas?.[i] || {}
    const cantidad = parseInt(l.cantidad || li.cantidad || 1, 10)
    const { talla, color } = tallaYColor(li.variante)
    return {
      productoNombre: li.titulo || `Variante ${l.variantId}`,
      talla, color,
      cantidad,
      precioUnit: Math.round(Number(li.centavos || 0) / cantidad) / 100,
      area: AREA_WEB,
      esPersonalizado: false,
      shopifyVariantId: String(l.variantId || ''),
      imagenShopify: li.imagen || '',
    }
  })
  const totalPrendas = items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0)
  const direccion = [dir.direccion, [dir.referencia, dir.provincia].filter(Boolean).join(' · ')]
    .map((x) => String(x || '').trim()).filter(Boolean).join('\n')
  return {
    tiendaId: 'MANDARINA',
    cliente: {
      nombre: [cli.nombre, cli.apellido].filter(Boolean).join(' ') || 'Cliente web',
      cedula: String(cli.cedula || ''),
      celular: normalizarCelular(cli.celular),
      email: cli.email || '',
      ciudad: dir.ciudad || '',
      direccion,
    },
    items,
    pagos: [{
      tipo: 'TRANSFERENCIA',
      monto: Math.round(totalPrendas * 100) / 100,
      fotoComprobante: fotoUrl || '',
      notas: `Transferencia ${cuenta?.banco || c?.banco || ''} · tienda web (compra ${c?.id}, total cobrado ${dinero(c?.total_centavos)}) · SIN CONFIRMAR`,
    }],
    emitirFactura: false,
    direccionTexto: direccion,
    ciudadPedido: dir.ciudad || '',
    notasVendedor: `Transferencia desde la tienda web (compra ${c?.id}). ⏳ Retenido hasta que un ADMIN confirme el pago.`,
    retenerTransferencia: true,
  }
}
