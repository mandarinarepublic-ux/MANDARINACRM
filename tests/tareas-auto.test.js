import test from 'node:test'
import assert from 'node:assert'
import { diasDeTarea, resumenTarea, peorEstado } from '../lib/tareas-auto.js'

const tarea = { id: 'trig_A', creada: '2026-10-10T15:00:00Z', veces_por_dia: 1, activa: true }
const c = (inicio, estado = 'ok') => ({ tarea_id: 'trig_A', inicio, estado, resumen: 'x' })

test('un cuadrito por día, del más viejo a hoy', () => {
  const d = diasDeTarea({ tarea, corridas: [], dias: 5, hoy: '2026-10-18' })
  assert.deepEqual(d.map(x => x.dia), ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
})

test('el día va en hora de ECUADOR: una corrida a las 02:00 UTC es del día anterior', () => {
  const d = diasDeTarea({ tarea, corridas: [c('2026-10-17T02:00:00Z')], dias: 3, hoy: '2026-10-18' })
  assert.equal(d.find(x => x.dia === '2026-10-16').estado, 'ok')
  assert.equal(d.find(x => x.dia === '2026-10-17').estado, 'falto')
})

test('un día cerrado sin corrida es "falto"; hoy sin corrida es "pendiente"', () => {
  const d = diasDeTarea({ tarea, corridas: [c('2026-10-16T11:00:00Z')], dias: 3, hoy: '2026-10-18' })
  assert.deepEqual(d.map(x => x.estado), ['ok', 'falto', 'pendiente'])
})

test('antes de que existiera la tarea no cuenta', () => {
  const d = diasDeTarea({ tarea, corridas: [], dias: 10, hoy: '2026-10-18' })
  assert.equal(d.find(x => x.dia === '2026-10-09').estado, 'antes')
  assert.equal(d.find(x => x.dia === '2026-10-10').estado, 'falto')
})

test('gana el peor estado del día', () => {
  const d = diasDeTarea({ tarea: { ...tarea, veces_por_dia: 2 }, corridas: [c('2026-10-17T12:00:00Z'), c('2026-10-17T20:00:00Z', 'error')], dias: 2, hoy: '2026-10-18' })
  assert.equal(d[0].estado, 'error')
  assert.equal(d[0].corridas.length, 2)
})

test('le tocaban 2 corridas y hubo 1 → incompleta (pero hoy todavía no)', () => {
  const t2 = { ...tarea, veces_por_dia: 2 }
  const d = diasDeTarea({ tarea: t2, corridas: [c('2026-10-17T12:00:00Z'), c('2026-10-18T12:00:00Z')], dias: 2, hoy: '2026-10-18' })
  assert.equal(d[0].estado, 'incompleta')
  assert.equal(d[1].estado, 'ok')
})

test('un estado desconocido cuenta como error (falla cerrado)', () => {
  assert.equal(peorEstado([{ estado: 'ok' }, { estado: 'raro' }]), 'error')
  assert.equal(peorEstado([]), 'ok')
})

test('corridas de OTRA tarea no se mezclan', () => {
  const d = diasDeTarea({ tarea, corridas: [{ tarea_id: 'trig_B', inicio: '2026-10-17T12:00:00Z', estado: 'error' }], dias: 2, hoy: '2026-10-18' })
  assert.equal(d[0].estado, 'falto')
})

test('resumen: días contables, bien, con problema, faltaron y la última corrida', () => {
  const corr = [c('2026-10-15T12:00:00Z'), c('2026-10-16T12:00:00Z', 'aviso'), c('2026-10-18T12:00:00Z')]
  const d = diasDeTarea({ tarea, corridas: corr, dias: 5, hoy: '2026-10-18' })
  const r = resumenTarea(d, corr)
  // 14 falto · 15 ok · 16 aviso · 17 falto · 18 ok (hoy ya corrió, así que cuenta)
  assert.equal(r.dias, 5)
  assert.equal(r.bien, 2)
  assert.equal(r.conProblema, 1)
  assert.equal(r.faltaron, 2)
  assert.equal(r.ultima.inicio, '2026-10-18T12:00:00Z')
})
