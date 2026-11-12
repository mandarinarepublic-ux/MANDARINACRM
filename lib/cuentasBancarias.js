// lib/cuentasBancarias.js — Las cuentas donde los clientes de MANDARINA transfieren.
// Puro (sin red, sin '@/'): lo usan el recuadro de pago de la tienda y el aviso del inbox.
//
// Fuente: las respuestas rápidas activas del inbox MANDI (grupo "datos"), 12-nov-2026.
// ☠️ Si cambia una cuenta, cambiarla AQUÍ y en las respuestas rápidas del inbox.

const TITULAR = 'RODRIGO CASTILLO'
const CEDULA = '1716608094'

export const CUENTAS = [
  { id: 'pichincha', banco: 'Banco Pichincha', tipo: 'Ahorros', numero: '2210996988', color: '#ffdd00', texto: '#0f265c' },
  { id: 'guayaquil', banco: 'Banco Guayaquil', tipo: 'Ahorros', numero: '38180287', color: '#d6006f', texto: '#ffffff' },
  { id: 'produbanco', banco: 'Produbanco', tipo: 'Ahorros', numero: '18059046370', color: '#00843d', texto: '#ffffff' },
  { id: 'deuna', banco: 'Deuna', tipo: 'Corriente', numero: '7700310145', color: '#4c1d95', texto: '#ffffff' },
].map((c) => ({ ...c, titular: TITULAR, cedula: CEDULA }))

/** La cuenta por su id, o null si no existe (nunca se inventa una). */
export function cuentaPorId(id) {
  return CUENTAS.find((c) => c.id === String(id || '')) || null
}
