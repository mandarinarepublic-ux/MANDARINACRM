// Si la CSP y la lista de orígenes se desincronizan, el inbox nuevo carga en
// blanco dentro del iframe y el navegador solo lo dice en la consola. Esta
// prueba es la que avisa antes de que pase.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { ORIGENES_INBOX } from '../lib/origenes.js'

const config = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8')

test('la CSP declara frame-ancestors', () => {
  assert.match(config, /frame-ancestors/)
})

test('cada origen de la lista está en la CSP', () => {
  for (const origen of ORIGENES_INBOX) {
    assert.ok(config.includes(origen), `falta ${origen} en la CSP de next.config.js`)
  }
})

test('la CSP NO usa comodín', () => {
  // frame-ancestors * deja que cualquiera enmarque el CRM: clickjacking servido.
  assert.doesNotMatch(config, /frame-ancestors[^;'"]*\*/)
})
