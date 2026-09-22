// Corte por PEDIDO: las dos acciones de la cabecera de la bandeja.
//
// La regla vive en lib/cortePedido.js (puro, sin Supabase): qué prendas cambian,
// qué columnas se escriben, qué línea va a la bitácora y qué eventos por prenda.
// La ruta solo ejecuta el plan.
import test from 'node:test'
import assert from 'node:assert'
import {
  estaTrabado, notaDeTraba, resumenCorte, planCortarTodo, planFaltaAlgo,
} from '../lib/cortePedido.js'

const AHORA = '2026-09-22T19:30:00.000Z'
const PEDIDO = { PEDIDO_ID: 'MAN-AND-5599' }

const items = (...estados) =>
  estados.map((e, i) => ({
    ITEM_ID: `I${i + 1}`, PEDIDO_ID: 'MAN-AND-5599',
    PRODUCTO_NOMBRE: `Prenda ${i + 1}`, SUBESTADO_CORTE: e,
  }))

// ── La traba ───────────────────────────────────────────────────────────────

test('un pedido con nota esta trabado; sin nota, no', () => {
  assert.equal(estaTrabado({ CORTE_PENDIENTE_NOTA: 'no hay talla M' }), true)
  assert.equal(estaTrabado({ CORTE_PENDIENTE_NOTA: '' }), false)
  assert.equal(estaTrabado({ CORTE_PENDIENTE_NOTA: null }), false)
  assert.equal(estaTrabado({}), false)
  assert.equal(estaTrabado(null), false)
})

test('una nota de puros espacios NO traba', () => {
  // Si trabara, un pedido quedaría clavado en la bandeja con el chip vacío: el
  // cortador vería la traba y no podría leer de qué se trata.
  assert.equal(estaTrabado({ CORTE_PENDIENTE_NOTA: '   \n ' }), false)
  assert.equal(notaDeTraba({ CORTE_PENDIENTE_NOTA: '  no hay talla M  ' }), 'no hay talla M')
})

// ── El resumen que va a la bitácora ────────────────────────────────────────

test('el resumen cuenta cortadas sobre el total', () => {
  assert.equal(resumenCorte(items('CORTADO', 'CORTADO', 'PENDIENTE')).texto, '2/3 cortados')
  assert.equal(resumenCorte(items('', 'SOLICITADO')).texto, '0/2 cortados')
  assert.equal(resumenCorte([]).texto, '0/0 cortados')
})

test('una prenda sin subestado de corte cuenta como PENDIENTE, no como cortada', () => {
  // `subestado_corte` nace NULL: tratarlo como cortado vaciaría la bandeja.
  assert.equal(resumenCorte(items(null, undefined, '')).cortadas, 0)
})

// ── Cortar todas ───────────────────────────────────────────────────────────

