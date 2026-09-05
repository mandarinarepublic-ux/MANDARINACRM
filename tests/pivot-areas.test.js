// El Tablero por sub-área: qué le toca a cada mesa.
//
// REEMPLAZA a las tres columnas CORTE → PRODUCCIÓN → DESPACHO. Medido el
// 4-sep-2026: de 74 pedidos vivos, 69 caían en la primera columna. Un tablero
// donde el 93% está en una sola columna no reparte trabajo, solo repite que todo
// sigue atascado en el mismo sitio.
//
// ☠️ LA REGLA QUE MÁS COSTÓ: EL CORTE NO ES UNA PUERTA.
// La primera versión solo dejaba ver a un área lo ya marcado CORTADO, y BORDADO
// salía en CERO teniendo 23 prendas suyas esperando. El problema no es que las
// prendas estén cortadas sin marcar —solo 4 lo demostraban— sino que la marca no
// se produce cuando ocurre: el registro de corte pasó de 98 pedidos en julio a 5
// en agosto y 0 en septiembre.
//
// De ahí la regla general de este sistema, que ya se pagó en el inbox cuatro
// veces: cuando una señal PUEDE FALTAR, no puede ser la que decide si el trabajo
// se ve. Estar cortada o no es un DATO de la fila, nunca un filtro.
//
// ⚠️ Import RELATIVO, no `@/`: `node --test` no entiende el alias.
import test from 'node:test'
import assert from 'node:assert'
import { construirPivot, subareasVisibles } from '../lib/pivot-areas.js'

/** Un pedido de prueba con las claves que devuelve /api/tablero. */
function pedido(id, items, extra = {}) {
  return {
    PEDIDO_ID: id, TIENDA_ID: 'MANDARINA', CLIENTE_NOMBRE: 'Cliente',
    FECHA_PEDIDO: '2026-09-01T10:00:00Z', FECHA_ENTREGA_PROMETIDA: '2026-09-08',
    ESTADO_PEDIDO: 'EN_FABRICA', items, ...extra,
  }
}
function prenda(over = {}) {
  return {
    ITEM_ID: 'i1', PRODUCTO_NOMBRE: 'HOODIE', CANTIDAD: '1',
    AREA: 'BORDADO', SUBESTADO: 'SOLICITADO', SUBESTADO_CORTE: '', ...over,
  }
}
const porSub = (p, sub) => p.find(x => x.sub === sub)
const HOY = new Date('2026-09-04T12:00:00Z')

// ── El corte no es puerta ────────────────────────────────────────────────────

test('☠️ una prenda SIN cortar aparece en su área Y en Corte', () => {
  const p = construirPivot([pedido('A', [prenda({ AREA: 'BORDADO', SUBESTADO_CORTE: '' })])], { ahora: HOY })
  assert.equal(porSub(p, 'BORDADO').pedidos, 1, 'bordado tiene que verla: la está esperando')
  assert.equal(porSub(p, 'CORTE').pedidos, 1, 'y corte también: la tiene que cortar')
})

test('no es duplicar: son dos pendientes distintos sobre la misma prenda', () => {
  const p = construirPivot([pedido('A', [prenda({ AREA: 'BORDADO' })])], { ahora: HOY })
  assert.equal(porSub(p, 'BORDADO').prendas, 1)
  assert.equal(porSub(p, 'CORTE').prendas, 1)
})

test('ya cortada: sale de Corte y sigue en su área', () => {
  const p = construirPivot([pedido('A', [prenda({ SUBESTADO_CORTE: 'CORTADO' })])], { ahora: HOY })
  assert.equal(porSub(p, 'CORTE'), undefined, 'nada que cortar')
  assert.equal(porSub(p, 'BORDADO').pedidos, 1)
  assert.equal(porSub(p, 'BORDADO').sinCorte, 0)
})

