// lib/cotizacion.js — Modelo, factories y cálculos del módulo Cotizaciones.
// Port a JS del types/cotizacion.ts del handoff. Sin dependencias del navegador,
// se usa igual en cliente (componentes) y servidor (repo/API).

import { fechaISOEcuador } from './parseFecha'

export const TIENDAS = ['mandarina', 'indstore']
export const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada']
export const TECNICAS = ['sublimacion', 'bordado', 'dtf']
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

// IVA Ecuador (15%)
export const IVA_RATE = 0.15

/**
 * Quién FIRMA el documento que ve el cliente.
 *
 * ⚠️ NO es quien armó la cotización. Hasta el 10-sep-2026 el documento firmaba
 * con `created_by_nombre` —la cuenta del CRM que la creó, o sea «Andres Admin»—
 * y ese nombre es INTERNO: identifica un usuario del sistema, no a la persona
 * que responde por la propuesta frente al cliente. Rodrigo pidió que toda
 * cotización salga firmada por la gerencia.
 *
 * ⚠️ El teléfono va acá y NO en `tiendaTheme`. El que se imprimía antes era
 * `tiendaTheme.telefono`, que es el marcador `+593 99 000 0000` en las DOS
 * tiendas: el cliente leía un número que no contesta nadie. Un dato de contacto
 * con marcador es peor que no ponerlo, porque nadie se entera de que está mal.
 *
 * Es una constante y no un campo del formulario a propósito: quien firma la
 * propuesta no es una decisión de cada cotización. Si algún día tiene que
 * cambiar por tienda, este objeto se vuelve un mapa por `tienda` y el único
 * sitio que hay que tocar sigue siendo este.
 */
export const FIRMA_COTIZACION = {
  nombre: 'Rodrigo Castillo',
  cargo: 'Gerente Mandarina Republic',
  telefono: '+593 98 374 5757',
}

/** Genera un id corto aleatorio (para productos en el cliente). */
export function shortId() {
  return Math.random().toString(36).slice(2, 9)
}

/**
 * Número de cotización tipo COT-AAAAMMDD-NNN.
 * El día es el de ECUADOR: este módulo también corre en el servidor (Vercel va
 * en UTC), donde las fechas locales son 5 horas adelante.
 */
export function nuevoNumero(d = new Date()) {
  const ymd = fechaISOEcuador(d).replace(/-/g, '')
  const n = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `COT-${ymd}-${n}`
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
    fecha: fechaISOEcuador(d),
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
