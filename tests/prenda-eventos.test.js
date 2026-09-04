// El registro de eventos POR PRENDA, y la marca de corte que se pone sola.
//
// POR QUÉ EXISTE. Hoy el único rastro de que una prenda se movió vive en
// `crm.logs_pedidos`, con `campo` de TEXTO LIBRE y el nombre del producto dentro:
// "SUBESTADO HOODIE PREMIUM", con erratas como "HODIE" y sin `item_id`. Dos
// hoodies iguales en un pedido son indistinguibles, así que no se puede medir
// cuánto tarda un área. Esta tabla existe para arreglar eso de raíz.
//
// ☠️ LA REGLA MÁS IMPORTANTE DE ESTE ARCHIVO: `ENVIADO_APROBACION` NO implica
// que la prenda esté cortada. Mandar el arte al cliente no exige tocar la tela.
// Medido el 4-sep-2026: 42 de las 46 prendas vivas "en curso sin marca de corte"
// estaban en ENVIADO_APROBACION. Marcarlas habría sacado 42 prendas de la
// bandeja de Corte que SÍ hay que cortar.
//
// ⚠️ Import RELATIVO, no `@/`: `node --test` no entiende el alias.
import test from 'node:test'
import assert from 'node:assert'
import { implicaCorte, eventosDelCambio, eventoDeCorte } from '../lib/prendaEventos.js'

// ── implicaCorte: qué estados demuestran que la tela ya se cortó ──────────────

test('EN_PROCESO y LISTO demuestran que la prenda ya se cortó', () => {
  assert.equal(implicaCorte('EN_PROCESO'), true)
  assert.equal(implicaCorte('LISTO'), true)
})

test('☠️ ENVIADO_APROBACION NO demuestra corte', () => {
  // El arte se manda a aprobar sin tocar la tela. Si esto se pone en true,
  // 42 prendas vivas salen hoy mismo de la bandeja de Corte sin estar cortadas.
  assert.equal(implicaCorte('ENVIADO_APROBACION'), false)
})

test('SOLICITADO no demuestra nada', () => {
  assert.equal(implicaCorte('SOLICITADO'), false)
})

test('ENTREGADO_TIENDA no pasa por fábrica, así que no implica corte', () => {
  // Estas prendas nacen entregadas: `prendas_en_taller` las excluye a propósito.
  assert.equal(implicaCorte('ENTREGADO_TIENDA'), false)
})

test('lo desconocido NUNCA implica corte', () => {
  // El default seguro va hacia "no marcar": equivocarse hacia el silencio deja
  // una prenda de más en la bandeja de Corte (molesto). Equivocarse hacia el
  // marcado la BORRA de la bandeja (se pierde trabajo).
  assert.equal(implicaCorte('ESTADO_QUE_NO_EXISTE'), false)
  assert.equal(implicaCorte(''), false)
  assert.equal(implicaCorte(null), false)
  assert.equal(implicaCorte(undefined), false)
})

// ── eventosDelCambio: qué se registra cuando un área mueve una prenda ─────────

const ITEM = {
  ITEM_ID: 'CAM-MAN-AND-5900-01',
  PEDIDO_ID: 'MAN-AND-5900',
  PRODUCTO_NOMBRE: 'HOODIE PREMIUM',
  AREA: 'ESTAMPADO + BORDADO',
  SUBESTADO: 'ESTAMPADO:SOLICITADO|BORDADO:SOLICITADO',
  SUBESTADO_CORTE: '',
}

test('mover un área registra UN evento, con item_id y el área que se movió', () => {
  const ev = eventosDelCambio({
    item: ITEM, areaRol: 'BORDADO', estadoNuevo: 'EN_PROCESO', usuario: 'uuid-007',
  })
  const cambio = ev.filter(e => e.area === 'BORDADO')
  assert.equal(cambio.length, 1)
  assert.equal(cambio[0].item_id, 'CAM-MAN-AND-5900-01')
  assert.equal(cambio[0].pedido_id, 'MAN-AND-5900')
  assert.equal(cambio[0].estado_antes, 'SOLICITADO')
  assert.equal(cambio[0].estado_despues, 'EN_PROCESO')
  assert.equal(cambio[0].usuario, 'uuid-007')
  assert.equal(cambio[0].origen, 'MANUAL')
})

test('el evento NO lleva el nombre del producto como llave', () => {
  // Es exactamente el defecto de logs_pedidos que esta tabla viene a arreglar.
  const ev = eventosDelCambio({ item: ITEM, areaRol: 'BORDADO', estadoNuevo: 'LISTO', usuario: 'u' })
  for (const e of ev) {
    assert.ok(!JSON.stringify(e).includes('HOODIE'), 'el producto no puede ser la llave')
    assert.ok(e.item_id, 'todo evento necesita item_id')
  }
})

test('pasar un área a EN_PROCESO agrega ADEMÁS el evento de corte automático', () => {
  const ev = eventosDelCambio({ item: ITEM, areaRol: 'BORDADO', estadoNuevo: 'EN_PROCESO', usuario: 'u' })
  const corte = ev.filter(e => e.area === 'CORTE')
  assert.equal(corte.length, 1)
  assert.equal(corte[0].estado_despues, 'CORTADO')
  assert.equal(corte[0].origen, 'AUTO')
})

