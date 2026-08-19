// Quién ve qué prenda en la bandeja de Producción.
//
// Esto vivía dentro de app/dashboard/produccion/page.js, así que no se podía
// probar: la única forma de saber si David veía sus camisetas era abrir la
// pantalla con su cuenta. Y como vivía en el navegador, el servidor no podía
// aplicarlo — por eso se mandaban las 3.541 filas enteras para que el celular
// descartara el 95 %.
//
// ⚠️ Import RELATIVO, no `@/`: el alias solo lo entiende el bundler de Next y
// `node --test` carga este archivo directo. Con `@/` falla con ERR_MODULE_NOT_FOUND
// y tumba la suite entera.
import test from 'node:test'
import assert from 'node:assert'
import { areasDeUsuario, prendaEsDelUsuario } from '../lib/areas-usuario.js'

test('ADMIN y CORTE ven todas las areas', () => {
  assert.equal(areasDeUsuario('ADMIN', []), null)
  assert.equal(areasDeUsuario('CORTE', []), null)
})

test('TODAS como area es un comodin', () => {
  assert.equal(areasDeUsuario('DISEÑO', ['TODAS']), null)
})

test('David: rol DISEÑO con SUBLIMACION y ESTAMPADO', () => {
  assert.deepEqual(areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO']), ['SUBLIMACION', 'ESTAMPADO'])
})

test('Christian Garzon: rol DISEÑO con BORDADO', () => {
  assert.deepEqual(areasDeUsuario('DISEÑO', ['BORDADO']), ['BORDADO'])
})

test('DISEÑO sin areas NO ve nada (es a proposito)', () => {
  // Un usuario de DISEÑO al que le quitaron todas las areas veia las prendas de
  // TODAS, lo contrario de lo que quiso el admin.
  assert.deepEqual(areasDeUsuario('DISEÑO', []), [])
})

test('un rol de area sin areas asignadas cae en su propio rol', () => {
  assert.deepEqual(areasDeUsuario('SUBLIMACION', []), ['SUBLIMACION'])
  assert.deepEqual(areasDeUsuario('BORDADO', []), ['BORDADO'])
})

test('un rol que no pinta en produccion no ve nada', () => {
  // CAMBIO DELIBERADO: itemEsDeUsuario terminaba en `return true`, asi que un
  // VENDEDOR que escribiera la URL a mano veia TODAS las prendas del taller.
  assert.deepEqual(areasDeUsuario('VENDEDOR', []), [])
  assert.deepEqual(areasDeUsuario('DESPACHO', []), [])
})

test('David ve una prenda de area combinada si una de las suyas esta dentro', () => {
  const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])
  assert.equal(prendaEsDelUsuario('ESTAMPADO', suyas), true)
  assert.equal(prendaEsDelUsuario('ESTAMPADO + BORDADO', suyas), true)
  assert.equal(prendaEsDelUsuario('SUBLIMACION + BORDADO', suyas), true)
  assert.equal(prendaEsDelUsuario('BORDADO', suyas), false)
})

test('las areas que no son de taller no son de nadie', () => {
  // 'PRODUCTO SIN DISEÑO' y 'PREMIUM - SIN DISEÑO' SI se cortan y se confeccionan
  // (regla de Rodrigo, 18-ago-2026), pero no se reparten entre estampado,
  // sublimacion ni bordado: no llevan diseno.
  const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])
  assert.equal(prendaEsDelUsuario('PRODUCTO SIN DISEÑO', suyas), false)
  assert.equal(prendaEsDelUsuario('PREMIUM - SIN DISEÑO', suyas), false)
  assert.equal(prendaEsDelUsuario('ENTREGA EN TIENDA', suyas), false)
})

test('con areas null (ADMIN) toda prenda cuenta, menos la vacia', () => {
  assert.equal(prendaEsDelUsuario('BORDADO', null), true)
  assert.equal(prendaEsDelUsuario('PRODUCTO SIN DISEÑO', null), true)
  assert.equal(prendaEsDelUsuario('', null), false)
})

test('las areas llegan como CSV desde la base y hay que normalizarlas', () => {
  // crm.usuarios.areas es text[], pero toUsuarioPublico lo devuelve como CSV.
  assert.deepEqual(areasDeUsuario('DISEÑO', [' sublimacion ', 'estampado']), ['SUBLIMACION', 'ESTAMPADO'])
})

test('basura no revienta', () => {
  assert.equal(prendaEsDelUsuario(null, ['BORDADO']), false)
  assert.equal(prendaEsDelUsuario(undefined, null), false)
  assert.deepEqual(areasDeUsuario(null, null), [])
  assert.deepEqual(areasDeUsuario('DISEÑO', ['INVENTADA']), [])
})
