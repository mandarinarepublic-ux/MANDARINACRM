// El aviso de pedidos nuevos.
//
// Comparaba PEDIDO_ID como TEXTO. `localeCompare` sobre `MAN-AND-5677` ordena
// primero por TIENDA, despues por VENDEDOR y solo al final por numero — encima
// como texto. Asi que "el mas reciente" era el del prefijo mas alto del
// abecedario, no el ultimo en entrar.
// Medido el 18-ago-2026: 509 de 531 pedidos nunca dispararon aviso. 96%.
import test from 'node:test'
import assert from 'node:assert'
import { detectarNuevos, esRelevante } from '../lib/pedidos-nuevos.js'

const p = (num, id, areas = ['ESTAMPADO']) => ({
  UNIQUE_ID: num, PEDIDO_ID: id, ESTADO_PEDIDO: 'EN_FABRICA',
  items: areas.map(AREA => ({ AREA })),
})

test('☠️ EL BUG: un pedido nuevo de prefijo "menor" ya no se pierde', () => {
  // Caso real del 19-ago: MAN-JAC-5677 estaba, y entro IND-YAW-5679.
  // Alfabeticamente "MAN-JAC-5677" > "IND-YAW-5679", asi que el maximo NO
  // cambiaba y no se avisaba de la venta nueva.
  const antes = [p(5677, 'MAN-JAC-5677')]
  const { ultimo } = detectarNuevos(antes, null)
  assert.strictEqual(ultimo, 5677)

  const ahora = [p(5677, 'MAN-JAC-5677'), p(5679, 'IND-YAW-5679')]
  const r = detectarNuevos(ahora, ultimo)
  assert.deepStrictEqual(r.nuevos.map(x => x.PEDIDO_ID), ['IND-YAW-5679'])

  // Y la prueba de que el orden viejo fallaba:
  assert.ok('MAN-JAC-5677'.localeCompare('IND-YAW-5679') > 0,
    'el texto pone el 5677 por delante del 5679 — de ahi salia el silencio')
})

test('el 999 no puede ir por encima del 1000', () => {
  const r = detectarNuevos([p(999, 'MAN-AND-999'), p(1000, 'MAN-AND-1000')], 998)
  assert.strictEqual(r.ultimo, 1000)
  assert.deepStrictEqual(r.nuevos.map(x => x.UNIQUE_ID), [1000, 999])
})

test('la primera carga NO avisa de nada', () => {
  // Si avisara, abrir la pantalla llenaria de toasts los pedidos que ya estaban.
  const r = detectarNuevos([p(5677, 'A'), p(5679, 'B')], null)
  assert.deepStrictEqual(r.nuevos, [])
  assert.strictEqual(r.ultimo, 5679)
})

test('avisa de TODOS los que entraron entre dos vueltas, no solo del ultimo', () => {
  const r = detectarNuevos([p(5678, 'A'), p(5679, 'B'), p(5680, 'C'), p(5677, 'D')], 5677)
  assert.deepStrictEqual(r.nuevos.map(x => x.UNIQUE_ID), [5680, 5679, 5678])
})

test('si el ultimo visto YA NO esta en la lista, no re-anuncia lo viejo', () => {
  // El pedido de referencia salio de fabrica o se cancelo. Con el `break` de
  // antes, el corte nunca ocurria y se re-anunciaba media bandeja.
  const r = detectarNuevos([p(5670, 'viejo'), p(5675, 'viejo2')], 5677)
  assert.deepStrictEqual(r.nuevos, [], 'ninguno es mayor que 5677')
})

test('sin pedidos, la referencia NO se pierde', () => {
  // Si se reseteara a null, la siguiente vuelta entraria como "primera carga" y
  // se tragaria en silencio todo lo que hubiera entrado.
  const r = detectarNuevos([], 5677)
  assert.deepStrictEqual(r.nuevos, [])
  assert.strictEqual(r.ultimo, 5677)
})

test('un pedido sin numero no rompe el orden ni se cuela', () => {
  const r = detectarNuevos([p(5679, 'B'), { PEDIDO_ID: 'raro', items: [] }], 5677)
  assert.deepStrictEqual(r.nuevos.map(x => x.PEDIDO_ID), ['B'])
  assert.strictEqual(r.ultimo, 5679)
})

test('ADMIN, CORTE y DISEÑO ven todo', () => {
  const pedido = p(1, 'X', ['BORDADO'])
  for (const rol of ['ADMIN', 'CORTE', 'DISEÑO']) {
    assert.ok(esRelevante(pedido, { rol }), `${rol} deberia verlo`)
  }
})

test('los de area solo reciben lo suyo', () => {
  const bordado = p(1, 'X', ['BORDADO'])
  const estampado = p(2, 'Y', ['ESTAMPADO'])
  assert.ok(esRelevante(bordado, { rol: 'BORDADO' }))
  assert.ok(!esRelevante(estampado, { rol: 'BORDADO' }))
  // Areas combinadas: "ESTAMPADO + BORDADO" le toca a los dos.
  const mixto = p(3, 'Z', ['ESTAMPADO + BORDADO'])
  assert.ok(esRelevante(mixto, { rol: 'BORDADO' }))
  assert.ok(esRelevante(mixto, { rol: 'ESTAMPADO' }))
})

test('un rol sin areas no recibe nada, en vez de recibirlo todo', () => {
  assert.ok(!esRelevante(p(1, 'X', ['BORDADO']), { rol: 'VENDEDOR' }))
  assert.ok(!esRelevante(p(1, 'X', ['BORDADO']), { rol: 'VENDEDOR', areas: [] }))
  assert.ok(esRelevante(p(1, 'X', ['BORDADO']), { rol: 'VENDEDOR', areas: ['BORDADO'] }))
})
