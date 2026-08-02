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

/**
 * Los números de WhatsApp de cada tienda.
 *
 * Cada inbox atiende DOS, y se comportan muy distinto: al 2-ago REPUBLIC lleva
 * 33 chats de pauta y el 9804 lleva 321. Mezclarlos aplasta el análisis, y
 * además los dos entraron a Cloud API recién el 28 y 29 de julio, así que sus
 * series son mucho más cortas que las de los números principales.
 *
 * Los phone_id son los de Meta y CAMBIAN si el número se migra de WABA (le pasó
 * al 3326 el 28-jul). Si un canal deja de mostrar datos, empieza por acá: es el
 * mismo mapa que vive en lib/canales.js de cada inbox.
 */
export const CANALES = {
  INDSTORE: [
    { phoneId: '1153686904504422', etiqueta: '3326', nombre: '+593 99 995 3326' },
    { phoneId: '2241248862581450', etiqueta: '9804', nombre: '+593 98 415 9804' },
  ],
  MANDARINA: [
    { phoneId: '1024077200794372', etiqueta: 'MANDI',    nombre: '+593 98 374 5757' },
    { phoneId: '118582961194601',  etiqueta: 'REPUBLIC', nombre: '+593 97 910 4167' },
  ],
}

/** ¿Es un phone_id de esta tienda? Lista blanca antes de que llegue a la base. */
export function canalValido(tienda, phoneId) {
  if (!phoneId) return true // null = todos los números
  return (CANALES[tienda] || []).some((c) => c.phoneId === String(phoneId))
}
