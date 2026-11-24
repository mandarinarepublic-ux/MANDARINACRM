// Reglas puras de la caja de la tienda: todo en centavos enteros.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aCentavos, aDolares, validarMonto, calcularCierre, calcularArranque,
  validarSalidaExcedente, aperturaSiguiente, seleccionarCobros, pagosCambiados,
  textoDiferencia,
} from '../lib/caja.js'

test('aCentavos y aDolares convierten sin errores de coma flotante', () => {
  assert.equal(aCentavos('35.98'), 3598)
  assert.equal(aCentavos(35.98), 3598)
  assert.equal(aCentavos(0.29), 29)
  assert.equal(aDolares(3598), 35.98)
})

test('validarMonto', () => {
  assert.deepEqual(validarMonto('55,98'), { ok: true, centavos: 5598 })
  assert.deepEqual(validarMonto('30.75'), { ok: true, centavos: 3075 })
  for (const malo of ['-3', 'abc', '', '   ', null, undefined, '0']) {
    const r = validarMonto(malo)
    assert.equal(r.ok, false, String(malo))
    assert.equal(typeof r.error, 'string')
  }
  assert.deepEqual(validarMonto('0', { permitirCero: true }), { ok: true, centavos: 0 })
  assert.equal(validarMonto('-3', { permitirCero: true }).ok, false)
})

test('cierre que cuadra', () => {
  const r = calcularCierre({ aperturaC: 2000, cobrosC: [3598], salidasC: [], contadoC: 5598, fondoFijoC: 2000, toleranciaC: 500 })
  assert.equal(r.esperadoC, 5598)
  assert.equal(r.diferenciaC, 0)
  assert.equal(r.estado, 'CUADRA')
  assert.equal(r.requiereMotivo, false)
  assert.equal(r.excedenteC, 3598)
})

test('el martes del ejemplo: falta de 8,00 es FUERA', () => {
  const r = calcularCierre({ aperturaC: 2000, cobrosC: [1800, 1500, 1900], salidasC: [300], contadoC: 6100, fondoFijoC: 2000, toleranciaC: 500 })
  assert.equal(r.cobrosEfectivoC, 5200)
  assert.equal(r.salidasC, 300)
  assert.equal(r.esperadoC, 6900)
  assert.equal(r.diferenciaC, -800)
  assert.equal(r.estado, 'FUERA')
  assert.equal(r.requiereMotivo, true)
  assert.equal(r.excedenteC, 4100)
})

test('borde de la tolerancia: 5,00 exacto es DENTRO, 5,01 es FUERA', () => {
  const base = { aperturaC: 2000, cobrosC: [], salidasC: [], fondoFijoC: 2000, toleranciaC: 500 }
  const a = calcularCierre({ ...base, contadoC: 1500 })
  assert.equal(a.diferenciaC, -500)
  assert.equal(a.estado, 'DENTRO')
  assert.equal(a.requiereMotivo, false)
  const b = calcularCierre({ ...base, contadoC: 2500 })
  assert.equal(b.estado, 'DENTRO')
  const c = calcularCierre({ ...base, contadoC: 2501 })
  assert.equal(c.estado, 'FUERA')
  assert.equal(c.requiereMotivo, true)
})

test('contó menos que el fondo: excedente 0, no se puede sacar, apertura = contado', () => {
  const r = calcularCierre({ aperturaC: 2000, cobrosC: [], salidasC: [], contadoC: 1500, fondoFijoC: 2000, toleranciaC: 500 })
  assert.equal(r.excedenteC, 0)
  assert.equal(typeof validarSalidaExcedente({ montoC: 100, excedenteC: 0 }), 'string')
  assert.equal(aperturaSiguiente({ contadoC: 1500, salidaC: 0, reposicionesC: [500] }), 2000)
  assert.equal(aperturaSiguiente({ contadoC: 5598, salidaC: 3598, reposicionesC: [] }), 2000)
})

