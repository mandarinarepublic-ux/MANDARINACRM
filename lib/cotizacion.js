// lib/cotizacion.js — Modelo, factories y cálculos del módulo Cotizaciones.
// Port a JS del types/cotizacion.ts del handoff. Sin dependencias del navegador,
// se usa igual en cliente (componentes) y servidor (repo/API).

// Con la extensión .js a propósito: sin ella este módulo no se puede importar
// desde una prueba de `node --test` (ESM no resuelve rutas relativas sin
// extensión), y la cuenta de los totales y del número no tendrían guarda.
// Para webpack/Next es indistinto.
import { fechaISOEcuador } from './parseFecha.js'

export const TIENDAS = ['mandarina', 'indstore']
export const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada']
export const TECNICAS = ['sublimacion', 'bordado', 'dtf']
export const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

// IVA Ecuador (15%)
export const IVA_RATE = 0.15

/**
 * Ancho de DISEÑO del documento del cliente, en píxeles.
 *
 * Manda en dos sitios que tienen que coincidir sí o sí: el `maxWidth` del
 * documento en pantalla (CotizacionPreview) y el ancho al que se captura para
 * el PDF (`pdfDeDocumento`).
 *
 * ⚠️ Por eso es una constante y no dos números sueltos. Si el PDF se capturara
 * más angosto que el documento, le recortaría el borde derecho; y si se
 * capturara al ancho de la VENTANA, el mismo botón daría un PDF distinto desde
 * un celular que desde un escritorio, sin que nadie sepa por qué.
 */
export const ANCHO_DOC_COTIZACION = 820

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

// ── El número de cotización: COT-AAAAMMDD-NNN ───────────────────────────────
//
// ⚠️ LO ASIGNA EL SERVIDOR AL CREAR, no el navegador. Hasta el 10-sep-2026 lo
// inventaba el cliente con `Math.random()` entre 1 y 999: con quince
// cotizaciones en un día había un 10% de que dos salieran con el MISMO número,
// y nada lo impedía, ni acá ni en la base. Dos clientes con «COT-20260910-042»
// distintas es el tipo de error que se descubre cuando uno de los dos reclama.
//
// Ahora es secuencial por día (001, 002, …), lo calcula `createCotizacion` en
// lib/db/cotizaciones.js y un índice ÚNICO en la base garantiza que aunque dos
// vendedores guarden en el mismo instante, uno de los dos reintenta.
//
// El día es el de ECUADOR: esto también corre en el servidor (Vercel va en UTC),
// donde después de las 7 pm ya es "mañana".

/** El prefijo del día: `COT-20260910-`. */
export function prefijoNumero(d = new Date()) {
  return `COT-${fechaISOEcuador(d).replace(/-/g, '')}-`
}

/**
 * El número que sigue, dados los que ya existen con ese prefijo.
 *
 * Función PURA para poder probarla: es la que decide que no haya dos iguales
 * y que la cuenta no se reinicie ni salte.
 *
 * ⚠️ El máximo se busca como NÚMERO, no ordenando texto. Con más de 999 en un
 * día, «1000» ordena ANTES que «999» como cadena, el máximo saldría mal y el
 * siguiente chocaría con uno que ya existe.
 */
export function numeroSiguiente(prefijo, existentes = []) {
  let max = 0
  for (const n of existentes || []) {
    const s = String(n ?? '')
    if (!s.startsWith(prefijo)) continue
    const k = parseInt(s.slice(prefijo.length), 10)
    if (Number.isFinite(k) && k > max) max = k
  }
  return `${prefijo}${String(max + 1).padStart(3, '0')}`
}

/** Lo que se muestra mientras el servidor no haya asignado número todavía. */
export const NUMERO_PENDIENTE = 'Se asigna al guardar'

// ── Los estados, con su etiqueta ────────────────────────────────────────────
//
// `ESTADOS` (arriba) es la lista válida; la base la vigila con un CHECK. Acá va
// cómo se muestra cada uno, para que el formulario y el historial digan lo
// mismo.
export const ESTADO_COT_LABEL = {
  borrador:  '📝 Borrador',
  enviada:   '📤 Enviada',
  aprobada:  '✅ Aprobada',
  rechazada: '❌ Rechazada',
}

