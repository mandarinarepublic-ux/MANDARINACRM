// lib/consulta-guias.js
//
// 🚚 Consultar guías (20-nov-2026): regla PURA de la búsqueda, sin base, para
// poder probarla. La consulta a Supabase vive en lib/db/consulta-guias.js.
//
// Viene de la búsqueda de guías del inbox de MANDI (wa-inbox-next,
// lib/guias-servientrega.js). Se copió, no se comparte: son repos distintos.
// Las trampas que ya se pagaron allá y que esto evita:
//   · `ilike` con las vocales cambiadas por `_`: "Ana" → `%_n_%` coincidía con
//     1.179 de 1.577 clientes y el límite dejaba fuera a la Ana real.
//   · La ñ: "Muñoz" se buscaba como "munoz" y no coincidía con la ñ guardada.
//   · "letras-" se tomaba como número de pedido: una dirección "Milagro-Guayas"
//     no encontraba nada.
// La base NO tiene `unaccent`: por eso una expresión regular (`imatch`).

/** Quita tildes y diéresis; la ñ queda como n (se compara igual en los dos lados). */
export const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')

const VARIANTES = { a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöô]', u: '[uúùüû]', n: '[nñ]' }

/**
 * Expresión regular POSIX (para `imatch` de PostgREST) que no distingue tildes
 * ni la ñ: "ambar" → "[aáàäâ]mb[aáàäâ]r". `palabraEntera` acota a palabras
 * completas ("Ana" no trae a "Mariana").
 */
export function patronSinTildes(palabra, { palabraEntera = false } = {}) {
  const r = sinAcentos(palabra).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/[aeioun]/g, (c) => VARIANTES[c])
  return palabraEntera ? `\\m${r}\\M` : r
}

/** Palabras de un texto, sin tildes, en minúscula. */
export const palabras = (s) => sinAcentos(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Lo que vale la pena buscar de un texto: hasta 3 palabras de 3+ letras, las más largas primero. */
export function palabrasParaBuscar(texto) {
  return [...new Set(palabras(texto).filter((w) => w.length >= 3 && !/^\d+$/.test(w)))]
    .sort((a, b) => b.length - a.length).slice(0, 3)
}

/**
 * ¿Lo escrito parece un NÚMERO DE GUÍA? Las de Servientrega son 10 dígitos que
 * empiezan con 90 (medido 20-nov-2026); se acepta un pedazo de 4+ dígitos.
 * No: un celular (09[5-9]…, 9[5-9]…, 593…), una cédula de 10 dígitos que no
 * empieza con 90, ni texto.
 */
export function pareceNumeroDeGuia(q) {
  const t = String(q ?? '').trim()
  if (!/^[\d\s-]+$/.test(t)) return false
  const d = t.replace(/\D/g, '')
  if (d.length < 4) return false
  if (/^593/.test(d) || /^0?9[5-9]\d{7}$/.test(d)) return false
  if (d.length === 10 && !d.startsWith('90')) return false
  return true
}

/**
 * Qué escribió la persona:
 *   · `pedido`  — MAN-AND-6314, IND-XAV-12, o sin la marca (AND-6314).
 *   · `numero`  — solo dígitos: guía, celular, cédula o el número del pedido.
 *   · `texto`   — nombre, dirección o ciudad.
 */
export function tipoDeBusqueda(q) {
  const t = String(q ?? '').trim()
  if (!t) return { tipo: 'vacio', valor: '' }
  if (/^(MAN|IND|YAW)-/i.test(t) || /^[a-z]{3}-\d+$/i.test(t)) return { tipo: 'pedido', valor: t.toUpperCase() }
  const d = t.replace(/\D/g, '')
  if (d.length >= 4 && /^[\d\s+-]+$/.test(t)) return { tipo: 'numero', valor: d }
  return { tipo: 'texto', valor: t }
}

/** Los 9 últimos dígitos de un celular: 0986979499 y 593986979499 son el mismo. */
export const cola9 = (s) => String(s ?? '').replace(/\D/g, '').slice(-9)

/**
 * ¿Por qué aparece este cliente? Puntos para ordenar y RAZONES para mostrar:
 * quien consulta tiene que ver por qué le sale cada uno.
 */
export function puntuarCliente(cli, { numero = '', texto = '' } = {}) {
  let puntos = 0
  const razones = []
  if (numero) {
    const ced = String(cli?.cedula ?? '').replace(/\D/g, '')
    if (numero.length >= 6 && ced && ced.startsWith(numero)) { puntos += 100; razones.push('🪪 cédula') }
    if (numero.length >= 7 && cola9(cli?.celular).endsWith(cola9(numero))) { puntos += 60; razones.push('📱 celular') }
  }
  const buscadas = palabrasParaBuscar(texto)
  if (buscadas.length) {
    const nom = palabras(cli?.nombre)
    // Una palabra corta ("ana") cuenta solo entera; una larga, también como pedazo.
    const enNombre = buscadas.filter((w) => nom.some((x) => x === w || (w.length >= 4 && x.includes(w)))).length
    if (enNombre) { puntos += 12 * enNombre; razones.push(`👤 nombre ${enNombre}/${buscadas.length}`) }
    const dir = palabras(`${cli?.direccion ?? ''} ${cli?.ciudad ?? ''}`)
    const enDir = buscadas.filter((w) => w.length >= 4 && dir.some((x) => x.includes(w))).length
    if (enDir) { puntos += 8 * enDir; razones.push('📍 dirección') }
  }
  return { puntos, razones }
}

/** Una foto solo se enlaza si es http(s): va a un href (nada de `javascript:`). */
export const fotoSegura = (u) => (/^https?:\/\//i.test(String(u ?? '')) ? String(u) : '')

/** Orden: más pruebas primero; a igualdad, el pedido más nuevo. */
export function ordenarResultados(lista) {
  return [...(lista ?? [])].sort((a, b) =>
    (b.puntos - a.puntos) || String(b.fecha_pedido ?? '').localeCompare(String(a.fecha_pedido ?? '')))
}