test('calcularArranque y validarSalidaExcedente', () => {
  assert.deepEqual(calcularArranque({ contadoC: 5000, fondoFijoC: 2000 }), { excedenteC: 3000 })
  assert.deepEqual(calcularArranque({ contadoC: 1000, fondoFijoC: 2000 }), { excedenteC: 0 })
  assert.equal(validarSalidaExcedente({ montoC: 3000, excedenteC: 3000 }), null)
  assert.equal(validarSalidaExcedente({ montoC: 0, excedenteC: 3000 }), null)
  assert.equal(typeof validarSalidaExcedente({ montoC: 3001, excedenteC: 3000 }), 'string')
  assert.equal(typeof validarSalidaExcedente({ montoC: -1, excedenteC: 3000 }), 'string')
})

test('seleccionarCobros', () => {
  const inicio = '2026-11-23T15:00:00.000Z'
  const base = { tipo: 'EFECTIVO', estado: 'PAGADO', vendedor_id: 'uuid-007', monto: '35.98' }
  const pagos = [
    { ...base, pago_id: 'ok1', fecha: '2026-11-23T22:11:52.967+00:00' },
    { ...base, pago_id: 'tarde', fecha: '2026-11-24T01:58:00+00:00' },
    { ...base, pago_id: 'transf', tipo: 'TRANSFERENCIA', fecha: '2026-11-23T22:00:00Z' },
    { ...base, pago_id: 'pend', estado: 'PENDIENTE', fecha: '2026-11-23T22:00:00Z' },
    { ...base, pago_id: 'otro', vendedor_id: 'uuid-999', fecha: '2026-11-23T22:00:00Z' },
    { ...base, pago_id: 'viejo', fecha: '2026-11-23T14:59:59Z' },
    { ...base, pago_id: 'ya', fecha: '2026-11-23T22:00:00Z' },
  ]
  const r = seleccionarCobros(pagos, { responsableId: 'uuid-007', inicioIso: inicio, yaEnCierre: new Set(['ya']) })
  assert.deepEqual(r.map(p => p.pago_id), ['ok1', 'tarde'])
})

test('seleccionarCobros compara instantes, no texto', () => {
  // mismo instante escrito con otro huso: 10:00-05:00 = 15:00Z
  const p = { pago_id: 'x', tipo: 'EFECTIVO', estado: 'PAGADO', vendedor_id: 'v', monto: 1, fecha: '2026-11-23T10:00:00-05:00' }
  const r = seleccionarCobros([p], { responsableId: 'v', inicioIso: '2026-11-23T15:00:00Z', yaEnCierre: new Set() })
  assert.equal(r.length, 1)
})

test('pagosCambiados', () => {
  const snap = [{ pago_id: 'a', monto: 20 }, { pago_id: 'b', monto: 20 }, { pago_id: 'c', monto: 20 }, { pago_id: 'd', monto: '20.00' }, { pago_id: 'e', monto: 20 }]
  const actuales = new Map([
    ['b', { monto: '15.00', tipo: 'EFECTIVO', estado: 'PAGADO' }],
    ['c', { monto: 20, tipo: 'TRANSFERENCIA', estado: 'PAGADO' }],
    ['d', { monto: 20, tipo: 'EFECTIVO', estado: 'PAGADO' }],
    ['e', { monto: 20, tipo: 'EFECTIVO', estado: 'RECHAZADO' }],
  ])
  assert.deepEqual(pagosCambiados(snap, actuales), [
    { pago_id: 'a', motivo: 'BORRADO' },
    { pago_id: 'b', motivo: 'MONTO' },
    { pago_id: 'c', motivo: 'YA_NO_EFECTIVO' },
    { pago_id: 'e', motivo: 'YA_NO_EFECTIVO' },
  ])
  assert.deepEqual(pagosCambiados([{ pago_id: 'd', monto: 20 }], actuales), [])
})

test('textoDiferencia', () => {
  assert.equal(textoDiferencia(-800), 'Falta $8,00')
  assert.equal(textoDiferencia(150), 'Sobra $1,50')
  assert.equal(textoDiferencia(0), 'Cuadra')
})
