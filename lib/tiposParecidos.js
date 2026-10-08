// lib/tiposParecidos.js — ¿El tipo de prenda que se va a crear ya existe mal o
// bien escrito? Regla pura, sin dependencias, para probarla sola.
//
// ☠️ POR QUÉ EXISTE (7-oct-2026): el catálogo llegó a 346 tipos activos, con
// 10 versiones de HOODIE PREMIUM (HODIE PREMIUM con 37 usos en 60 días,
// HOODIE PEEMIUM, HOODIEPREMIU…). Antes de crear uno, se avisa del parecido.

/** Mayúsculas, sin tildes, sin signos y sin espacios: "Hoodie  Prémium." → "HOODIEPREMIUM". */
export function claveTipo(s) {
  return String(s ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9Ñ]/g, '')
}

/** Distancia de edición (Levenshtein), cortando apenas pasa de `tope`. */
export function distancia(a, b, tope = 3) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    let minFila = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      fila.push(v)
      if (v < minFila) minFila = v
    }
    if (minFila > tope) return tope + 1
    prev = fila
  }
  return prev[b.length]
}

/**
 * Los tipos existentes que se parecen a `nuevo`, del más al menos parecido.
 * Cuenta como parecido: igual sin espacios/tildes/signos, o a 1-2 letras de
 * distancia (en nombres de más de 5 letras, para no emparejar "TOP" con "POLO").
 */
export function tiposParecidos(nuevo, existentes = [], max = 3) {
  const k = claveTipo(nuevo)
  if (!k) return []
  const tope = k.length > 10 ? 2 : 1
  return (existentes || [])
    .map((n) => ({ n, d: distancia(k, claveTipo(n), tope) }))
    .filter(({ n, d }) => d <= tope && (d === 0 || k.length > 5) && claveTipo(n) !== '')
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ n }) => n)
}