test('pasar un área a ENVIADO_APROBACION NO genera evento de corte', () => {
  const ev = eventosDelCambio({ item: ITEM, areaRol: 'ESTAMPADO', estadoNuevo: 'ENVIADO_APROBACION', usuario: 'u' })
  assert.equal(ev.filter(e => e.area === 'CORTE').length, 0)
  assert.equal(ev.length, 1, 'solo el evento del área')
})

test('si la prenda YA estaba cortada, no se vuelve a marcar', () => {
  const yaCortada = { ...ITEM, SUBESTADO_CORTE: 'CORTADO' }
  const ev = eventosDelCambio({ item: yaCortada, areaRol: 'BORDADO', estadoNuevo: 'LISTO', usuario: 'u' })
  assert.equal(ev.filter(e => e.area === 'CORTE').length, 0)
})

test('un ítem de área simple (sin combinación) también registra su evento', () => {
  const simple = {
    ITEM_ID: 'X-1', PEDIDO_ID: 'MAN-AND-1', PRODUCTO_NOMBRE: 'CAMISETA',
    AREA: 'SUBLIMACION', SUBESTADO: 'SOLICITADO', SUBESTADO_CORTE: '',
  }
  const ev = eventosDelCambio({ item: simple, areaRol: null, estadoNuevo: 'EN_PROCESO', usuario: 'u' })
  const area = ev.filter(e => e.area === 'SUBLIMACION')
  assert.equal(area.length, 1)
  assert.equal(area[0].estado_antes, 'SOLICITADO')
  assert.equal(ev.filter(e => e.area === 'CORTE').length, 1, 'y su corte automático')
})

test('una prenda SIN área de producción registra el evento igual, sin área', () => {
  // "PRODUCTO SIN DISEÑO": hoy son 74 prendas vivas. Si el evento se cayera por
  // no tener área, quedarían fuera de toda la medición.
  const sinArea = {
    ITEM_ID: 'X-2', PEDIDO_ID: 'MAN-AND-2', PRODUCTO_NOMBRE: 'HOODIE',
    AREA: 'PRODUCTO SIN DISEÑO', SUBESTADO: 'SOLICITADO', SUBESTADO_CORTE: '',
  }
  const ev = eventosDelCambio({ item: sinArea, areaRol: null, estadoNuevo: 'LISTO', usuario: 'u' })
  assert.ok(ev.length >= 1)
  assert.equal(ev[0].item_id, 'X-2')
  assert.equal(ev[0].area, '')
})

test('sin item_id no se inventa un evento', () => {
  const roto = { PEDIDO_ID: 'MAN-AND-3', SUBESTADO: 'SOLICITADO' }
  assert.deepEqual(eventosDelCambio({ item: roto, areaRol: null, estadoNuevo: 'LISTO', usuario: 'u' }), [])
  assert.deepEqual(eventosDelCambio({ item: null, areaRol: null, estadoNuevo: 'LISTO', usuario: 'u' }), [])
})

test('un cambio que no cambia nada no se registra', () => {
  const item = { ...ITEM, SUBESTADO: 'ESTAMPADO:LISTO|BORDADO:SOLICITADO' }
  const ev = eventosDelCambio({ item, areaRol: 'ESTAMPADO', estadoNuevo: 'LISTO', usuario: 'u' })
  assert.equal(ev.filter(e => e.area === 'ESTAMPADO').length, 0)
})

// ── eventoDeCorte: la marca manual, desde la bandeja de Corte ─────────────────

test('marcar corte a mano registra su evento con origen MANUAL', () => {
  const e = eventoDeCorte({ item: ITEM, estadoNuevo: 'CORTADO', usuario: 'uuid-005' })
  assert.equal(e.area, 'CORTE')
  assert.equal(e.item_id, 'CAM-MAN-AND-5900-01')
  assert.equal(e.estado_antes, 'PENDIENTE')
  assert.equal(e.estado_despues, 'CORTADO')
  assert.equal(e.origen, 'MANUAL')
})

test('desmarcar el corte también deja rastro', () => {
  // Si alguien se equivoca y lo revierte, el evento tiene que existir: si no,
  // el histórico diría que la prenda nunca dejó de estar cortada.
  const cortada = { ...ITEM, SUBESTADO_CORTE: 'CORTADO' }
  const e = eventoDeCorte({ item: cortada, estadoNuevo: 'PENDIENTE', usuario: 'u' })
  assert.equal(e.estado_antes, 'CORTADO')
  assert.equal(e.estado_despues, 'PENDIENTE')
})

test('sin item_id la marca de corte tampoco inventa evento', () => {
  assert.equal(eventoDeCorte({ item: { PEDIDO_ID: 'X' }, estadoNuevo: 'CORTADO', usuario: 'u' }), null)
  assert.equal(eventoDeCorte({ item: null, estadoNuevo: 'CORTADO', usuario: 'u' }), null)
})
