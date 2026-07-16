// lib/cotizacion.js — Modelo, factories y cálculos del módulo Cotizaciones.
// Port a JS del types/cotizacion.ts del handoff. Sin dependencias del navegador,
// se usa igual en cliente (componentes) y servidor (repo/API).

export const TIENDAS = ['mandarina', 'indstore']
export const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada']
export const TECNICAS = ['sublimacion', 'bordado', 'dtf']
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

// IVA Ecuador (15%)
export const IVA_RATE = 0.15

/** Genera un id corto aleatorio (para productos en el cliente). */
export function shortId() {
  return Math.random().toString(36).slice(2, 9)
}

/** Número de cotización tipo COT-AAAAMMDD-NNN. */
export function nuevoNumero(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const n = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `COT-${y}${m}${day}-${n}`
}

/** Producto vacío. */
export function nuevoProducto() {
  return {
    id: shortId(),
    nombre: '',
    tecnica: 'sublimacion',
    color: '',
    precio: '',
    cantidad: 1,
    conTallas: false,
    tallas: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0 },
    foto: '',
    diseno_pecho: '',
    diseno_espalda: '',
    manga_derecha: '',
    manga_izquierda: '',
  }
}

/** Cotización vacía (sin id). */
export function nuevaCotizacion(tienda = 'mandarina') {
  const d = new Date()
  return {
    numero: nuevoNumero(d),
    fecha: d.toISOString().split('T')[0],
    tienda,
    estado: 'borrador',
    cliente_nombre: '',
    cliente_cedula: '',
    cliente_tel: '',
    cliente_email: '',
    productos: [nuevoProducto()],
    descuento: 0,
    validez_dias: 15,
    entrega_dias: 15,
    anticipo_pct: 50,
    condiciones_pago: '50% de abono inicial\n50% contra entrega',
    tiempo_produccion:
      'días laborables posteriores a la confirmación del abono y aprobación de la muestra del diseño',
    beneficios:
      'Tallas disponibles desde XS hasta 2XL\nTallas 3XL en adelante: +$1 adicional por unidad\nGarantía de confección y acabados',
    notas: '',
  }
}

/** Subtotal de un producto = cantidad × precio. */
export function calcSubtotalProducto(p) {
  return (Number(p.cantidad) || 0) * (parseFloat(String(p.precio)) || 0)
}

/** Totales de la cotización. IVA se aplica sobre (subtotal − descuento). */
export function calcTotales(productos, descuento, ivaRate = IVA_RATE) {
  const subtotal = (productos || []).reduce((a, p) => a + calcSubtotalProducto(p), 0)
  const desc = Math.max(0, Number(descuento) || 0)
  const base = Math.max(0, subtotal - desc)
  const iva = base * ivaRate
  return { subtotal, desc, base, iva, total: base + iva }
}

/** Suma de tallas de un producto (para autocalcular cantidad). */
export function sumaTallas(tallas) {
  return TALLAS.reduce((a, t) => a + (Number(tallas?.[t]) || 0), 0)
}

export function fmtUSD(n) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

const TECNICA_LABEL = { sublimacion: 'Sublimación', bordado: 'Bordado', dtf: 'DTF / Estampado' }
export function tecnicaLabel(t) {
  return TECNICA_LABEL[t] || t || ''
}
