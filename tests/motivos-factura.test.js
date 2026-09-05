// Por qué NO se emitió una factura que el cliente pidió.
//
// El 4-sep-2026 se desplegó el descarte guardando solo quién y cuándo. Ese mismo
// día se decidió agregar el motivo, con CERO descartes registrados todavía — así
// que no hay hueco histórico. Si se hubiera dejado para más adelante, todos los
// descartes de por medio habrían quedado sin causa y eso no se recupera.
//
// LA REGLA: la lista sirve para CONTAR, la nota para ENTENDER. Un motivo escrito
// a mano cada vez no se puede sumar, y al año la pregunta va a ser "¿cuántas
// perdemos por cada causa?".
//
// ⚠️ Import RELATIVO, no `@/`: `node --test` no entiende el alias.
import test from 'node:test'
import assert from 'node:assert'
import { MOTIVOS, esMotivoValido, etiquetaMotivo, validarDescarte } from '../lib/motivos-factura.js'

test('la lista tiene códigos únicos y todos con etiqueta', () => {
  const codigos = MOTIVOS.map(m => m.codigo)
  assert.equal(new Set(codigos).size, codigos.length, 'no puede haber códigos repetidos')
  for (const m of MOTIVOS) assert.ok(m.label && m.label.length > 3, `${m.codigo} sin etiqueta legible`)
})

test('reconoce los motivos de la lista, sin importar mayúsculas', () => {
  assert.equal(esMotivoValido('PEDIDO_ANULADO'), true)
  assert.equal(esMotivoValido('pedido_anulado'), true)
  assert.equal(esMotivoValido('NO_EXISTE'), false)
  assert.equal(esMotivoValido(''), false)
  assert.equal(esMotivoValido(null), false)
})

test('☠️ un motivo retirado de la lista se sigue mostrando, no se borra', () => {
  // Si algún día se quita un motivo, los descartes viejos que lo usaban tienen
  // que seguir diciendo algo. Devolver vacío es como en este sistema se han
  // escondido datos cuatro veces.
  assert.equal(etiquetaMotivo('MOTIVO_QUE_YA_NO_EXISTE'), 'MOTIVO_QUE_YA_NO_EXISTE')
  assert.equal(etiquetaMotivo('CLIENTE_DESISTIO'), 'El cliente ya no la quiere')
  assert.equal(etiquetaMotivo(''), '')
})

// ── validarDescarte ──────────────────────────────────────────────────────────

test('sin motivo no se puede descartar', () => {
  const r = validarDescarte({})
  assert.equal(r.ok, false)
  assert.match(r.error, /motivo/i)
})

test('un motivo inventado se rechaza', () => {
  // Si no, el navegador podría meter cualquier texto y la lista dejaría de poder
  // contarse, que es justo para lo que existe.
  assert.equal(validarDescarte({ motivo: 'PORQUE_SI' }).ok, false)
})

test('un motivo de la lista pasa, y se normaliza a mayúsculas', () => {
  const r = validarDescarte({ motivo: 'facturado_aparte' })
  assert.equal(r.ok, true)
  assert.equal(r.motivo, 'FACTURADO_APARTE')
  assert.equal(r.nota, '')
})

test('☠️ "Otro" SIN nota se rechaza', () => {
  // "Otro" es el caso que la lista no supo clasificar: la nota es lo único que
  // va a quedar de él. Sin ella el registro no dice nada.
  const r = validarDescarte({ motivo: 'OTRO' })
  assert.equal(r.ok, false)
  assert.match(r.error, /nota/i)
  assert.equal(validarDescarte({ motivo: 'OTRO', nota: 'se cambió por otro pedido' }).ok, true)
})

test('la nota se recorta y se limpia', () => {
  const r = validarDescarte({ motivo: 'OTRO', nota: '  ' + 'x'.repeat(400) + '  ' })
  assert.equal(r.ok, true)
  assert.equal(r.nota.length, 300)
})
