import test from 'node:test'
import assert from 'node:assert'
import {
  patronSinTildes, tipoDeBusqueda, pareceNumeroDeGuia, puntuarCliente, fotoSegura, ordenarResultados, palabrasParaBuscar,
} from '../lib/consulta-guias.js'

// Postgres usa \m \M para el borde de palabra; JS usa \b (vale para estas pruebas).
const comoJs = (p) => new RegExp(p.replace(/\\[mM]/g, '\\b'), 'i')

test('el patrón ignora tildes y la ñ', () => {
  assert.equal(patronSinTildes('AMBAR'), '[aáàäâ]mb[aáàäâ]r')
  assert.ok(comoJs(patronSinTildes('ambar')).test('Ámbar Rosado'))
  for (const q of ['Muñoz', 'MUNOZ']) assert.ok(comoJs(patronSinTildes(q)).test('Carla Muñoz'), q)
})

test('una palabra corta va ENTERA: "Ana" no trae a "Mariana"', () => {
  const re = comoJs(patronSinTildes('Ana', { palabraEntera: true }))
  assert.ok(re.test('Ana Paz'))
  assert.ok(!re.test('Mariana Paz'))
})

test('qué escribió: pedido, número o texto', () => {
  assert.deepEqual(tipoDeBusqueda('man-and-6314'), { tipo: 'pedido', valor: 'MAN-AND-6314' })
  assert.equal(tipoDeBusqueda('AND-6314').tipo, 'pedido')
  assert.deepEqual(tipoDeBusqueda('098 697 9499'), { tipo: 'numero', valor: '0986979499' })
  assert.equal(tipoDeBusqueda('9036835780').tipo, 'numero')
  // ☠️ Una dirección con guion NO es un pedido.
  assert.equal(tipoDeBusqueda('Milagro-Guayas P. Macias').tipo, 'texto')
  assert.equal(tipoDeBusqueda('   ').tipo, 'vacio')
})

test('número de guía: sí las de Servientrega, no celulares ni cédulas', () => {
  for (const q of ['9036835780', '90368', '9036 8357 80']) assert.equal(pareceNumeroDeGuia(q), true, q)
  for (const q of ['0986979499', '986979499', '593986979499', '0942115593', 'Ana 9036', '903']) {
    assert.equal(pareceNumeroDeGuia(q), false, q)
  }
})

const AMBAR = { nombre: 'Ámbar Rosado Espinoza ', celular: '0986979499', cedula: '0942115593', direccion: 'Milagro-Guayas: P.Macias 810', ciudad: 'Milagro' }

test('puntos y razones: celular, cédula, nombre y dirección', () => {
  assert.deepEqual(puntuarCliente(AMBAR, { numero: '593986979499' }).razones, ['📱 celular'])
  assert.deepEqual(puntuarCliente(AMBAR, { numero: '0942115593' }).razones, ['🪪 cédula'])
  assert.deepEqual(puntuarCliente(AMBAR, { texto: 'ambar rosado' }).razones, ['👤 nombre 2/2'])
  assert.deepEqual(puntuarCliente(AMBAR, { texto: 'macias' }).razones, ['📍 dirección'])
  assert.equal(puntuarCliente(AMBAR, { texto: 'luis' }).puntos, 0)
  // "ana" corta: entera, no como pedazo de "Mariana".
  assert.equal(puntuarCliente({ nombre: 'Mariana Paz' }, { texto: 'ana' }).puntos, 0)
})

test('palabras para buscar: sin números ni repetidas, las largas primero', () => {
  assert.deepEqual(palabrasParaBuscar('Ana Rosado 810 rosado Espinoza'), ['espinoza', 'rosado', 'ana'])
})

test('la foto solo se enlaza si es http(s)', () => {
  assert.equal(fotoSegura('https://x.supabase.co/f.jpg'), 'https://x.supabase.co/f.jpg')
  assert.equal(fotoSegura('javascript:alert(1)'), '')
  assert.equal(fotoSegura(null), '')
})

test('orden: más puntos primero; a igualdad, el más nuevo', () => {
  const r = ordenarResultados([
    { pedido_id: 'A', puntos: 10, fecha_pedido: '2026-10-01' },
    { pedido_id: 'B', puntos: 10, fecha_pedido: '2026-11-01' },
    { pedido_id: 'C', puntos: 60, fecha_pedido: '2026-01-01' },
  ]).map((x) => x.pedido_id)
  assert.deepEqual(r, ['C', 'B', 'A'])
})