/** Clases Tailwind del chip de cada estado (fondo + texto). */
export const ESTADO_COT_CLASES = {
  borrador:  'bg-yellow-500/20 text-yellow-400',
  enviada:   'bg-sky-500/20 text-sky-400',
  aprobada:  'bg-green-500/20 text-green-400',
  rechazada: 'bg-red-500/20 text-red-400',
}

/** ¿Es un estado válido? Lo comprueba el PATCH antes de dejarlo pasar. */
export function esEstadoValido(estado) {
  return ESTADOS.includes(estado)
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
    numero: '',          // lo asigna el servidor al crear (ver prefijoNumero)
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

/**
 * Qué le falta a una cotización para poder guardarse. Vacío = se puede.
 *
 * ⚠️ Hasta el 10-sep-2026 se guardaba CUALQUIER cosa: sin cliente, sin
 * teléfono y sin prendas. El «0/4 secciones» del formulario era decorativo.
 * Una cotización vacía en el historial no es inofensiva: se lleva un número
 * de la secuencia del día y aparece en la lista de todos.
 *
 * Lo mínimo es a quién y qué: nombre del cliente y UNA prenda con nombre,
 * precio y cantidad. El teléfono no bloquea —hay cotizaciones que van por
 * correo— y las condiciones traen texto por defecto.
 *
 * Función PURA y compartida: la usan el formulario (para avisar antes de
 * pedir) y las rutas de la API (que son la puerta de verdad).
 */
export function faltantesCotizacion(c) {
  const faltan = []
  if (!String(c?.cliente_nombre ?? '').trim()) faltan.push('el nombre del cliente')
  const prendas = Array.isArray(c?.productos) ? c.productos : []
  const validas = prendas.filter((p) =>
    String(p?.nombre ?? '').trim()
    && (parseFloat(String(p?.precio)) || 0) > 0
    && (Number(p?.cantidad) || 0) > 0,
  )
  if (validas.length === 0) faltan.push('al menos una prenda con nombre, precio y cantidad')
  return faltan
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

/**
 * El teléfono del cliente en el formato que pide un enlace `wa.me`: solo
 * dígitos y con código de país.
 *
 * El campo del formulario es texto libre («+593 99 123 4567», «0991234567»,
 * «099-123-4567»), así que hay que normalizarlo antes de armar el enlace.
 *
 * ⚠️ Se comprueba PRIMERO si ya trae el 593. La versión que vive en la pantalla
 * del pedido hace `cel.startsWith('0') ? '593'+cel.slice(1) : '593'+cel`, y a un
 * número ya internacional le antepone otro 593: `593593…`, un enlace que abre
 * WhatsApp con un contacto que no existe. Acá no.
 *
 * Devuelve '' si no hay nada aprovechable. Quien llama decide qué hacer con eso
 * — `wa.me` sin número abre WhatsApp para que el vendedor elija el contacto, que
 * es mejor que no abrir nada.
 */
export function numeroWhatsApp(tel) {
  const d = String(tel ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('593')) return d
  if (d.startsWith('0')) return '593' + d.slice(1)
  // Un celular ecuatoriano sin el 0 de adelante ni el código de país.
  if (d.length === 9) return '593' + d
  return d
}

/**
 * El mensaje que acompaña a la cotización en WhatsApp.
 *
 * Los asteriscos son el negrita de WhatsApp, no un descuido.
 */
export function textoWhatsAppCotizacion(c, total) {
  const nombre = String(c?.cliente_nombre ?? '').trim()
  const saludo = nombre ? `Hola ${nombre} 👋` : 'Hola 👋'
  const validez = Number(c?.validez_dias) || 0
  const lineas = [saludo, '', `Te comparto la cotización *${c?.numero ?? ''}*.`, '', `💰 Total: ${fmtUSD(total)}`]
  // Solo si la hay: una línea vacía de más se ve como un descuido en el chat.
  if (validez > 0) lineas.push(`📅 Válida por ${validez} días`)
  lineas.push('', 'Cualquier duda me escribes y la ajustamos.')
  return lineas.join('\n')
}

export function fmtUSD(n) {
  return `$${(Number(n) || 0).toFixed(2)}`
}

const TECNICA_LABEL = { sublimacion: 'Sublimación', bordado: 'Bordado', dtf: 'DTF / Estampado' }
export function tecnicaLabel(t) {
  return TECNICA_LABEL[t] || t || ''
}
