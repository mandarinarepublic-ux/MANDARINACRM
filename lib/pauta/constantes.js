// lib/pauta/constantes.js
// Los números que gobiernan el tablero, en un solo lugar para poder moverlos
// sin tocar la lógica.

/**
 * Antes del 13-jul-2026 el webhook NO guardaba `referral`, así que no hay
 * historia de pauta anterior. El tablero no muestra ceros ahí: muestra el aviso.
 */
export const FECHA_PISO = '2026-07-13'

/** Días desde el primer contacto en los que un pedido todavía cuenta como de ese anuncio. */
export const VENTANA_DIAS = 30

/** Mensajes ENTRANTES para considerar que la persona respondió / conversó. */
export const MIN_RESPONDIO = 2
export const MIN_CONVERSO = 3

/** Las dos tiendas que pautean. YAW no pautea y queda fuera a propósito. */
export const TIENDAS = [
  { id: 'INDSTORE',  nombre: 'IND STORE',          cuentaInbox: 'IND' },
  { id: 'MANDARINA', nombre: 'Mandarina Republic', cuentaInbox: 'MANDI' },
]
