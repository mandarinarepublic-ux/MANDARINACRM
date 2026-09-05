// El contexto de un error, y cómo se lee en el cuadro de errores.
//
// POR QUÉ EXISTE. El 4-sep-2026 el tablero de errores mostró esto y nada más:
//
//     El Historial fallo al cargar: Requested range not satisfiable
//
// Sin quién lo sufrió, qué filtros tenía puestos, qué página pidió ni el código
// del error. Reconstruirlo costó varias consultas a la base, y todo eso podía
// haber estado guardado: la tabla `crm.eventos_sistema` tiene una columna
// `detalle` (jsonb) desde siempre.
//
// Y había un segundo problema. De los 745 eventos, 634 SÍ traían contexto
// guardado — y la pantalla pintaba UN solo campo, con una condición a mano:
//
//     {!ev.pedido_id && ev.detalle?.origen === 'inbox' && ev.detalle?.telefono && ...}
//
// ☠️ Eso es una LISTA BLANCA: cualquier clave que no sea ese teléfono es
// invisible. Es el mismo defecto que en este sistema ya escondió clientes en el
// inbox cuatro veces y que el 4-sep escondió 18 pedidos de Bordado.
//
// LA REGLA DE ESTE ARCHIVO: se pinta lo que HAY, no lo que alguien previó. Un
// campo nuevo aparece solo, sin tocar código. Hay una prueba con una clave
// inventada que se cae si alguien repone una lista blanca.
//
// ⚠️ Import RELATIVO, no `@/`: `node --test` no entiende el alias.
import test from 'node:test'
import assert from 'node:assert'
import { contextoDeError, filasDeDetalle } from '../lib/detalle-evento.js'

// ── contextoDeError: qué se guarda cuando algo falla ──────────────────────────

test('guarda el código del error, que es lo único buscable', () => {
  const d = contextoDeError({ error: { code: 'PGRST103', message: 'Requested range not satisfiable' } })
  assert.equal(d.codigo, 'PGRST103')
  assert.equal(d.error, 'Requested range not satisfiable')
})

test('guarda ruta, usuario y los parámetros de la petición', () => {
  const d = contextoDeError({
    error: new Error('boom'),
    ruta: '/api/historial',
    usuario: { id: 'uuid-007', nombre: 'CAMILA', rol: 'ADMIN' },
    params: { pagina: '15', area: 'ESTAMPADO', estado: 'TODOS' },
  })
  assert.equal(d.ruta, '/api/historial')
  assert.equal(d.usuario, 'CAMILA')
  assert.equal(d.usuarioId, 'uuid-007')
  assert.equal(d.rol, 'ADMIN')
  assert.deepEqual(d.params, { pagina: '15', area: 'ESTAMPADO', estado: 'TODOS' })
})

test('☠️ reconoce al usuario venga en mayúsculas o en minúsculas', () => {
  // Los repos devuelven USUARIO_ID/NOMBRE/ROL y la cookie id/nombre/rol. Mirar
  // solo una forma dejaría la mitad de los errores sin dueño, en silencio.
  const enMayus = contextoDeError({ error: new Error('x'), usuario: { USUARIO_ID: 'u1', NOMBRE: 'CAMILA', ROL: 'ADMIN' } })
  assert.equal(enMayus.usuario, 'CAMILA')
  assert.equal(enMayus.usuarioId, 'u1')
  assert.equal(enMayus.rol, 'ADMIN')
})

test('un error sin código no inventa uno', () => {
  const d = contextoDeError({ error: new Error('se cayó') })
  assert.equal(d.error, 'se cayó')
  assert.ok(!('codigo' in d), 'sin código, la clave no aparece: mejor ausente que inventada')
})

test('☠️ nunca guarda la contraseña ni tokens que vengan en los params', () => {
  const d = contextoDeError({
    error: new Error('x'),
    params: { pagina: '2', token: 'secreto', authorization: 'Bearer abc', apiKey: 'k' },
  })
  assert.equal(d.params.pagina, '2')
  for (const k of ['token', 'authorization', 'apiKey']) {
    assert.ok(!(k in d.params), `${k} no puede quedar guardado en la base`)
  }
})

test('sin nada que contar, devuelve un objeto vacío y no null', () => {
  // Un `detalle` vacío es distinto de "no se intentó": deja ver que el error
  // llegó sin contexto, que es un defecto a arreglar, no un misterio.
  assert.deepEqual(contextoDeError({}), {})
  assert.deepEqual(contextoDeError(), {})
})

// ── filasDeDetalle: cómo se pinta, por REGLA ──────────────────────────────────

test('pinta TODAS las claves, no una lista elegida', () => {
  const filas = filasDeDetalle({ codigo: 'PGRST103', ruta: '/api/historial', usuario: 'CAMILA' })
  assert.deepEqual(filas.map(f => f.clave), ['codigo', 'ruta', 'usuario'])
})

test('☠️ una clave que nadie previó aparece igual', () => {
  // Esta prueba se cae si alguien repone una lista blanca. Es su único trabajo.
  const filas = filasDeDetalle({ inventadaQueNadiePreVio: 'valor' })
  assert.equal(filas.length, 1)
  assert.equal(filas[0].clave, 'inventadaQueNadiePreVio')
  assert.equal(filas[0].valor, 'valor')
})

test('lo anidado se aplana, no se esconde', () => {
  const filas = filasDeDetalle({ params: { pagina: '15', area: 'ESTAMPADO' } })
  assert.deepEqual(filas.map(f => f.clave), ['params.pagina', 'params.area'])
  assert.equal(filas[1].valor, 'ESTAMPADO')
})

test('un valor vacío se muestra como vacío, no se omite', () => {
  // "El campo existe y vino vacío" y "el campo no existe" son cosas distintas y
  // tienen que verse distintas. Omitirlo es el bug de siempre.
  const filas = filasDeDetalle({ area: '', gasto: 0, resuelto: false, cliente: null })
  assert.deepEqual(filas.map(f => f.clave), ['area', 'gasto', 'resuelto', 'cliente'])
  assert.equal(filas[0].valor, '—')
  assert.equal(filas[1].valor, '0', 'un cero es un dato, no un vacío')
  assert.equal(filas[2].valor, 'false')
  assert.equal(filas[3].valor, '—')
})

test('las listas se muestran enteras, con su tamaño', () => {
  const filas = filasDeDetalle({ ids: ['a', 'b', 'c'] })
  assert.equal(filas[0].clave, 'ids')
  assert.ok(filas[0].valor.includes('a'), 'el contenido se ve')
  assert.ok(/3/.test(filas[0].valor), 'y cuántos son')
})

test('un detalle ausente o vacío no revienta la pantalla', () => {
  assert.deepEqual(filasDeDetalle(null), [])
  assert.deepEqual(filasDeDetalle(undefined), [])
  assert.deepEqual(filasDeDetalle({}), [])
  assert.deepEqual(filasDeDetalle('un texto suelto').map(f => f.clave), ['detalle'])
})

test('un valor larguísimo se recorta para pintar pero se avisa', () => {
  const largo = 'x'.repeat(500)
  const [fila] = filasDeDetalle({ cuerpo: largo })
  assert.ok(fila.valor.length < 500, 'no rompe el ancho de la tarjeta')
  assert.equal(fila.completo, largo, 'pero el valor entero sigue disponible para copiar')
})
