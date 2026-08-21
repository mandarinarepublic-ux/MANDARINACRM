// Con qué valores se buscan los pedidos de un vendedor.
//
// ☠️ CASO REAL, 21-ago-2026: `Clever ` tiene un espacio al final en
// `crm.usuarios.nombre`, y sus 69 pedidos guardan exactamente `Clever ` con el
// espacio. Al recortar el nombre antes de buscar se comparaba `Clever` contra
// `Clever ` — CERO coincidencias — y el vendedor se quedó sin ver ni uno de sus
// pedidos en Historial ni en Mis pedidos.
//
// Lo introduje yo el 19-ago al mover el filtro por vendedor al servidor, y lo
// reportó Rodrigo dos días después. Ninguna prueba lo cazó porque todas las
// demás cuentas tienen el nombre limpio.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { identidadesDe } from '../lib/identidad-vendedor.js'

test('☠️ EL BUG: un nombre con espacio al final se busca TAL CUAL', () => {
  const ids = identidadesDe({ NOMBRE: 'Clever ', USUARIO_ID: 'uuid-012' })
  assert.ok(ids.includes('Clever '), 'sin el valor crudo, sus 69 pedidos son invisibles')
  assert.ok(ids.includes('uuid-012'))
})

test('tambien se busca la forma recortada', () => {
  // Un pedido viejo puede tener una forma y uno nuevo la otra: ninguna de las
  // dos puede dejar a nadie sin su trabajo.
  const ids = identidadesDe({ NOMBRE: 'Clever ' })
  assert.ok(ids.includes('Clever'), 'por si algun pedido se guardo sin el espacio')
})

test('un nombre normal no se duplica', () => {
  assert.deepStrictEqual(identidadesDe({ NOMBRE: 'CAMILA', USUARIO_ID: 'uuid-011' }),
    ['CAMILA', 'uuid-011'])
})

test('acepta las dos formas de nombrar los campos', () => {
  assert.deepStrictEqual(identidadesDe({ nombre: 'YAW', id: 'uuid-014' }), ['YAW', 'uuid-014'])
})

test('sin identidad devuelve lista VACIA, nunca algo que valga por comodin', () => {
  // Quien llama usa la lista vacia para NO devolver nada. Si aca saliera '' o
  // undefined, el filtro podria acabar mostrando los pedidos de todos.
  for (const u of [null, undefined, {}, { NOMBRE: '' }, { NOMBRE: '   ' }]) {
    const r = identidadesDe(u)
    assert.ok(!r.includes(''), `no puede colarse un vacio: ${JSON.stringify(r)}`)
  }
  assert.deepStrictEqual(identidadesDe({}), [])
  assert.deepStrictEqual(identidadesDe(null), [])
})

test('☠️ ni Historial ni Mis pedidos recortan el nombre por su cuenta', () => {
  // El bug volveria en cuanto alguien reintrodujera un .trim() en cualquiera de
  // los dos. La logica vive en UN solo sitio a proposito.
  for (const f of ['../lib/db/historial.js', '../lib/db/mis-pedidos.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    const codigo = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    assert.ok(/identidadesDe\(/.test(codigo), `${f} debe usar identidadesDe`)
    assert.ok(!/\[nombre, id\]\.map|NOMBRE.*\.trim\(\)/.test(codigo),
      `${f} no puede recortar el nombre del vendedor`)
  }
})
