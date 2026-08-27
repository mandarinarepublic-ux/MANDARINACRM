// lib/estado-pantalla.js
//
// Guardar lo que la pantalla tenía puesto (filtros, paginación, scroll) para
// devolvérselo cuando vuelve.
//
// POR QUÉ EXISTE: todo eso vivía SOLO en `useState`, así que cualquier remonte
// lo borraba — salir a otro sitio en la misma pestaña y volver con atrás, el
// descarte de pestañas de Chrome, o el arranque en frío de la PWA cuando el
// celular mata la app. Quien filtraba Despacho y salía un momento volvía a la
// lista entera y al tope del scroll.
//
// ☠️ CADUCA A PROPÓSITO. Un filtro de fecha de ayer que reaparece solo es de la
// familia de bugs que más ha costado en este repo: la pantalla no miente, pero
// esconde. Doce horas cubren una jornada completa y no llegan al día siguiente.
// Además, quien restaura filtros DEBE avisarlo en pantalla (ver `hayFiltro`).

export const VIGENCIA_MS = 12 * 60 * 60 * 1000
const PREFIJO = 'mp_estado_'

/** El almacén real del navegador, o null donde no hay (SSR, pruebas). */
export function almacenLocal() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch { return null }   // Safari en privado lanza al TOCAR localStorage
}

/**
 * Lo guardado para esa pantalla, o null si no hay, está vencido o no se entiende.
 * Nunca lanza: un estado corrupto no puede tumbar una bandeja.
 */
export function leer(almacen, pantalla, ahora = Date.now()) {
  if (!almacen) return null
  try {
    const crudo = almacen.getItem(PREFIJO + pantalla)
    if (!crudo) return null
    const sobre = JSON.parse(crudo)
    // Sin sello de tiempo no se sabe de cuándo es → se descarta, no se adivina.
    if (!sobre || typeof sobre !== 'object' || typeof sobre.t !== 'number') return null
    if (ahora - sobre.t > VIGENCIA_MS) { limpiar(almacen, pantalla); return null }
    if (!sobre.v || typeof sobre.v !== 'object') return null
    return sobre.v
  } catch { return null }
}

/** Guarda con sello de tiempo. Un fallo de cuota no puede romper la pantalla. */
export function guardar(almacen, pantalla, valor, ahora = Date.now()) {
  if (!almacen) return false
  try {
    almacen.setItem(PREFIJO + pantalla, JSON.stringify({ t: ahora, v: valor }))
    return true
  } catch { return false }
}

export function limpiar(almacen, pantalla) {
  if (!almacen) return
  try { almacen.removeItem(PREFIJO + pantalla) } catch {}
}

/**
 * ¿Queda algún filtro puesto? Se compara contra los valores POR DEFECTO de la
 * pantalla, no contra una lista de nombres: si mañana alguien agrega un filtro
 * nuevo, entra solo. Una lista blanca lo habría dejado fuera en silencio.
 *
 * `salvo` son las claves que NO son filtros (scroll, paginación, expandidos):
 * restaurarlas no esconde nada, así que no deben encender el aviso.
 */
export function hayFiltro(valores, porDefecto, salvo = []) {
  if (!valores || !porDefecto) return false
  return Object.keys(porDefecto).some((k) => {
    if (salvo.includes(k)) return false
    return JSON.stringify(valores[k]) !== JSON.stringify(porDefecto[k])
  })
}

/**
 * Qué filtros están puestos ahora mismo, listos para pintar como chips.
 *
 * Misma regla que `hayFiltro` —distinto del valor por defecto— y por el mismo
 * motivo: un filtro nuevo aparece como chip solo, sin que nadie tenga que
 * acordarse de añadirlo a una lista. Una lista blanca lo dejaría fuera en
 * silencio, y un filtro que no se ve es un filtro que engaña.
 *
 * @param {object} etiquetas  cómo se lee cada filtro: {clave: (valor) => texto}.
 *   Si falta una, se pinta el valor crudo: feo, pero nunca invisible.
 * @returns {{clave:string, valor:any, etiqueta:string}[]}
 */
export function filtrosActivos(valores, porDefecto, salvo = [], etiquetas = {}) {
  if (!valores || !porDefecto) return []
  return Object.keys(porDefecto)
    .filter((k) => !salvo.includes(k))
    .filter((k) => JSON.stringify(valores[k]) !== JSON.stringify(porDefecto[k]))
    .map((k) => {
      const valor = valores[k]
      let etiqueta
      try { etiqueta = etiquetas[k]?.(valor) } catch { etiqueta = undefined }
      return { clave: k, valor, etiqueta: etiqueta || String(valor) }
    })
}
