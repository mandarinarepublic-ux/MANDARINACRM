// Pruebas de la cookie de sesión. Corren con `npm test` (runner de Node, sin
// dependencias). Lo que se prueba es la FORMA de la cabecera Set-Cookie, que es
// lo que decide si el inbox recibe la sesión o no.
const test = require('node:test')
const assert = require('node:assert')

// lib/sesion.js es ESM; se importa dinámicamente y se recarga por prueba para
// que cada una vea su propio valor de COOKIE_DOMINIO.
async function cargarSesion() {
  const mod = await import(`../lib/sesion.js?v=${Math.random()}`)
  return mod
}

test('sin COOKIE_DOMINIO la cookie es exactamente igual que antes del cambio', async () => {
  // Prueba que falla si el orden de atributos es diferente. El RFC 6265 no da
  // significado al orden, pero esta propiedad sostiene que el despliegue sin
  // COOKIE_DOMINIO no cambia nada.
  delete process.env.COOKIE_DOMINIO
  const { cookieSesion } = await cargarSesion()
  const c = cookieSesion('tok')
  assert.strictEqual(c, 'mp_sesion=tok; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax')
})

test('sin COOKIE_DOMINIO la cookie sale host-only, como hoy', async () => {
  delete process.env.COOKIE_DOMINIO
  const { cookieSesion } = await cargarSesion()
  const c = cookieSesion('tok')
  assert.ok(!c.includes('Domain='), `no debía traer Domain: ${c}`)
  assert.ok(c.includes('mp_sesion=tok'))
  assert.ok(c.includes('HttpOnly'))
})

test('con COOKIE_DOMINIO la cookie vale para todos los subdominios', async () => {
  process.env.COOKIE_DOMINIO = '.apps.mandarinaec.com'
  const { cookieSesion } = await cargarSesion()
  assert.ok(cookieSesion('tok').includes('Domain=.apps.mandarinaec.com'))
})

test('la cookie que BORRA lleva el mismo Domain', async () => {
  // Sin esto el navegador borra la cookie host-only y deja viva la del dominio
  // compartido: cerrar sesión no cerraría nada.
  process.env.COOKIE_DOMINIO = '.apps.mandarinaec.com'
  const { cookieBorrada } = await cargarSesion()
  const c = cookieBorrada()
  assert.ok(c.includes('Domain=.apps.mandarinaec.com'))
  assert.ok(c.includes('Max-Age=0'))
})

test('el BOM invisible de PowerShell no rompe el dominio', async () => {
  process.env.COOKIE_DOMINIO = '﻿.apps.mandarinaec.com'
  const { cookieSesion } = await cargarSesion()
  assert.ok(cookieSesion('tok').includes('Domain=.apps.mandarinaec.com'))
})
