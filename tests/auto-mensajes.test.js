import test from 'node:test'
import assert from 'node:assert'
import { armarPanel, limpiarMensaje, rellenar, DISPARADORES, textoPorDefecto } from '../lib/autoMensajes.js'
import { ETAPAS_CLIENTE } from '../lib/etapaCliente.js'

test('un disparador por cada etapa de la página pública', () => {
  assert.equal(DISPARADORES.length, ETAPAS_CLIENTE.length)
})

test('sin nada guardado: 5 mensajes, todos APAGADOS, con texto por defecto', () => {
  const p = armarPanel('ind', [])
  assert.equal(p.length, 5)
  assert.ok(p.every((m) => m.activo === false && m.texto && m.media_url === null))
  assert.match(p[4].texto, /Ind Store/)
  assert.doesNotMatch(textoPorDefecto('mandarina', 4), /\{tienda\}/)
})

test('lo guardado de UNA tienda no se mezcla con la otra', () => {
  const filas = [{ tienda: 'mandarina', etapa: 3, activo: true, texto: 'Va en camino', media_url: null, media_tipo: null }]
  assert.equal(armarPanel('mandarina', filas)[3].activo, true)
  assert.equal(armarPanel('ind', filas)[3].activo, false)
  // Los demás de Mandarina siguen apagados: cada uno es independiente.
  assert.deepEqual(armarPanel('mandarina', filas).map((m) => m.activo), [false, false, false, true, false])
})

test('limpiarMensaje rechaza lo inválido', () => {
  const ok = { tienda: 'ind', etapa: 0, activo: true, texto: 'Hola' }
  assert.ok(limpiarMensaje(ok).valor)
  assert.ok(limpiarMensaje({ ...ok, tienda: 'yaw' }).error)
  assert.ok(limpiarMensaje({ ...ok, etapa: 5 }).error)
  assert.ok(limpiarMensaje({ ...ok, etapa: '1.5' }).error)
  assert.ok(limpiarMensaje({ ...ok, texto: '   ' }).error)
  assert.ok(limpiarMensaje({ ...ok, texto: 'x'.repeat(1001) }).error)
  assert.ok(limpiarMensaje({ ...ok, media_url: 'http://x.com/a.png', media_tipo: 'imagen' }).error)
  assert.ok(limpiarMensaje({ ...ok, media_url: 'https://x.com/a.pdf', media_tipo: 'documento' }).error)
})

test('activo solo con true real; sin adjunto, el tipo se descarta', () => {
  const v = limpiarMensaje({ tienda: 'mandarina', etapa: '2', activo: 'true', texto: ' Hola ', media_tipo: 'audio' }).valor
  assert.equal(v.activo, false)
  assert.equal(v.etapa, 2)
  assert.equal(v.texto, 'Hola')
  assert.equal(v.media_tipo, null)
})

test('rellenar cambia las variables conocidas y deja las otras', () => {
  assert.equal(rellenar('Hola {nombre}, {pedido} {x}', { nombre: 'Ana', pedido: 'MAN-JAC-1' }), 'Hola Ana, MAN-JAC-1 {x}')
})
