// El orden y los textos de la bandeja de Producción.
//
// Antes se ordenaba por FECHA_PEDIDO (lo más nuevo arriba) y lo que vencía hoy
// podía quedar en la página 3. Ahora manda la fecha PROMETIDA.
import test from 'node:test'
import assert from 'node:assert'
import { comparadorUrgencia, tramoEntrega, pasaFiltroEntrega, contarEntregas,
         plural, textoEntrega, textoConteo, haceCuanto } from '../lib/orden-produccion.js'

const HOY = new Date(2026, 10, 21, 10, 0, 0)   // 21-nov-2026, hora local
const P = (id, pedido, entrega) => ({ PEDIDO_ID: id, FECHA_PEDIDO: pedido, FECHA_ENTREGA_PROMETIDA: entrega })
const orden = (lista) => [...lista].sort(comparadorUrgencia(HOY)).map((p) => p.PEDIDO_ID)

test('lo atrasado primero, luego lo que vence antes, sin fecha al final', () => {
  const lista = [
    P('SIN-FECHA', '2026-11-20', ''),
    P('EN-5', '2026-11-01', '2026-11-26'),
    P('HOY', '2026-11-10', '2026-11-21'),
    P('ATRASADO-3', '2026-11-02', '2026-11-18'),
    P('ATRASADO-1', '2026-11-03', '2026-11-20'),
  ]
  assert.deepStrictEqual(orden(lista), ['ATRASADO-3', 'ATRASADO-1', 'HOY', 'EN-5', 'SIN-FECHA'])
})

test('empate de entrega: el pedido más nuevo primero, luego PEDIDO_ID', () => {
  const lista = [
    P('MAN-0001', '2026-11-01', '2026-11-25'),
    P('MAN-0003', '2026-11-05', '2026-11-25'),
    P('MAN-0002', '2026-11-05', '2026-11-25'),
  ]
  assert.deepStrictEqual(orden(lista), ['MAN-0003', 'MAN-0002', 'MAN-0001'])
})

test('el orden es estable entre cargas: misma entrada, misma salida', () => {
  const lista = [P('B', '2026-11-05', ''), P('A', '2026-11-05', ''), P('C', '', '')]
  assert.deepStrictEqual(orden(lista), orden([...lista].reverse()))
})

test('tramos: atrasado < 0, pronto 0..2, nada después o sin fecha', () => {
  assert.strictEqual(tramoEntrega(-1), 'ATRASADO')
  assert.strictEqual(tramoEntrega(0), 'PRONTO')
  assert.strictEqual(tramoEntrega(2), 'PRONTO')
  assert.strictEqual(tramoEntrega(3), null)
  assert.strictEqual(tramoEntrega(null), null)
})

test('filtro y conteo de entrega usan el mismo tramo', () => {
  const lista = [P('A', '', '2026-11-19'), P('B', '', '2026-11-21'), P('C', '', '2026-11-23'),
                 P('D', '', '2026-12-30'), P('E', '', '')]
  assert.deepStrictEqual(contarEntregas(lista, HOY), { atrasados: 1, pronto: 2 })
  assert.deepStrictEqual(lista.filter((p) => pasaFiltroEntrega(p, 'ATRASADOS', HOY)).map((p) => p.PEDIDO_ID), ['A'])
  assert.deepStrictEqual(lista.filter((p) => pasaFiltroEntrega(p, 'PRONTO', HOY)).map((p) => p.PEDIDO_ID), ['B', 'C'])
  assert.strictEqual(lista.filter((p) => pasaFiltroEntrega(p, 'TODOS', HOY)).length, 5)
})

test('textos sin "(s)"', () => {
  assert.strictEqual(plural(1, 'pedido'), '1 pedido')
  assert.strictEqual(plural(3, 'pedido'), '3 pedidos')
  assert.strictEqual(textoEntrega(-1).txt, 'Atrasado 1 día')
  assert.strictEqual(textoEntrega(-4).txt, 'Atrasado 4 días')
  assert.strictEqual(textoEntrega(0).txt, 'Vence hoy')
  assert.strictEqual(textoEntrega(5).txt, '5d restantes')
  assert.strictEqual(textoEntrega(null), null)
})

test('el conteo dice lo que filtra, no siempre "pendientes"', () => {
  assert.strictEqual(textoConteo(12, 'TODOS'), '12 ítems pendientes')
  assert.strictEqual(textoConteo(1, 'TODOS'), '1 ítem pendiente')
  assert.strictEqual(textoConteo(4, 'LISTO'), '4 ítems listos')
  assert.strictEqual(textoConteo(2, 'EN_PROCESO'), '2 ítems en proceso')
  assert.strictEqual(textoConteo(3, 'TODOS', { busqueda: 'ana' }), '3 ítems encontrados')
})

test('hace cuánto se actualizó', () => {
  const t = HOY.getTime()
  assert.strictEqual(haceCuanto(t, t + 30_000), 'hace un momento')
  assert.strictEqual(haceCuanto(t, t + 3 * 60_000), 'hace 3 min')
  assert.strictEqual(haceCuanto(t, t + 125 * 60_000), 'hace 2 h')
  assert.strictEqual(haceCuanto(t, t - 5000), 'hace un momento')
})
