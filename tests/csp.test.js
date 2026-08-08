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
  //
  // Ojo con el regex ingenuo /frame-ancestors[^;'"]*\*/: la clase [^;'"]*
  // deja de escanear apenas topa con la comilla de 'self' (que en el valor
  // real viene JUSTO después de frame-ancestors), así que solo atrapa un
  // comodín puesto ANTES de 'self'. Un comodín agregado al final de la
  // lista —que es justo donde alguien pegaría un origen nuevo— se le
  // escapaba sin que la prueba fallara.
  //
  // Por eso acá se extrae el valor completo de la directiva (hasta el `;`
  // que cerraría otra directiva, o hasta la comilla doble que cierra el
  // string de JS) y se revisa CADA TOKEN por separado: ninguno puede ser
  // '*' ni contener '*' (ej. https://*.evil.com), sin importar en qué
  // posición esté.
  const match = config.match(/frame-ancestors([^";]*)/)
  assert.ok(match, 'no se encontró la directiva frame-ancestors')
  const tokens = match[1].trim().split(/\s+/).filter(Boolean)
  assert.ok(tokens.length > 0, 'frame-ancestors no tiene ningún origen')
  for (const token of tokens) {
    assert.ok(!token.includes('*'), `token con comodín encontrado: ${token}`)
  }
})
