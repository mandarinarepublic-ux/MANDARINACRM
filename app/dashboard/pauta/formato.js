// Formateo compartido del tablero de pauta.
//
// Vive aparte de page.js a propósito: Next trata los archivos de página de forma
// especial (los envuelve, los divide en bundles), así que colgar utilidades de
// ahí funciona hasta que deja de funcionar.
//
// La regla que aplican los tres: `null` NO es cero. Si Meta no reportó el gasto
// de un anuncio se muestra "⚠ s/d", nunca "$0.00" — un anuncio sin dato y uno
// gratis son cosas distintas, y confundirlos pintaría un ROAS infinito.
export const dinero = (v) => (v == null ? '⚠ s/d' : `$${Number(v).toFixed(2)}`)
export const numero = (v) => (v == null ? '—' : Number(v).toLocaleString('es-EC'))
export const veces  = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}x`)
