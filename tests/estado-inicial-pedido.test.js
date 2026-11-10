// Con qué estado nace un pedido (ver lib/estadoInicialPedido.js).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { estadoInicialPedido, esEntregaEnTienda } from '../lib/estadoInicialPedido.js'

const tienda = { area: 'ENTREGA EN TIENDA' }
const estampado = { area: 'ESTAMPADO' }

test('☠️ todo entregado en tienda nace COMPLETADO (no va a imprimir ni a fábrica)', () => {
  assert.strictEqual(estadoInicialPedido([tienda]), 'COMPLETADO')
  assert.strictEqual(estadoInicialPedido([tienda, tienda]), 'COMPLETADO')
})

test('un pedido mixto sigue a fábrica: hay algo que producir', () => {
  assert.strictEqual(estadoInicialPedido([tienda, estampado]), 'EN_FABRICA')
  assert.strictEqual(estadoInicialPedido([{ area: 'PRODUCTO SIN DISEÑO' }, tienda]), 'EN_FABRICA')
})

test('lo normal sigue naciendo EN_FABRICA', () => {
  assert.strictEqual(estadoInicialPedido([estampado]), 'EN_FABRICA')
  assert.strictEqual(estadoInicialPedido([{ area: '' }]), 'EN_FABRICA')
})

test('☠️ un pedido SIN prendas nunca se cierra solo', () => {
  assert.strictEqual(estadoInicialPedido([]), 'EN_FABRICA')
  assert.strictEqual(estadoInicialPedido(null), 'EN_FABRICA')
  assert.strictEqual(estadoInicialPedido(undefined), 'EN_FABRICA')
})

test('no se deja engañar por mayúsculas ni espacios', () => {
  assert.strictEqual(esEntregaEnTienda({ area: ' entrega en tienda ' }), true)
  assert.strictEqual(esEntregaEnTienda({ area: 'ESTAMPADO + BORDADO' }), false)
  assert.strictEqual(esEntregaEnTienda(null), false)
})

test('la ruta que crea pedidos usa esta regla, no un EN_FABRICA fijo', () => {
  const ruta = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
  assert.ok(/estadoInicialPedido\(items\)/.test(ruta), 'el estado tiene que salir de la regla')
  assert.ok(!/estadoPedido: 'EN_FABRICA'/.test(ruta), 'si vuelve el valor fijo, vuelven las hojas sin trabajo')
  assert.ok(!/logCambio\(pedidoId, 'CREACION', '', 'EN_FABRICA'/.test(ruta),
    'la bitácora tiene que decir el estado con que nació de verdad')
})
