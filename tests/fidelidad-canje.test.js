import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { tokenFidelidadValido, armarPedidoDeCanje } from '../lib/canjeFidelidad.js'
import { esCompraParaMeta } from '../lib/compraParaMeta.js'

// El cuerpo que manda la app del club (premios/lib/integraciones.js → payloadPedidoCrm).
const canje = () => ({
  canjeId: '3f1c2a9e-1111-4c2b-9a77-0123456789ab',
  tiendaId: 'MANDARINA',
  cliente: { nombre: 'Ana Pérez', cedula: null, celular: '0991112222', ciudad: null, direccion: null },
  items: [{ productoNombre: 'Gorra bordada', talla: null, color: 'Negro', cantidad: 1, precioUnit: 0, area: 'PRODUCTO SIN DISEÑO', esPersonalizado: false }],
  pagos: [],
  emitirFactura: false,
  ciudadPedido: null,
  direccionTexto: null,
  notasVendedor: '🎁 CANJE DE PUNTOS (100 pts) · RETIRA EN TIENDA',
})

test('candado: solo el FIDELIDAD_TOKEN exacto; sin token configurado no entra nadie', () => {
  assert.equal(tokenFidelidadValido('Bearer abc123', 'abc123'), true)
  assert.equal(tokenFidelidadValido('Bearer abc124', 'abc123'), false)
  assert.equal(tokenFidelidadValido('Bearer abc12', 'abc123'), false)
  assert.equal(tokenFidelidadValido('', 'abc123'), false)
  assert.equal(tokenFidelidadValido('Bearer ', ''), false)        // ☠️ vacío contra vacío NO es "igual"
  assert.equal(tokenFidelidadValido(null, undefined), false)
  assert.equal(tokenFidelidadValido('Bearer abc123', '﻿abc123'), true) // BOM de PowerShell en la variable
})

test('arma el cuerpo de /api/pedidos: cédula PENDIENTE-<celular>, $0, sin pagos ni factura', () => {
  const r = armarPedidoDeCanje(canje())
  assert.equal(r.ok, true)
  assert.equal(r.canjeId, '3f1c2a9e-1111-4c2b-9a77-0123456789ab')
  assert.equal(r.cuerpo.tiendaId, 'MANDARINA')
  assert.equal(r.cuerpo.cliente.cedula, 'PENDIENTE-0991112222')
  assert.deepEqual(r.cuerpo.pagos, [])
  assert.equal(r.cuerpo.emitirFactura, false)
  assert.equal(r.cuerpo.items[0].precioUnit, 0)
  assert.equal(r.cuerpo.items[0].area, 'PRODUCTO SIN DISEÑO')
  assert.match(r.cuerpo.notasVendedor, /CANJE DE PUNTOS/)
})

test('☠️ un canje NUNCA cobra: precio, pagos y factura se fuerzan aunque vengan en el cuerpo', () => {
  const c = canje()
  c.items[0].precioUnit = 35
  c.pagos = [{ tipo: 'EFECTIVO', monto: 35 }]
  c.emitirFactura = true
  const r = armarPedidoDeCanje(c)
  assert.equal(r.cuerpo.items[0].precioUnit, 0)
  assert.deepEqual(r.cuerpo.pagos, [])
  assert.equal(r.cuerpo.emitirFactura, false)
})

test('rechaza lo que no es un canje válido', () => {
  const sinId = canje(); delete sinId.canjeId
  assert.equal(armarPedidoDeCanje(sinId).ok, false)
  const idRaro = canje(); idRaro.canjeId = "x' or 1=1"
  assert.equal(armarPedidoDeCanje(idRaro).ok, false)
  const yaw = canje(); yaw.tiendaId = 'YAW'
  assert.equal(armarPedidoDeCanje(yaw).ok, false)
  const sinItems = canje(); sinItems.items = []
  assert.equal(armarPedidoDeCanje(sinItems).ok, false, 'sin prendas se auto-despacharía (.every sobre vacío)')
  const muchos = canje(); muchos.items = [canje().items[0], canje().items[0]]
  assert.equal(armarPedidoDeCanje(muchos).ok, false, 'un canje es UNA prenda')
  const cant = canje(); cant.items[0].cantidad = 5
  assert.equal(armarPedidoDeCanje(cant).cuerpo.items[0].cantidad, 1)
  const sinCel = canje(); sinCel.cliente.celular = ''
  assert.equal(armarPedidoDeCanje(sinCel).ok, false)
  const sinNombre = canje(); sinNombre.cliente.nombre = '  '
  assert.equal(armarPedidoDeCanje(sinNombre).ok, false)
  assert.equal(armarPedidoDeCanje(null).ok, false)
})

test('la cédula que manda el cliente se respeta si es válida', () => {
  const c = canje(); c.cliente.cedula = '1712345678'
  assert.equal(armarPedidoDeCanje(c).cuerpo.cliente.cedula, '1712345678')
  const mala = canje(); mala.cliente.cedula = 'no es cédula!!'
  assert.equal(armarPedidoDeCanje(mala).cuerpo.cliente.cedula, 'PENDIENTE-0991112222')
})

test('☠️ un pedido de $0 NO es una compra para Meta (ensuciaría la pauta)', () => {
  assert.equal(esCompraParaMeta('MANDARINA', 0), false)
  assert.equal(esCompraParaMeta('MANDARINA', '0.00'), false)
  assert.equal(esCompraParaMeta('MANDARINA', 35), true)
  assert.equal(esCompraParaMeta('YAW', 35), false)
})

const ruta = readFileSync(new URL('../app/api/fidelidad/canje/route.js', import.meta.url), 'utf8')
const pedidos = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
const middleware = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')

test('/api/pedidos decide el CAPI con esCompraParaMeta (monto incluido)', () => {
  assert.ok(/esCompraParaMeta\(\s*tiendaId\s*,\s*montoTotal\s*\)/.test(pedidos))
})

test('la ruta del canje mira res.ok, reserva el canje antes de crear y marca origen premio', () => {
  assert.ok(/if\s*\(\s*!res\.ok\s*\)/.test(ruta), 'la lección de LINKPAGO: un 401 no lanza')
  assert.ok(/canjes_fidelidad/.test(ruta), 'idempotencia: reserva por canje_id')
  assert.ok(/origen:\s*'premio'/.test(ruta))
  assert.ok(/await\s+registrarEvento/.test(ruta), 'los fallos hacen ruido y se esperan')
})

test('/api/fidelidad/canje está en RUTAS_PUBLICAS (se defiende sola con su token)', () => {
  const bloque = middleware.match(/RUTAS_PUBLICAS\s*=\s*\[([\s\S]*?)\n\]/)[1]
  const rutas = bloque.split('\n').map((l) => l.replace(/\/\/.*$/, '')).map((l) => l.match(/'([^']+)'/)).filter(Boolean).map((m) => m[1])
  assert.ok(rutas.includes('/api/fidelidad/canje'), rutas.join(', '))
  assert.ok(!rutas.includes('/api/pedidos'))
})
