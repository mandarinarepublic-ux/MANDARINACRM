// tests/cotizacion-opciones.test.js
//
// opcionesDe() es el UNICO sitio que conoce las dos formas de una cotizacion:
// la vieja (un `productos` en la raiz) y la nueva (`opciones`). Si esta funcion
// se equivoca, se equivoca el modulo entero.
import test from 'node:test'
import assert from 'node:assert'
import { nuevaOpcion, opcionesDe, nuevaCotizacion } from '../lib/cotizacion.js'

test('una cotizacion VIEJA produce una sola opcion implicita', () => {
  const c = { productos: [{ id: 'p1', precio: 10 }], entrega_dias: 20 }
  const ops = opcionesDe(c)
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].productos, c.productos)
  assert.equal(ops[0].entrega_dias, 20, 'hereda los dias de la raiz')
  assert.equal(ops[0].nombre, '', 'sin nombre: el documento no debe mostrar encabezado')
})

test('☠️ con `opciones`, la RAIZ se ignora por completo', () => {
  // Escribir en los dos sitios es como terminan diciendo cosas distintas.
  const c = {
    productos: [{ id: 'viejo', precio: 999 }],
    entrega_dias: 99,
    opciones: [{ id: 'a', nombre: 'A', entrega_dias: 10, productos: [{ id: 'p1', precio: 10 }] }],
  }
  const ops = opcionesDe(c)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].nombre, 'A')
  assert.equal(ops[0].entrega_dias, 10)
  assert.equal(ops[0].productos[0].id, 'p1', 'no se colo el producto de la raiz')
})

test('devuelve las varias opciones en su orden', () => {
  const c = { opciones: [
    { id: 'a', nombre: 'A', entrega_dias: 15, productos: [] },
    { id: 'b', nombre: 'B', entrega_dias: 20, productos: [] },
  ] }
  assert.deepEqual(opcionesDe(c).map((o) => o.nombre), ['A', 'B'])
})

test('nunca devuelve una lista vacia', () => {
  // Toda pantalla asume que hay al menos una opcion que pintar.
  for (const c of [null, undefined, {}, { opciones: [] }, { opciones: null }, { productos: [] }]) {
    const ops = opcionesDe(c)
    assert.ok(Array.isArray(ops) && ops.length === 1, `fallo con ${JSON.stringify(c)}`)
    assert.ok(Array.isArray(ops[0].productos))
  }
})

test('☠️ el id de la opcion implicita es SIEMPRE el mismo', () => {
  // Es la `key` de React y el id de la pestaña: si cambiara en cada lectura,
  // React remontaria el formulario y se perderia lo que se esta escribiendo.
  const c = { productos: [{ id: 'p1' }] }
  assert.equal(opcionesDe(c)[0].id, opcionesDe(c)[0].id)
  assert.equal(opcionesDe(c)[0].id, 'op_unica')
})

test('una opcion nueva trae un producto vacio y su propio id', () => {
  const a = nuevaOpcion('Básica', 15)
  const b = nuevaOpcion('Premium', 20)
  assert.equal(a.nombre, 'Básica')
  assert.equal(a.entrega_dias, 15)
  assert.equal(a.productos.length, 1, 'arranca con un producto para poder escribir de una')
  assert.notEqual(a.id, b.id, 'dos opciones nunca comparten id')
})

test('una cotizacion nueva NO trae `opciones`: la forma vieja sigue siendo el default', () => {
  assert.equal(nuevaCotizacion().opciones, undefined)
  assert.equal(opcionesDe(nuevaCotizacion()).length, 1)
})
