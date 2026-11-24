// La respuesta de la responsable es una lista blanca: arqueo a ciegas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { respuestaResponsable } from '../lib/caja.js'

const caja = { id: 1, nombre: 'Tienda', fondo_fijo: 20, tolerancia: 5, responsable_usuario_id: 'U1', inicio: '2026-11-01T10:00:00Z', cobros: [{ esperado: 99 }] }
const cierreContado = { id: 9, tipo: 'NORMAL', estado: 'CONTADO', esperado: 120, contado: 118, diferencia: -2, pagos: [], salidas: [], salida: null }
const salida = { id: 3, tipo: 'SALIDA', monto: 4, motivo: 'Cinta' }
const deposito = { id: 5, tipo: 'DEPOSITO', monto: 50, foto_url: null }
const depositoConFoto = { id: 6, tipo: 'DEPOSITO', monto: 30, foto_url: 'https://x/y.jpg' }
const cierres = [
  { id: 8, estado: 'CERRADO', salida: deposito },
  { id: 7, estado: 'CERRADO', salida: depositoConFoto },
  { id: 6, estado: 'CERRADO', salida: null },
]

test('las claves raíz son exactamente las del contrato', () => {
  const r = respuestaResponsable({ caja, necesitaArranque: false, pendienteCerrar: null, salidas: [salida], cierres, sinFoto: [deposito] })
  assert.deepEqual(Object.keys(r).sort(), ['caja', 'cierres', 'necesitaArranque', 'pendienteCerrar', 'salidasDelDia', 'sinFoto'])
  assert.deepEqual(r.caja, { id: 1, nombre: 'Tienda', fondo_fijo: 20, tolerancia: 5 })
  assert.equal(r.pendienteCerrar, null)
  assert.deepEqual(r.salidasDelDia, [salida])
})

test('sin conteo guardado no se cuela el esperado del período abierto', () => {
  const r = respuestaResponsable({ caja, necesitaArranque: false, pendienteCerrar: null, salidas: [], cierres: [], sinFoto: [] })
  assert.ok(!JSON.stringify(r).includes('esperado'))
})

test('con un cierre CONTADO sí muestra el esperado', () => {
  const r = respuestaResponsable({ caja, necesitaArranque: false, pendienteCerrar: cierreContado, salidas: [], cierres: [], sinFoto: [] })
  assert.ok(JSON.stringify(r).includes('esperado'))
  assert.equal(r.pendienteCerrar.id, 9)
})
