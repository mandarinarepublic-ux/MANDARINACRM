// lib/tareas-auto.js — el calendario de /dashboard/tareas (solo ADMIN). Puro, sin red.
//
// Las tareas automáticas son rutinas de Claude en la nube: corren solas aunque la
// compu esté apagada y al terminar dejan una línea en crm.tareas_auto_corridas.
// El CRM no puede leer las rutinas de Claude: solo ve lo que ELLAS reportan.
//
// ☠️ Por eso un día SIN línea no es "no pasó nada": es que la tarea no corrió (o
// corrió y no pudo reportar). Se pinta, no se esconde — igual que el panel de
// conexiones pinta en rojo una luz que dejó de actualizarse.

import { fechaISOEcuador, hoyEcuador, isoMasDias } from './parseFecha.js'

const PESO = { ok: 0, aviso: 1, error: 2 }

/** El peor estado de una lista de corridas ('ok' | 'aviso' | 'error'). */
export function peorEstado(corridas) {
  let peor = 'ok'
  for (const c of corridas || []) if ((PESO[c?.estado] ?? 2) > PESO[peor]) peor = PESO[c?.estado] === undefined ? 'error' : c.estado
  return peor
}

/**
 * Un cuadrito por día, del más viejo al de hoy (días en hora de Ecuador).
 * estado de cada día:
 *   'ok' | 'aviso' | 'error' → corrió (el peor de sus corridas)
 *   'incompleta'  → corrió menos veces de las que le tocaban (día ya cerrado)
 *   'falto'       → día ya cerrado, le tocaba y no hay ninguna corrida
 *   'pendiente'   → HOY, todavía sin corrida (puede que aún no sea su hora)
 *   'antes'       → antes de que existiera la tarea (o estaba pausada): no cuenta
 */
export function diasDeTarea({ tarea, corridas, dias = 30, hoy = hoyEcuador() }) {
  const porDia = new Map()
  for (const c of corridas || []) {
    if (c?.tarea_id && c.tarea_id !== tarea?.id) continue
    const d = fechaISOEcuador(c.inicio)
    if (!d) continue
    if (!porDia.has(d)) porDia.set(d, [])
    porDia.get(d).push(c)
  }
  const nace = tarea?.creada ? fechaISOEcuador(tarea.creada) : ''
  const veces = Math.max(1, Number(tarea?.veces_por_dia) || 1)
  const out = []
  for (let i = dias - 1; i >= 0; i--) {
    const dia = isoMasDias(hoy, -i)
    const suyas = (porDia.get(dia) || []).slice().sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))
    let estado
    if (suyas.length) {
      estado = peorEstado(suyas)
      if (estado === 'ok' && dia < hoy && suyas.length < veces) estado = 'incompleta'
    } else if (nace && dia < nace) estado = 'antes'
    else if (dia === hoy) estado = 'pendiente'
    else if (tarea?.activa === false) estado = 'antes'
    else estado = 'falto'
    out.push({ dia, estado, corridas: suyas })
  }
  return out
}

/** Números para la cabecera de cada tarea. */
export function resumenTarea(diasTarea, corridas) {
  const contables = diasTarea.filter(d => d.estado !== 'antes' && d.estado !== 'pendiente')
  const bien = contables.filter(d => d.estado === 'ok').length
  const ultima = (corridas || []).slice().sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))[0] || null
  return {
    dias: contables.length,
    bien,
    conProblema: contables.filter(d => d.estado === 'aviso' || d.estado === 'error' || d.estado === 'incompleta').length,
    faltaron: contables.filter(d => d.estado === 'falto').length,
    ultima,
  }
}
