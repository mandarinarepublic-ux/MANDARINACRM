// Distinguir "no hay trabajo" de "no pude cargar" y de "cargué a medias".
//
// La bandeja de Producción pintaba "✅ ¡Todo al día! · No hay ítems pendientes en
// tu área" en los tres casos. Por eso 21 pedidos invisibles pasaron 14 días sin que
// nadie lo reportara: no había nada que reportar, la pantalla decía que todo
// estaba bien. Un 401, un 500, una lectura truncada y un día tranquilo se veían
// exactamente igual.
//
// ⚠️ Import RELATIVO, no `@/`: ver la nota en tests/areas-usuario.test.js.
import test from 'node:test'
import assert from 'node:assert'
import { esCompleta, estadoBandeja } from '../lib/bandeja-estado.js'

// ── esCompleta ────────────────────────────────────────────────────────────────

test('si llegaron todas, la lectura es completa', () => {
  assert.equal(esCompleta({ recibidas: 63, total: 63 }), true)
})

test('si faltan filas, NO es completa', () => {
  // El caso real: PostgREST devolvio 1000 de 1261 y `error` vino null.
  assert.equal(esCompleta({ recibidas: 1000, total: 1261 }), false)
})

test('ante la duda, incompleta', () => {
  // Sin total no se puede AFIRMAR que la lista este completa. Falla hacia el
  // aviso, nunca hacia el silencio.
  assert.equal(esCompleta({ recibidas: 63, total: null }), false)
  assert.equal(esCompleta({ recibidas: 63, total: undefined }), false)
  assert.equal(esCompleta({ total: 63 }), false)
  assert.equal(esCompleta({}), false)
  assert.equal(esCompleta(), false)
})

test('un total que no es numero no vale como evidencia', () => {
  assert.equal(esCompleta({ recibidas: 63, total: '63' }), false)
  assert.equal(esCompleta({ recibidas: 63, total: NaN }), false)
})

test('recibir MAS de lo esperado no oculta nada', () => {
  assert.equal(esCompleta({ recibidas: 64, total: 63 }), true)
})

test('cero de cero es completa: no hay trabajo y lo sabemos', () => {
  assert.equal(esCompleta({ recibidas: 0, total: 0 }), true)
})

// ── estadoBandeja: LA invariante ──────────────────────────────────────────────

test('NUNCA dice VACIO si la carga fallo', () => {
  assert.equal(estadoBandeja({ ok: false, completo: true, pedidos: [] }), 'ERROR')
  assert.equal(estadoBandeja({ ok: false, completo: false, pedidos: [] }), 'ERROR')
})

test('NUNCA dice VACIO si la lectura vino incompleta', () => {
  assert.equal(estadoBandeja({ ok: true, completo: false, pedidos: [] }), 'INCOMPLETO')
})

test('INCOMPLETO manda aunque hayan llegado pedidos', () => {
  assert.equal(estadoBandeja({ ok: true, completo: false, pedidos: [{}, {}] }), 'INCOMPLETO')
})

test('VACIO solo con carga buena, completa y sin pedidos', () => {
  assert.equal(estadoBandeja({ ok: true, completo: true, pedidos: [] }), 'VACIO')
})

test('con pedidos y todo bien, LISTA', () => {
  assert.equal(estadoBandeja({ ok: true, completo: true, pedidos: [{}] }), 'LISTA')
})

test('ok tiene que ser true de verdad, no algo que se le parezca', () => {
  // `data.pedidos || []` era justo esto: un valor que "parecia" bueno.
  assert.equal(estadoBandeja({ ok: 1, completo: true, pedidos: [] }), 'ERROR')
  assert.equal(estadoBandeja({ ok: 'si', completo: true, pedidos: [] }), 'ERROR')
})

test('sin argumentos no revienta y no miente', () => {
  assert.equal(estadoBandeja({}), 'ERROR')
  assert.equal(estadoBandeja(), 'ERROR')
})

test('pedidos que no es arreglo no se confunde con "hay trabajo"', () => {
  assert.equal(estadoBandeja({ ok: true, completo: true, pedidos: null }), 'VACIO')
  assert.equal(estadoBandeja({ ok: true, completo: true }), 'VACIO')
})