test('cortar todas cambia solo las que faltan y suelta la traba', () => {
  const plan = planCortarTodo({
    pedido: { ...PEDIDO, CORTE_PENDIENTE_NOTA: 'no hay talla M' },
    items: items('CORTADO', 'PENDIENTE', 'SOLICITADO'),
    usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.subestado, 'CORTADO')
  assert.deepEqual(plan.itemIds, ['I2', 'I3'], 'la que ya estaba cortada no se vuelve a escribir')
  assert.equal(plan.columnas.corte_pendiente_nota, null, 'cortar todo SUELTA la traba')
  assert.equal(plan.columnas.corte_pendiente_fecha, null)
  assert.equal(plan.columnas.corte_terminado_fecha, AHORA)
  assert.equal(plan.columnas.corte_terminado_usuario, 'CHRISTIAN')
})

test('cortar todas deja UNA linea de bitacora, no una por prenda', () => {
  const plan = planCortarTodo({
    pedido: { ...PEDIDO, CORTE_PENDIENTE_NOTA: 'no hay talla M' },
    items: items('CORTADO', 'PENDIENTE', 'PENDIENTE'),
    usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(Array.isArray(plan.log), false, 'es una sola linea')
  assert.equal(plan.log.campo, 'CORTE PEDIDO')
  assert.match(plan.log.antes, /1\/3 cortados/)
  assert.match(plan.log.antes, /no hay talla M/, 'de que traba venia saliendo')
  assert.match(plan.log.despues, /CORTADO/)
  assert.match(plan.log.despues, /3/, 'cuantas prendas quedaron cortadas')
})

test('el campo de bitacora empieza por CORTE: la vista de ultimo movimiento lo cuenta', () => {
  // crm.pedido_ultimo_movimiento filtra `campo like 'CORTE %'`. Cortar es
  // trabajo: si el campo no empieza así, el pedido se ve «quieto» habiendo
  // movimiento.
  const plan = planCortarTodo({ pedido: PEDIDO, items: items('PENDIENTE'), usuario: 'X', ahora: AHORA })
  assert.ok(plan.log.campo.startsWith('CORTE '), plan.log.campo)
})

test('cortar todas registra un evento por prenda, con su item_id', () => {
  const plan = planCortarTodo({
    pedido: PEDIDO, items: items('CORTADO', 'PENDIENTE'), usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(plan.eventos.length, 1, 'solo la que cambio')
  const [ev] = plan.eventos
  assert.equal(ev.item_id, 'I2')
  assert.equal(ev.pedido_id, 'MAN-AND-5599')
  assert.equal(ev.area, 'CORTE')
  assert.equal(ev.estado_antes, 'PENDIENTE')
  assert.equal(ev.estado_despues, 'CORTADO')
  assert.equal(ev.origen, 'MANUAL', 'lo marco una persona, no el sistema')
})

test('cortar un pedido SIN prendas no inventa un corte', () => {
  // `todosItemsListos` usa .every() y un pedido sin ítems da true: la misma mina
  // no se rearma aquí. Sin prendas no hay nada que cortar.
  const plan = planCortarTodo({ pedido: PEDIDO, items: [], usuario: 'X', ahora: AHORA })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /prenda/i)
})

// ── Falta algo ─────────────────────────────────────────────────────────────

test('falta algo devuelve TODO el pedido a pendiente, incluidas las cortadas', () => {
  // Decision de producto: no se sabe cual falta, asi que se confia solo en el
  // texto. El pedido entero vuelve a pendiente.
  const plan = planFaltaAlgo({
    pedido: PEDIDO, items: items('CORTADO', 'CORTADO', 'PENDIENTE'),
    nota: 'no hay talla M', usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.subestado, 'PENDIENTE')
  assert.deepEqual(plan.itemIds, ['I1', 'I2'], 'la que ya estaba pendiente no se reescribe')
  assert.equal(plan.columnas.corte_pendiente_nota, 'no hay talla M')
  assert.equal(plan.columnas.corte_pendiente_fecha, AHORA)
  assert.equal(plan.columnas.corte_pendiente_usuario, 'CHRISTIAN')
  assert.equal(plan.columnas.corte_terminado_fecha, null, 'ya no esta terminado')
})

test('falta algo SIN texto se rechaza: la nota es la unica fuente de que falta', () => {
  for (const nota of ['', '   ', null, undefined]) {
    const plan = planFaltaAlgo({ pedido: PEDIDO, items: items('PENDIENTE'), nota, usuario: 'X', ahora: AHORA })
    assert.equal(plan.ok, false, `nota ${JSON.stringify(nota)} deberia rechazarse`)
    assert.match(plan.error, /falta/i)
  }
})

test('la nota se recorta y se acota', () => {
  const plan = planFaltaAlgo({
    pedido: PEDIDO, items: items('PENDIENTE'),
    nota: '  ' + 'x'.repeat(900) + '  ', usuario: 'X', ahora: AHORA,
  })
  assert.equal(plan.ok, true)
  assert.ok(plan.columnas.corte_pendiente_nota.length <= 500, 'se acota para no reventar la cabecera')
  assert.ok(!plan.columnas.corte_pendiente_nota.startsWith(' '), 'se recorta')
})

test('falta algo sobre un pedido YA trabado actualiza el texto y la fecha', () => {
  const plan = planFaltaAlgo({
    pedido: { ...PEDIDO, CORTE_PENDIENTE_NOTA: 'no hay talla M' },
    items: items('PENDIENTE'), nota: 'ya llego la M, falta la tela roja',
    usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.columnas.corte_pendiente_nota, 'ya llego la M, falta la tela roja')
  assert.match(plan.log.antes, /no hay talla M/, 'la bitacora guarda de que traba venia')
})

test('la bitacora de falta algo lleva el texto: sin el, no se sabe que falta', () => {
  const plan = planFaltaAlgo({
    pedido: PEDIDO, items: items('CORTADO', 'PENDIENTE'),
    nota: 'no hay talla M', usuario: 'CHRISTIAN', ahora: AHORA,
  })
  assert.equal(plan.log.campo, 'CORTE PEDIDO')
  assert.match(plan.log.despues, /PENDIENTE/)
  assert.match(plan.log.despues, /no hay talla M/)
})

test('falta algo sin prendas igual guarda la traba', () => {
  // Un pedido que llego sin prendas es justo el que hay que poder trabar.
  const plan = planFaltaAlgo({
    pedido: PEDIDO, items: [], nota: 'no llegaron las prendas al taller',
    usuario: 'X', ahora: AHORA,
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.itemIds, [])
  assert.equal(plan.columnas.corte_pendiente_nota, 'no llegaron las prendas al taller')
})

// ── La traba bloquea el auto-marcado ───────────────────────────────────────
//
// ☠️ Este es el defecto que el cortador sufría: `debeAutoMarcarCorte` marca la
// prenda como CORTADA sola en cuanto el área la pone EN_PROCESO. Con la bandeja
// filtrada en Pendiente, el pedido se le desaparecía sin que él lo tocara. Si la
// traba no bloqueara esto, el pedido que acaba de trabar se le iría igual — y
// encima diría «6/6 cortados», que es mentira.

test('con el pedido trabado, el area NO marca el corte sola', async () => {
  const { debeAutoMarcarCorte } = await import('../lib/prendaEventos.js')
  const item = { ITEM_ID: 'I1', PEDIDO_ID: 'MAN-AND-5599', SUBESTADO_CORTE: 'PENDIENTE' }

  assert.equal(debeAutoMarcarCorte(item, 'EN_PROCESO'), true, 'sin traba, sigue igual que siempre')
  assert.equal(debeAutoMarcarCorte(item, 'EN_PROCESO', { trabado: true }), false,
    'trabado, la prenda se queda pendiente hasta que el cortador la suelte')
})

test('con el pedido trabado tampoco se REGISTRA un corte automatico', async () => {
  const { eventosDelCambio } = await import('../lib/prendaEventos.js')
  const item = {
    ITEM_ID: 'I1', PEDIDO_ID: 'MAN-AND-5599',
    AREA: 'ESTAMPADO', SUBESTADO: 'SOLICITADO', SUBESTADO_CORTE: 'PENDIENTE',
  }

  const sinTraba = eventosDelCambio({ item, estadoNuevo: 'EN_PROCESO', usuario: 'DAVID' })
  assert.equal(sinTraba.filter((e) => e.area === 'CORTE').length, 1)

  const conTraba = eventosDelCambio({ item, estadoNuevo: 'EN_PROCESO', usuario: 'DAVID', trabado: true })
  assert.equal(conTraba.filter((e) => e.area === 'CORTE').length, 0,
    'el evento diria CORTADO mientras la prenda sigue pendiente: dos verdades distintas')
  assert.equal(conTraba.filter((e) => e.area === 'ESTAMPADO').length, 1,
    'el trabajo del area SI se registra: la traba es de corte, no del area')
})

// ── La pantalla y la ruta, vigiladas desde la fuente ───────────────────────

import { readFileSync } from 'node:fs'

const pantalla = readFileSync(new URL('../app/dashboard/corte/page.js', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/corte/pedido/[id]/route.js', import.meta.url), 'utf8')
const repoCorte = readFileSync(new URL('../lib/db/corte.js', import.meta.url), 'utf8')
const rutaItem = readFileSync(new URL('../app/api/pedidos/item/[id]/route.js', import.meta.url), 'utf8')

// Sin comentarios: la nota que documenta el defecto suele contener el patrón que
// la prueba persigue, y entonces la prueba se cita a sí misma.
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('la pantalla manda UNA peticion por pedido, no una por prenda', () => {
  assert.ok(pantalla.includes('/api/corte/pedido/'), 'debe llamar al endpoint del pedido')
  const fn = pantalla.slice(pantalla.indexOf('async function accionPedido'), pantalla.indexOf('const hayFecha'))
  assert.ok(!/for\s*\(|\.map\([^)]*fetch|Promise\.all/.test(fn),
    'un bucle de fetch deja el pedido a medio marcar si el cuarto falla')
})

test('la pantalla pinta lo que respondio el servidor, no lo que pidio', () => {
  const fn = pantalla.slice(pantalla.indexOf('async function accionPedido'), pantalla.indexOf('const hayFecha'))
  assert.ok(/if \(!res\.ok\)/.test(fn), 'sin mirar res.ok, un 403 se ve como corte guardado')
  assert.ok(/data\.subestado/.test(fn), 'el estado nuevo sale de la respuesta')
  assert.ok(!/SUBESTADO_CORTE: 'CORTADO'/.test(fn), 'no se pinta el verde a mano')
})

test('ningun filtro de ESTADO esconde un pedido trabado', () => {
  const codigo = sinComentarios(pantalla)
  assert.ok(/\.filter\(p => p\.itemsFiltrados\.length > 0 \|\| p\.COMPLETO === false \|\| estaTrabado\(p\)\)/.test(codigo),
    'la traba es la promesa de que el pedido no se mueve hasta que el cortador lo suelte')
})

test('la bandeja trae la traba y la cuenta', () => {
  assert.ok(/corte_pendiente_nota/.test(repoCorte), 'sin la columna, la pantalla no puede pintar el chip')
  assert.ok(/trabados/.test(repoCorte), 'el meta lleva cuantos pedidos estan parados')
  assert.ok(/const COLS_PEDIDO = \[[\s\S]*?\]\.join\(','\)/.test(sinComentarios(repoCorte)),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})

test('la ruta exige sesion y rol de corte, y NO acepta el usuario del navegador', () => {
  assert.ok(/sesionActual\(\)/.test(ruta), 'la identidad sale de la cookie')
  assert.ok(/ROLES_PERMITIDOS = \['ADMIN', 'CORTE'\]/.test(ruta))
  assert.ok(!/body\._usuarioId|body\.usuario\b/.test(ruta),
    'el navegador no decide quien firma el trabajo')
  assert.ok(!/\?rol=|searchParams\.get\('rol'\)/.test(ruta), 'ni el rol')
})

test('la ruta solo actua sobre pedidos EN_FABRICA', () => {
  assert.ok(/ESTADO_PEDIDO !== 'EN_FABRICA'/.test(ruta),
    'cortar un pedido que ya salio de fabrica escribe un corte que nadie vera')
})

test('la ruta escribe las prendas ANTES que la traba del pedido', () => {
  const lote = ruta.indexOf('updateSubestadoCorteLote')
  const columnas = ruta.indexOf('updateCorteDePedido')
  assert.ok(lote > 0 && columnas > lote,
    'al reves, el pedido quedaria trabado con sus prendas diciendo otra cosa')
})

test('la ruta await-ea la bitacora y los eventos', () => {
  // En serverless la instancia se congela al responder: sin await, el registro
  // muere justo cuando hay algo que registrar.
  assert.ok(/await logCambio\(/.test(ruta))
  assert.ok(/await registrarEventosPrenda\(/.test(ruta))
})

test('el auto-marcado del area respeta la traba', () => {
  assert.ok(/tieneTrabaDeCorte\(item\.PEDIDO_ID\)/.test(rutaItem))
  assert.ok(/debeAutoMarcarCorte\(item, nuevoEstado, \{ trabado \}\)/.test(rutaItem),
    'sin esto, el pedido recien trabado se va de la bandeja en cuanto el area lo toque')
  assert.ok(/eventosDelCambio\(\{[^}]*trabado[^}]*\}\)/.test(rutaItem),
    'el evento diria CORTADO mientras la prenda sigue pendiente')
})

test('la caja de texto lleva className input: sin el se escribe a ciegas', () => {
  // El navegador pinta el textarea blanco y la pagina hereda texto blanco.
  const comp = pantalla.slice(pantalla.indexOf('function AccionesCortePedido'), pantalla.indexOf('function CorteCard'))
  assert.ok(/<textarea[\s\S]*?className="input/.test(comp))
  assert.ok(/disabled=\{guardando/.test(comp), 'dos toques seguidos mandarian dos peticiones')
})
