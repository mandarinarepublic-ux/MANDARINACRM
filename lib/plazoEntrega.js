// La regla de la fecha de entrega. Es UNA y no depende de las áreas:
//
//   · Si el vendedor no toca la fecha → 3 días laborables (lunes a viernes)
//     desde la creación del pedido.
//   · Si la toca → mínimo 4 días laborables.
//
// ☠️ Hasta el 23-oct-2026 había dos reglas que se contradecían: el formulario
// sugería 3 a 8 días según las áreas (una tabla escrita a mano en la pantalla) y
// el servidor guardaba lo que dijera la tabla `crm.dias_entrega` (todo en 3). El
// vendedor veía "5 días" en un bordado y el pedido quedaba con 3. Ni áreas, ni
// combinaciones, ni tablas editables: si la regla cambia, se cambia AQUÍ.
import { hoyEcuador, isoMasDias } from './parseFecha.js'

export const DIAS_ENTREGA = 3
export const DIAS_ENTREGA_MIN_ELEGIDA = 4

function esLaborable(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dia !== 0 && dia !== 6   // sin sábados ni domingos
}

/** Suma `dias` laborables a un día de Ecuador (YYYY-MM-DD). */
export function masDiasLaborables(desdeIso, dias) {
  let fecha = desdeIso
  let contados = 0
  while (contados < dias) {
    fecha = isoMasDias(fecha, 1)
    if (esLaborable(fecha)) contados++
  }
  return fecha
}

/** Días laborables desde `desdeIso` (excluido) hasta `hastaIso` (incluido). */
export function diasLaborablesEntre(desdeIso, hastaIso) {
  let fecha = desdeIso
  let n = 0
  while (fecha < hastaIso) {
    fecha = isoMasDias(fecha, 1)
    if (esLaborable(fecha)) n++
  }
  return n
}

/** Fecha automática: 3 días laborables desde `desdeIso` (por defecto, hoy en Ecuador). */
export function fechaEntregaPedido(desdeIso = hoyEcuador()) {
  return masDiasLaborables(desdeIso, DIAS_ENTREGA)
}

/** Lo más pronto que el vendedor puede escoger a mano: 4 días laborables. */
export function fechaMinimaElegida(desdeIso = hoyEcuador()) {
  return masDiasLaborables(desdeIso, DIAS_ENTREGA_MIN_ELEGIDA)
}

/**
 * Decide la fecha que se guarda. `pedida` es lo que mandó el formulario.
 *  - vacía → la automática (3 días).
 *  - igual a la automática o desde la mínima elegida (4 días) en adelante → esa.
 *  - cualquier otra anterior a la mínima elegida → error.
 * `dias` son los días laborables prometidos (3 si es la automática).
 * @returns {{ fecha: string, dias: number } | { error: string }}
 */
export function resolverFechaEntrega(pedida, desdeIso = hoyEcuador()) {
  const automatica = fechaEntregaPedido(desdeIso)
  const p = String(pedida || '').trim()
  if (!p || p === automatica) return { fecha: automatica, dias: DIAS_ENTREGA }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return { error: 'Fecha de entrega inválida' }
  const minima = fechaMinimaElegida(desdeIso)
  if (p < minima) {
    return { error: `La fecha de entrega no puede ser antes del ${minima} (mínimo ${DIAS_ENTREGA_MIN_ELEGIDA} días laborables), o deja la automática del ${automatica}` }
  }
  return { fecha: p, dias: diasLaborablesEntre(desdeIso, p) }
}
