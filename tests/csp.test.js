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

import { ORIGENES_TIENDA } from '../lib/origenes.js'

test('la tienda puede enmarcar SOLO /pedido', () => {
  // Bloque de /pedido: lleva los orígenes de la tienda.
  const bloque = config.match(/source:\s*'\/pedido'[\s\S]*?frame-ancestors([^"]*)"/)
  assert.ok(bloque, 'falta la regla de /pedido en next.config.js')
  for (const o of ORIGENES_TIENDA) assert.ok(bloque[1].includes(o), `falta ${o} en la CSP de /pedido`)
  // Regla general: NO los lleva (el resto del CRM no se puede enmarcar desde la tienda).
  const general = config.match(/source:\s*'\/:path\*'[\s\S]*?frame-ancestors([^"]*)"/)
  for (const o of ORIGENES_TIENDA) assert.ok(!general[1].includes(o), `${o} no debe poder enmarcar todo el CRM`)
})

test('la regla de /pedido va DESPUÉS de la general (Next: la última gana)', () => {
  assert.ok(config.indexOf("source: '/pedido'") > config.indexOf("source: '/:path*'"))
})
