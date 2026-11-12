// lib/cuentasBancarias.js — Las cuentas donde los clientes transfieren, POR TIENDA.
// Puro (sin red, sin '@/'): lo usan el recuadro de pago de la tienda y el aviso del inbox.
//
// Fuente: las respuestas rápidas activas del inbox (grupo "datos"), 12-nov-2026:
//   MANDARINA ← inbox MANDI · INDSTORE ← inbox IND.
// ☠️ Si cambia una cuenta o un QR, cambiarlo AQUÍ y en las respuestas rápidas del inbox.
// ☠️ Los ids se repiten entre tiendas (pichincha, deuna): buscar SIEMPRE con la tienda.

export const TIENDAS_PAGO = ['MANDARINA', 'INDSTORE']

const MANDARINA = { titular: 'RODRIGO CASTILLO', cedula: '1716608094' }
const IND = { titular: 'XAVIER FROILAN CASTILLO BARRETO', cedula: '1723476865' }

export const CUENTAS_POR_TIENDA = {
  MANDARINA: [
    { id: 'pichincha', banco: 'Banco Pichincha', tipo: 'Ahorros', numero: '2210996988', color: '#ffdd00', texto: '#0f265c' },
    { id: 'guayaquil', banco: 'Banco Guayaquil', tipo: 'Ahorros', numero: '38180287', color: '#d6006f', texto: '#ffffff' },
    { id: 'produbanco', banco: 'Produbanco', tipo: 'Ahorros', numero: '18059046370', color: '#00843d', texto: '#ffffff' },
    // qr: imagen de la respuesta rápida "App De UNA" del inbox MANDI, copiada a public/ (12-nov)
    { id: 'deuna', banco: 'Deuna', tipo: 'Corriente', numero: '7700310145', color: '#4c1d95', texto: '#ffffff', qr: '/qr-deuna.jpg' },
  ].map((c) => ({ ...c, ...MANDARINA })),
  INDSTORE: [
    { id: 'pichincha', banco: 'Banco Pichincha', tipo: 'Ahorros', numero: '2202684983', color: '#ffdd00', texto: '#0f265c' },
    { id: 'produbanco', banco: 'Produbanco', tipo: 'Ahorros', numero: '20300876864', color: '#00843d', texto: '#ffffff' },
    { id: 'pacifico', banco: 'Banco del Pacífico', tipo: 'Ahorros', numero: '1063837358', color: '#0096d6', texto: '#ffffff' },
    { id: 'austro', banco: 'Banco del Austro', tipo: 'Ahorros', numero: '0717658582', color: '#1b2a6b', texto: '#ffffff' },
    { id: 'bolivariano', banco: 'Banco Bolivariano', tipo: 'Ahorros', numero: '1671055313', color: '#00a19a', texto: '#ffffff' },
    // ☠️ Deuna de IND es SOLO QR: escrito a mano sale "cuenta inválida". Sin número.
    { id: 'deuna', banco: 'Deuna', tipo: null, numero: null, color: '#4c1d95', texto: '#ffffff', qr: '/qr-deuna-ind.jpg',
      aviso: 'Paga escaneando el código QR. No escribas el número a mano: sale como cuenta inválida.' },
  ].map((c) => ({ ...c, ...IND })),
}

/** La tienda válida (lista cerrada); cualquier otra cosa → MANDARINA. */
export function tiendaPago(t) {
  const v = String(t || '').toUpperCase()
  return TIENDAS_PAGO.includes(v) ? v : 'MANDARINA'
}

/** Las cuentas de una tienda. */
export function cuentasDe(tienda) {
  return CUENTAS_POR_TIENDA[tiendaPago(tienda)]
}

/** La cuenta por su id DENTRO de la tienda, o null si no existe (nunca se inventa una). */
export function cuentaPorId(id, tienda = 'MANDARINA') {
  return cuentasDe(tienda).find((c) => c.id === String(id || '')) || null
}

/** Compatibilidad: las de MANDARINA. */
export const CUENTAS = CUENTAS_POR_TIENDA.MANDARINA
