// lib/linkPago.js — Lo puro de la pantalla "Link de pago" (/dashboard/link-pago).
//
// Pedido de Rodrigo (10-nov-2026): debajo de "Nueva Venta", algo SÚPER sencillo:
// celular + valor → botón "Enviar por WhatsApp" que abre el WhatsApp del celular
// del vendedor con el mensaje y el link de Payphone listos. Nada sale por la API
// de Meta: lo manda el vendedor desde su número, como un mensaje más.
//
// Sin red ni Supabase: se prueba directo (tests/link-pago.test.js).
import { tiendasDe } from './tiendasUsuario.js'

/**
 * Las tiendas con link de pago. Cada una tiene su tienda en Payphone (StoreId
 * propio) y su voz: el cliente tiene que reconocer a quién le paga.
 */
export const TIENDAS_LINK = {
  MANDARINA: {
    nombre: 'Mandarina Republic',
    envStore: 'PAYPHONE_STORE_ID_MANDARINA',
    referencia: 'Pago Mandarina Republic',
    mensaje: (valor, link) =>
      `🧡 Aquí está tu link de pago por $${valor} USD:\n\n${link}\n\n✅ Pago seguro con tarjeta\n⏳ Válido por 2 días\n\n¡Gracias por tu compra en Mandarina Republic! 🍊`,
  },
  INDSTORE: {
    nombre: 'IND STORE',
    envStore: 'PAYPHONE_STORE_ID_INDSTORE',
    referencia: 'Pago IND STORE',
    mensaje: (valor, link) =>
      `🛒 Aquí está tu link de pago por $${valor} USD:\n\n${link}\n\n✅ Pago seguro con tarjeta\n⏳ Válido por 2 días\n\n¡Gracias por tu compra en IND STORE!`,
  },
}

/**
 * Con qué tiendas puede cobrar este usuario (orden fijo: Mandarina primero).
 * ADMIN → las dos. Un vendedor → las suyas que tengan link. Si no tiene ninguna
 * de las dos (p. ej. solo YAW), cobra con Mandarina: es la cuenta de la empresa
 * y es preferible a dejarlo sin poder cobrar.
 * `usuario` es el del servidor (ROL, TIENDAS en csv) o el del navegador (rol, tiendas[]).
 */
export function tiendasLinkPago(usuario) {
  const rol = usuario?.ROL ?? usuario?.rol
  const todas = Object.keys(TIENDAS_LINK)
  if (rol === 'ADMIN') return todas
  const suyas = tiendasDe({ tiendas: usuario?.TIENDAS ?? usuario?.tiendas })
  const permitidas = todas.filter((t) => suyas.includes(t))
  return permitidas.length > 0 ? permitidas : ['MANDARINA']
}

/**
 * Celular de Ecuador a formato internacional sin "+" (lo que pide wa.me).
 *   0987654321 · 987654321 · +593 98 765 4321 · 593987654321 → 593987654321
 * Devuelve null si no parece un celular de Ecuador (09 + 8 dígitos). Un número
 * de afuera se acepta solo si viene con su código de país (+ o 00).
 */
export function normalizarCelular(entrada) {
  const crudo = String(entrada || '').trim()
  const conMas = /^\s*(\+|00)/.test(crudo)
  let d = crudo.replace(/\D/g, '')
  if (crudo.trim().startsWith('00')) d = d.slice(2)
  if (/^5939\d{8}$/.test(d)) return d
  if (/^09\d{8}$/.test(d)) return '593' + d.slice(1)
  if (/^9\d{8}$/.test(d)) return '593' + d
  if (conMas && d.length >= 10 && d.length <= 15 && !d.startsWith('593')) return d
  return null
}

/** El valor que escribió el vendedor, o null si no sirve. Máximo 2 decimales. */
export function validarValor(v) {
  const n = Number(String(v ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return null
  return Math.round(n * 100) / 100
}

/** "35" → "35", "35.5" → "35.50": como se lee un precio. */
export function formatoValor(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/**
 * Cuáles links del histórico se le vuelven a preguntar a Payphone al abrir la
 * pantalla. Solo los que todavía pueden cambiar (no PAGADO), de los últimos 7
 * días (el link vence a las 48 h; un margen por si pagaron al filo), y que no se
 * hayan revisado en el último minuto. Tope de 10 por vez: Payphone permite 30
 * consultas por minuto y la pantalla no puede quedarse esperando a 50.
 */
export const DIAS_REVISION = 7
export const TOPE_REVISION = 10

export function linksPorRevisar(links, ahora = Date.now()) {
  return (links || [])
    // Desde el 13-nov la tabla también guarda links de dLocal: a Payphone solo
    // se le pregunta por los suyos (un 404 de Payphone se lee como PENDIENTE y
    // pisaría un dLocal vencido o rechazado).
    .filter((l) => !l?.proveedor || l.proveedor === 'PAYPHONE')
    .filter((l) => l?.estado !== 'PAGADO')
    .filter((l) => ahora - Date.parse(l.creado_en) <= DIAS_REVISION * 86400000)
    .filter((l) => !l.revisado_en || ahora - Date.parse(l.revisado_en) > 60000)
    .slice(0, TOPE_REVISION)
}

/** El enlace que abre el WhatsApp del vendedor con el chat y el texto listos. */
export function urlWhatsApp(celular, texto) {
  return `https://wa.me/${celular}?text=${encodeURIComponent(texto)}`
}
