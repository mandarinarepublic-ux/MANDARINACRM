// Montos escritos a mano: el vendedor puede usar punto O coma para los
// centavos ("12.50" o "12,50"). Los <input type="number"> no lo permitían:
// con la coma el navegador devolvía "" y con el punto el valor se reescribía
// a medio teclear ("12." → 12), así que no había forma de poner centavos.
//
// Regla: UN solo separador y es siempre el de los centavos (máx. 2 cifras).
// No se aceptan separadores de miles: "1.250" sería ambiguo.

/** Limpia lo tecleado: solo cifras y un separador, máx. 2 decimales. Conserva el separador que eligió. */
export function limpiarDecimal(texto) {
  let s = String(texto ?? '').replace(/[^\d.,]/g, '')
  const i = s.search(/[.,]/)
  if (i === -1) return s
  const entero = s.slice(0, i)
  const dec = s.slice(i + 1).replace(/[.,]/g, '').slice(0, 2)
  return `${entero}${s[i]}${dec}`
}

/** Texto con punto como separador ("12,5" → "12.5"), apto para parseFloat y para guardar. */
export function normalizarDecimal(texto) {
  return limpiarDecimal(texto).replace(',', '.')
}

/** Número del texto (0 si está vacío o no es número). */
export function leerDecimal(texto) {
  const n = parseFloat(normalizarDecimal(texto))
  return Number.isFinite(n) ? n : 0
}
