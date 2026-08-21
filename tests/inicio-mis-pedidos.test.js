// Inicio y Mis pedidos: las dos ultimas pantallas que pedian la lista completa.
//
// ☠️ Y no era un riesgo futuro: `/api/pedidos` pedia `detalle_pedido` con un
// `.in()` de 690 ids — 1314 filas cuando PostgREST devuelve 1000 como mucho.
// **314 prendas ya se perdian**, falseando el conteo por area y pudiendo dar por
// LISTO un pedido al que solo le faltaban prendas por cargar.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const inicio = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
const apiInicio = readFileSync(new URL('../app/api/inicio/route.js', import.meta.url), 'utf8')
const mis = readFileSync(new URL('../app/dashboard/mis-pedidos/page.js', import.meta.url), 'utf8')
const repoMis = readFileSync(new URL('../lib/db/mis-pedidos.js', import.meta.url), 'utf8')
const apiMis = readFileSync(new URL('../app/api/mis-pedidos/route.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// ─── Inicio ─────────────────────────────────────────────────────────────────

test('Inicio pide su endpoint, no la lista completa', () => {
  assert.ok(/fetch\('\/api\/inicio'/.test(inicio), 'debe llamar a /api/inicio')
  assert.ok(!/api\/pedidos\?vendedor=/.test(inicio), 'no debe traer los 690 pedidos')
  assert.ok(!/function buildStats/.test(inicio), 'los agregados los calcula la base')
})

test('los agregados salen de la BASE', () => {
  assert.ok(/rpc\('resumen_inicio'/.test(apiInicio), 'una sola llamada, el calculo en Postgres')
  assert.ok(!/searchParams\.get\('rol'\)/.test(apiInicio), 'el rol NO puede venir del navegador')
  assert.ok(/sesionActual\(\)/.test(apiInicio), 'quien pregunta se sabe por la cookie firmada')
})

test('un fallo NO se pinta como un panel en ceros', () => {
  // Antes cualquier error dejaba `data` en null y la pantalla mostraba ceros,
  // que se leen como "hoy no se vendio nada".
  const codigo = sinComentarios(inicio)
  assert.ok(/if \(errorTexto \|\| !data\) return/.test(codigo), 'debe haber pantalla de error')
  assert.ok(/if \(!res\.ok\)/.test(codigo), 'sin mirar res.ok, un 401 acaba en ceros')
})

test('listos y enDespacho son NUMEROS, no arreglos', () => {
  const codigo = sinComentarios(inicio)
  assert.ok(/const listos = data\.listos \|\| 0/.test(codigo), 'la base manda el conteo')
  assert.ok(!/listos\.length/.test(codigo), 'un numero no tiene .length')
})

test('☠️ el panel de areas ya no usa allItems', () => {
  // `allItems` traia TODAS las prendas del CRM al navegador, y encima recortadas.
  const codigo = sinComentarios(inicio)
  assert.ok(!/data\.allItems/.test(codigo), 'los conteos vienen agrupados por area desde la base')
  assert.ok(/data\.porAreaUrgente/.test(codigo), 'los urgentes tambien')
})

// ─── Mis pedidos ────────────────────────────────────────────────────────────

test('Mis pedidos pide su endpoint propio', () => {
  assert.ok(/fetch\('\/api\/mis-pedidos'/.test(mis), 'debe llamar a /api/mis-pedidos')
  // Sin comentarios: la nota que explica el bug menciona `scope=mios`, y la
  // prueba se citaria a si misma.
  assert.ok(!/scope=mios/.test(sinComentarios(mis)), 'ese scope NO filtraba en la base: filtraba en memoria')
})

test('☠️ la identidad NO viaja por la URL', () => {
  // Antes se mandaba ?vendedor=&vendedorId=&rol=: los tres los ponia el
  // navegador, asi que cambiando la URL se veian los pedidos de otro vendedor.
  // Sin comentarios: la nota que documenta el bug nombra esos parametros, y la
  // prueba se citaria a si misma.
  const codigo = sinComentarios(mis)
  assert.ok(!/vendedorId=/.test(codigo) && !/rol=\$\{/.test(codigo), 'nada de identidad en la url')
  assert.ok(/sesionActual\(\)/.test(apiMis), 'sale de la cookie firmada')
  assert.ok(/VEN_TODO/.test(apiMis), 'y quien ve todo se decide por rol, en el servidor')
})

test('☠️ sin identidad NO se devuelve todo: se devuelve NADA', () => {
  // Lo contrario seria que un fallo de datos acabe enseñandole a un vendedor los
  // pedidos de los demas.
  assert.ok(/if \(suyos\.length === 0\) return \{ pedidos: \[\], completo: true \}/.test(sinComentarios(repoMis)),
    'sin nombre ni id, lista vacia')
})

test('el filtro por vendedor y estado va EN LA CONSULTA', () => {
  const codigo = sinComentarios(repoMis)
  assert.ok(/\.eq\('estado_pedido', 'EN_FABRICA'\)/.test(codigo))
  assert.ok(/\.in\('vendedor_id', suyos\)/.test(codigo), 'acepta nombre o uuid, como el filtro viejo')
})

test('el conteo de prendas usa el COUNT anidado, que no se trunca', () => {
  assert.ok(/total_prendas:detalle_pedido\(count\)/.test(repoMis),
    'traer las prendas de cada pedido para contarlas era el problema')
  assert.ok(/\{p\.PRENDAS \?\? 0\} prenda/.test(mis), 'y la tarjeta lo pinta')
})

test('mira res.ok y avisa si la lista llego recortada', () => {
  assert.ok(/if \(!res\.ok\)/.test(mis))
  assert.ok(/completo === false/.test(mis))
  assert.ok(/errorTexto \?/.test(sinComentarios(mis)), 'un fallo no puede verse como "no tienes pedidos"')
})

test('el SELECT se arma con join, no concatenando plantillas', () => {
  assert.ok(/const SELECT = \[[\s\S]*?\]\.join\(','\)/.test(sinComentarios(repoMis)),
    'el build se come el separador si se concatenan plantillas — ver el 19-ago-2026')
})