test('☠️ un área con trabajo NUNCA desaparece de la lista', () => {
  // El bug que se cometió al construir esto: un `.filter(pedidos > 0)` borró
  // BORDADO entero teniendo 18 pedidos. Misma familia que el
  // `.filter(items.length > 0)` que en Producción escondió pedidos 14 días.
  const p = construirPivot([pedido('A', [prenda({ AREA: 'BORDADO' })])], { ahora: HOY })
  assert.ok(porSub(p, 'BORDADO'), 'bordado tiene trabajo y tiene que estar')
  assert.ok(p.every(s => s.pedidos > 0), 'ninguna tarjeta vacía, ninguna con trabajo escondida')
})

// ── Multi-área ───────────────────────────────────────────────────────────────

test('cada área cuenta por SU propio estado, no por el del pedido', () => {
  const p = construirPivot([pedido('A', [prenda({
    AREA: 'ESTAMPADO + BORDADO',
    SUBESTADO: 'ESTAMPADO:LISTO|BORDADO:SOLICITADO',
    SUBESTADO_CORTE: 'CORTADO',
  })])], { ahora: HOY })
  assert.equal(porSub(p, 'ESTAMPADO'), undefined, 'estampado ya terminó lo suyo')
  assert.equal(porSub(p, 'BORDADO').pedidos, 1, 'bordado sigue pendiente')
})

test('una prenda sin área de producción cae en Sin área, no se pierde', () => {
  // "PRODUCTO SIN DISEÑO": eran 74 prendas vivas. Si se cayeran por no tener
  // área, quedarían fuera de toda la medición y de toda mesa.
  const p = construirPivot([pedido('A', [prenda({ AREA: 'PRODUCTO SIN DISEÑO', SUBESTADO_CORTE: 'CORTADO' })])], { ahora: HOY })
  assert.equal(porSub(p, 'SIN_AREA').pedidos, 1)
})

// ── Lo que NO cuenta ─────────────────────────────────────────────────────────

/** Las mesas que FABRICAN. «Por entregar» no es una mesa: es la salida. */
const mesas = (p) => p.filter(s => s.sub !== 'POR_ENTREGAR').map(s => s.sub)

test('ENTREGADO_TIENDA no pasa por fábrica: no es trabajo de ninguna mesa', () => {
  const p = construirPivot([pedido('A', [prenda({ SUBESTADO: 'ENTREGADO_TIENDA' })])], { ahora: HOY })
  assert.deepEqual(mesas(p), [])
  // ☠️ Pero el pedido NO desaparece: sigue vivo y lo pendiente es entregarlo.
  // Asi se perdieron TRES pedidos el 19-ago-2026, uno creado ese mismo dia.
  assert.equal(porSub(p, 'POR_ENTREGAR').pedidos, 1)
})

test('una prenda eliminada no es trabajo de ninguna mesa', () => {
  const p = construirPivot([pedido('A', [prenda({ SUBESTADO: 'ELIMINADO' })])], { ahora: HOY })
  assert.deepEqual(mesas(p), [])
})

test('una prenda LISTA en su única área no cuenta en ninguna mesa', () => {
  const p = construirPivot([pedido('A', [prenda({ SUBESTADO: 'LISTO', SUBESTADO_CORTE: 'CORTADO' })])], { ahora: HOY })
  assert.deepEqual(mesas(p), [])
  assert.equal(porSub(p, 'POR_ENTREGAR').pedidos, 1, 'la fábrica terminó: queda entregarlo')
})

test('☠️ una prenda LISTA pero SIN marca de corte tampoco vuelve a Corte', () => {
  // Si ya está lista, cortarla no tiene sentido: mandarla a Corte seria mandar
  // trabajo que no existe. Son 3 prendas asi hoy en produccion.
  const p = construirPivot([pedido('A', [prenda({ SUBESTADO: 'LISTO', SUBESTADO_CORTE: '' })])], { ahora: HOY })
  assert.equal(porSub(p, 'CORTE'), undefined)
  assert.deepEqual(mesas(p), [])
})

