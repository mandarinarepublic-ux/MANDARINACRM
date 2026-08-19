// lib/bandeja-estado.js
//
// Distinguir "no hay trabajo" de "no pude cargar" y de "cargué a medias".
//
// La bandeja de Producción tenía DOS estados (cargando / vacío) y "vacío"
// significaba cinco cosas distintas. Un 401, un 500, una respuesta que no era
// JSON, una lectura truncada y un día tranquilo se veían todos como
// "✅ ¡Todo al día! · No hay ítems pendientes en tu área".
//
// Eso es lo que hizo que 21 pedidos invisibles pasaran 14 días sin que nadie los
// reportara: no había nada que reportar. Nadie miraba `res.ok`, y tres reintentos
// silenciosos convertían un fallo en una espera y después en ese mismo mensaje.
//
// Vive aparte del componente para poder probarlo, igual que
// lib/facturas-visibilidad.js.

/**
 * ¿La lectura trajo todo lo que había?
 *
 * Sin un `total` numérico devuelve false a propósito: no se puede AFIRMAR que una
 * lista está completa sin la evidencia de que lo está. Falla hacia el aviso, nunca
 * hacia el silencio.
 *
 * @param {{recibidas:number, total:number}} p
 */
export function esCompleta({ recibidas, total } = {}) {
  if (typeof total !== 'number' || !Number.isFinite(total)) return false
  if (typeof recibidas !== 'number' || !Number.isFinite(recibidas)) return false
  return recibidas >= total
}

/**
 * En qué estado está la bandeja.
 *
 * INVARIANTE: **nunca devuelve 'VACIO' si `ok` o `completo` son falsos.**
 * Si alguien rompe esa regla, tests/bandeja-estado.test.js se cae.
 *
 * @returns {'ERROR'|'INCOMPLETO'|'VACIO'|'LISTA'}
 */
export function estadoBandeja({ ok, completo, pedidos } = {}) {
  // `=== true` y no un valor "que se le parezca": `data.pedidos || []` era
  // exactamente eso, algo que parecía bueno y no lo era.
  if (ok !== true) return 'ERROR'
  if (completo !== true) return 'INCOMPLETO'
  return (Array.isArray(pedidos) && pedidos.length > 0) ? 'LISTA' : 'VACIO'
}
