// La fecha de entrega: sin tocar, 3 días laborables desde la creación; si el
// vendedor la cambia, mínimo 4. No depende de las áreas.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  DIAS_ENTREGA, DIAS_ENTREGA_MIN_ELEGIDA,
  fechaEntregaPedido, fechaMinimaElegida, resolverFechaEntrega, diasLaborablesEntre,
} from '../lib/plazoEntrega.js'

test('3 automáticos, 4 si se elige a mano', () => {
  assert.strictEqual(DIAS_ENTREGA, 3)
  assert.strictEqual(DIAS_ENTREGA_MIN_ELEGIDA, 4)
})

test('la automática cuenta lunes a viernes y salta el fin de semana', () => {
  // oct-2026: 19 lunes … 23 viernes, 24 sábado, 25 domingo
  assert.strictEqual(fechaEntregaPedido('2026-10-19'), '2026-10-22') // lun → jue
  assert.strictEqual(fechaEntregaPedido('2026-10-21'), '2026-10-26') // mié → lun
  assert.strictEqual(fechaEntregaPedido('2026-10-23'), '2026-10-28') // vie → mié
  assert.strictEqual(fechaEntregaPedido('2026-10-24'), '2026-10-28') // sáb → mié
  assert.strictEqual(fechaEntregaPedido('2026-10-25'), '2026-10-28') // dom → mié
  assert.strictEqual(fechaEntregaPedido('2026-12-30'), '2027-01-04') // cruza el año
})

test('la mínima elegida es un día laborable después de la automática', () => {
  assert.strictEqual(fechaMinimaElegida('2026-10-19'), '2026-10-23') // lun → vie
  assert.strictEqual(fechaMinimaElegida('2026-10-21'), '2026-10-27') // mié → mar
})

test('sin tocar: se guarda la automática con 3 días', () => {
  assert.deepStrictEqual(resolverFechaEntrega('', '2026-10-21'), { fecha: '2026-10-26', dias: 3 })
  assert.deepStrictEqual(resolverFechaEntrega(undefined, '2026-10-21'), { fecha: '2026-10-26', dias: 3 })
  assert.deepStrictEqual(resolverFechaEntrega('2026-10-26', '2026-10-21'), { fecha: '2026-10-26', dias: 3 })
})

test('elegida a mano: desde 4 días laborables en adelante', () => {
  assert.deepStrictEqual(resolverFechaEntrega('2026-10-27', '2026-10-21'), { fecha: '2026-10-27', dias: 4 })
  assert.deepStrictEqual(resolverFechaEntrega('2026-11-04', '2026-10-21'), { fecha: '2026-11-04', dias: 10 })
})

test('antes de la mínima se rechaza (incluido el fin de semana de por medio)', () => {
  // pedido del miércoles 21: automática lunes 26, mínima elegida martes 27
  for (const f of ['2026-10-21', '2026-10-22', '2026-10-24', '2026-10-25', '2026-10-20']) {
    assert.ok(resolverFechaEntrega(f, '2026-10-21').error, `${f} debió rechazarse`)
  }
  assert.ok(resolverFechaEntrega('mañana', '2026-10-21').error)
})

test('días laborables entre dos fechas', () => {
  assert.strictEqual(diasLaborablesEntre('2026-10-23', '2026-10-28'), 3)
  assert.strictEqual(diasLaborablesEntre('2026-10-21', '2026-10-21'), 0)
})

test('el servidor decide la fecha con la regla, no con tablas por área', () => {
  const ruta = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
  assert.ok(/resolverFechaEntrega\(/.test(ruta), 'la ruta debe pasar la fecha por la regla')
  assert.ok(!/diasEntrega'|calcularDiasEntrega/.test(ruta), 'nada de tablas de plazos por área')
})

test('el formulario no tiene su propia tabla de días por área', () => {
  const pantalla = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.ok(!/'BORDADO':\s*\d/.test(pantalla), 'la tabla de combinaciones volvió a la pantalla')
  assert.ok(/fechaMinimaElegida\(\)/.test(pantalla), 'el calendario debe arrancar en la mínima elegida')
})
