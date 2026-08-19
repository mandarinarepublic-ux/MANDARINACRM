// Prueba de FUENTE, no de render: montar el componente pediría todo el bundler de
// Next. Lo que vigila es barato y concreto — que nadie reponga el filtro que
// escondía los pedidos ni vuelva a pedir la lista completa con `?rol=ADMIN`.
//
// Ese filtro (`.filter(p => p.itemsFiltrados.length > 0)`) borraba por igual dos
// casos opuestos: "este pedido no tiene prendas PARA TI" (correcto, y lo hace el
// servidor) y "a este pedido no le LLEGARON las prendas" (el bug). 21 pedidos
// invisibles, 14 días, sin que nadie lo reportara — porque la pantalla decía
// "✅ ¡Todo al día!".
//
// Mismo patrón que tests/embed-ancho.test.js.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/produccion/page.js', import.meta.url), 'utf8')

test('la bandeja pide su endpoint propio, no la lista completa', () => {
  assert.ok(src.includes("'/api/produccion'"), 'debe llamar a /api/produccion')
  assert.ok(!src.includes('/api/pedidos?rol=ADMIN'),
    'no debe volver a pedir la lista completa mandando el rol por la url')
})

test('no vuelve el filtro que escondia pedidos sin prendas', () => {
  assert.ok(!/itemsFiltrados\.length\s*>\s*0/.test(src),
    'ese filtro lo hace el servidor; en la pantalla escondia fallos')
})

test('mira res.ok antes de creerle a la respuesta', () => {
  assert.ok(/res\.ok/.test(src),
    'sin mirar res.ok, un 401 o un 500 acaban en "todo al dia"')
})

test('usa estadoBandeja para decidir que pinta', () => {
  assert.ok(src.includes('estadoBandeja'),
    'la decision vive en lib/bandeja-estado.js, probada aparte')
})

test('"Todo al dia" exige que el estado sea VACIO', () => {
  assert.ok(/estado === 'VACIO'/.test(src),
    'no se puede decir que no hay trabajo sin saber que la carga salio bien y completa')
})

test('no quedan reintentos silenciosos', () => {
  assert.ok(!/intentos\s*<\s*3/.test(src),
    'los 3 reintentos convertian un fallo en una espera y despues en "todo al dia"')
})

test('el filtro de areas ya no vive en la pantalla', () => {
  assert.ok(!/function itemEsDeUsuario/.test(src),
    'esta en lib/areas-usuario.js y lo aplica el servidor contra la cookie firmada')
})

test('el boton de recuperar mira COMPLETO, no la cantidad de prendas', () => {
  assert.ok(/COMPLETO === false/.test(src),
    'con itemsFiltrados.length === 0 saldria en los 22 pedidos que no tienen prendas de David')
})

test('se refresca al volver a la pestaña', () => {
  assert.ok(/visibilitychange/.test(src),
    'decision de Rodrigo: refresco al volver a la pestaña')
})
