// Dos vendedores grabando a la vez no pueden llevarse el mismo numero, y una
// venta que no se completa no puede dejar hueco.
//
// La garantia contra duplicados NO es este codigo: es el indice unico
// `pedidos_unique_id_key`. Esto solo evita que el segundo vendedor vea un error.
import test from 'node:test'
import assert from 'node:assert'
import { crearPedidoConReintento, esNumeroOcupado, conNumero, MAX_INTENTOS } from '../lib/reintento-pedido.js'

const choque = () => Object.assign(new Error('duplicate key value violates unique constraint "pedidos_unique_id_key"'), { code: '23505' })

test('sin choque, graba al primer intento y no pide numeros de mas', async () => {
  let pedidos = 0
  const r = await crearPedidoConReintento('MAN-JAC-5678', 5678,
    async () => {},
    async () => { pedidos++; return 9999 })
  assert.deepStrictEqual(r, { pedidoId: 'MAN-JAC-5678', uniqueId: 5678, intentos: 1 })
  assert.strictEqual(pedidos, 0, 'no debe consultar el siguiente numero si no hizo falta')
})

test('si el numero esta ocupado, reintenta con el siguiente', async () => {
  const intentos = []
  const r = await crearPedidoConReintento('MAN-JAC-5678', 5678,
    async (id, num) => { intentos.push(id); if (num === 5678) throw choque() },
    async () => 5679)
  assert.deepStrictEqual(intentos, ['MAN-JAC-5678', 'MAN-JAC-5679'])
  assert.strictEqual(r.pedidoId, 'MAN-JAC-5679')
  assert.strictEqual(r.uniqueId, 5679)
  assert.strictEqual(r.intentos, 2)
})

test('el prefijo del vendedor NO cambia al reintentar', async () => {
  // Si el reintento tocara el prefijo, el pedido quedaria atribuido a otro
  // vendedor o a otra tienda.
  const r = await crearPedidoConReintento('IND-YAW-5678', 5678,
    async (id, num) => { if (num < 5680) throw choque() },
    async () => 5680)
  assert.ok(r.pedidoId.startsWith('IND-YAW-'), `se perdio el prefijo: ${r.pedidoId}`)
})

test('☠️ un fallo que NO es de numero ocupado se propaga TAL CUAL', async () => {
  // Reintentar a ciegas convertiria un error claro (red, permisos, dato malo) en
  // cinco intentos y un mensaje peor.
  let veces = 0
  await assert.rejects(
    () => crearPedidoConReintento('MAN-JAC-5678', 5678,
      async () => { veces++; throw new Error('fetch failed') },
      async () => 5679),
    /fetch failed/)
  assert.strictEqual(veces, 1, 'un fallo de red debe intentarse UNA sola vez')
})

test('se rinde tras MAX_INTENTOS y deja ver el error de verdad', async () => {
  let veces = 0
  await assert.rejects(
    () => crearPedidoConReintento('MAN-JAC-5678', 5678,
      async () => { veces++; throw choque() },
      async () => { return 5678 + veces }),
    /duplicate key/)
  assert.strictEqual(veces, MAX_INTENTOS)
})

test('si la base devuelve un numero que ya fallo, avanza igual', async () => {
  // Un desfase de lectura devolviendo siempre el mismo numero dejaria al
  // vendedor sin poder guardar, dando vueltas hasta agotar los intentos.
  const usados = []
  const r = await crearPedidoConReintento('MAN-JAC-5678', 5678,
    async (id, num) => { usados.push(num); if (num < 5680) throw choque() },
    async () => 5678)   // la base insiste en el mismo
  assert.deepStrictEqual(usados, [5678, 5679, 5680])
  assert.strictEqual(r.uniqueId, 5680)
})

test('reconoce el choque venga con codigo o solo con texto', () => {
  assert.ok(esNumeroOcupado({ code: '23505' }))
  assert.ok(esNumeroOcupado({ message: 'duplicate key value violates unique constraint' }))
  assert.ok(esNumeroOcupado({ message: 'llave duplicada viola restriccion de unicidad "pedidos_unique_id_key"' }))
  assert.ok(!esNumeroOcupado({ code: '42501', message: 'permission denied' }))
  assert.ok(!esNumeroOcupado({ message: 'fetch failed' }))
  assert.ok(!esNumeroOcupado(null))
})

test('conNumero solo toca el ultimo segmento', () => {
  assert.strictEqual(conNumero('MAN-JAC-5678', 5679), 'MAN-JAC-5679')
  assert.strictEqual(conNumero('IND-YAW-5678', 99), 'IND-YAW-99')
})
