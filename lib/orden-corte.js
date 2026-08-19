// lib/orden-corte.js
//
// Cómo se ordena la cola de Corte.
//
// El orden por defecto es el de siempre: FIFO por fecha de pedido, lo que lleva
// más esperando primero. Pero en el taller las dos fechas NO dan el mismo orden
// — el MAN-AND-5578 entró antes que el 5579 y vence cinco días después —, así
// que ENTREGA existe para cuando lo que aprieta es la fecha prometida.
//
// Vive fuera de la pantalla y con imports RELATIVOS porque `node --test` no
// entiende ni el alias `@/` ni el JSX de un `page.js`.

import { parseFecha } from './parseFecha.js'

export const ORDENES = {
  ANTIGUO: { label: '📥 Más antiguo primero', corto: 'Más antiguo' },
  NUEVO:   { label: '🆕 Más nuevo primero',   corto: 'Más nuevo' },
  ENTREGA: { label: '🚨 Entrega más próxima', corto: 'Por entrega' },
}

export const ORDEN_POR_DEFECTO = 'ANTIGUO'

// Un pedido sin fecha se va al final. Con `new Date(0)` se colaba arriba
// disfrazado del más viejo —o del más urgente— de todos.
const AL_FINAL = Number.POSITIVE_INFINITY

const ms = (valor) => {
  const f = parseFecha(valor)
  const t = f ? f.getTime() : NaN
  return Number.isFinite(t) ? t : AL_FINAL
}

const desempate = (a, b) => String(a?.PEDIDO_ID || '').localeCompare(String(b?.PEDIDO_ID || ''))

/**
 * Devuelve el comparador de la cola. Se aplica al pintar, no al cargar: el orden
 * lo elige quien mira, no el servidor.
 *
 * @param {'ANTIGUO'|'NUEVO'|'ENTREGA'} orden
 * @returns {(a:object, b:object) => number}
 */
export function comparadorCorte(orden) {
  if (orden === 'NUEVO') {
    return (a, b) => {
      const fa = ms(a?.FECHA_PEDIDO), fb = ms(b?.FECHA_PEDIDO)
      // Los sin fecha se quedan al final también acá: invertir el signo los
      // habría subido al primer puesto.
      if (fa === AL_FINAL || fb === AL_FINAL) {
        return fa === fb ? desempate(a, b) : (fa === AL_FINAL ? 1 : -1)
      }
      return fb - fa || desempate(b, a)
    }
  }
  const campo = orden === 'ENTREGA' ? 'FECHA_ENTREGA_PROMETIDA' : 'FECHA_PEDIDO'
  return (a, b) => {
    const fa = ms(a?.[campo]), fb = ms(b?.[campo])
    if (fa === fb) return desempate(a, b)
    return fa - fb
  }
}