// ── El aviso de corte, que es dato y no filtro ───────────────────────────────

test('cada área cuenta cuántas de sus prendas no tienen marca de corte', () => {
  const p = construirPivot([pedido('A', [
    prenda({ ITEM_ID: 'i1', AREA: 'BORDADO', SUBESTADO_CORTE: '' }),
    prenda({ ITEM_ID: 'i2', AREA: 'BORDADO', SUBESTADO_CORTE: 'CORTADO' }),
  ])], { ahora: HOY })
  assert.equal(porSub(p, 'BORDADO').prendas, 2)
  assert.equal(porSub(p, 'BORDADO').sinCorte, 1, 'es un aviso, no un filtro: las dos se ven')
})

// ── Vencidos y edad ──────────────────────────────────────────────────────────

test('separa vencido de urgente, que el tablero viejo mezclaba', () => {
  // La regla vieja pintaba 🚨 con `dias <= 2`, y un vencido tambien cumple: 45 de
  // 74 tarjetas gritaban igual. Vencido y "urge" son cosas distintas.
  const p = construirPivot([
    pedido('VIEJO', [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-08-20' }),
    pedido('URGE',  [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-09-05' }),
    pedido('PLAZO', [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-09-20' }),
  ], { ahora: HOY })
  const b = porSub(p, 'BORDADO')
  assert.equal(b.pedidos, 3)
  assert.equal(b.vencidos, 1, 'solo el que ya paso su fecha')
  const vencido = b.lista.find(x => x.id === 'VIEJO')
  assert.ok(vencido.atraso > 0, 'el atraso se mide en dias, no es un si/no')
})

test('ordena el más atrasado primero', () => {
  const p = construirPivot([
    pedido('B', [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-09-01' }),
    pedido('A', [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-08-01' }),
  ], { ahora: HOY })
  assert.deepEqual(porSub(p, 'BORDADO').lista.map(x => x.id), ['A', 'B'])
})

test('un pedido sin fecha prometida no se cuela entre los atrasados', () => {
  // Sin promesa no hay atraso que medir. Ponerlo arriba seria inventar urgencia.
  const p = construirPivot([
    pedido('SIN', [prenda()], { FECHA_ENTREGA_PROMETIDA: '' }),
    pedido('TARDE', [prenda()], { FECHA_ENTREGA_PROMETIDA: '2026-08-01' }),
  ], { ahora: HOY })
  const lista = porSub(p, 'BORDADO').lista
  assert.equal(lista[0].id, 'TARDE')
  assert.equal(lista[1].atraso, null, 'sin promesa el atraso es null, no 0')
})

// ── Qué tarjetas ve cada quien ───────────────────────────────────────────────

test('ADMIN ve todas las sub-áreas', () => {
  assert.deepEqual(subareasVisibles({ rol: 'ADMIN', areas: [] }), null, 'null = sin recorte')
})

test('quien tiene áreas asignadas ve las suyas, y siempre Corte', () => {
  // Corte va incluido porque lo que no se corta es lo que no le llega: es su
  // cola de entrada, no el trabajo de otro.
  const v = subareasVisibles({ rol: 'DISEÑO', areas: ['BORDADO'] })
  assert.deepEqual(v.sort(), ['BORDADO', 'CORTE'])
})

test('☠️ un rol transversal SIN áreas ve todo, no nada', () => {
  // CORTE corta para las tres areas y no tiene `areas` asignadas. Recortarle a
  // "sus areas" (ninguna) lo dejaria con la pantalla vacia — el mismo error que
  // deja a un DISEÑO sin areas sin ver nada.
  assert.deepEqual(subareasVisibles({ rol: 'CORTE', areas: [] }), null)
  assert.deepEqual(subareasVisibles({ rol: 'DESPACHO', areas: [] }), null)
})
