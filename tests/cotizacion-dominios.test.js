// tests/cotizacion-dominios.test.js
//
// ☠️ La cotizacion imprime la direccion web DOS veces en el documento que se le
// manda al cliente (CotizacionPreview: el pie de la firma y el pie de pagina).
// Estuvo mandando a `www.mandarinarepublic.com`, que no existe: el cliente que
// la escribia no llegaba a ninguna parte y nadie se enteraba, porque un dominio
// muerto no da error en el CRM — falla en el navegador del cliente.
//
// Los dominios confirmados en el admin de cada tienda de Shopify:
//   Mandarina Republic → mandarinaec.com
//   Ind Store          → indlovers.com
import test from 'node:test'
import assert from 'node:assert'
import { tiendaTheme, themeFor } from '../lib/tiendaTheme.js'

test('☠️ Mandarina apunta a mandarinaec.com, no al dominio muerto', () => {
  assert.equal(tiendaTheme.mandarina.web, 'www.mandarinaec.com')
  assert.ok(!/mandarinarepublic/i.test(tiendaTheme.mandarina.web),
    'volvio el dominio que no existe')
})

test('☠️ Ind Store apunta a indlovers.com, no a indstore.ec', () => {
  // La cotizacion era el UNICO sitio del CRM que decia indstore.ec: el cupon de
  // la hoja de pedido y el panel de productos ya usaban indlovers.com.
  assert.equal(tiendaTheme.indstore.web, 'www.indlovers.com')
  assert.ok(!/indstore\.ec/i.test(tiendaTheme.indstore.web), 'volvio indstore.ec')
})

test('ninguna tienda queda sin direccion web', () => {
  // Sin esto el documento imprimiria «undefined» donde va la web.
  for (const [clave, th] of Object.entries(tiendaTheme)) {
    assert.ok(th.web && th.web.trim(), `${clave} se quedo sin web`)
    assert.ok(th.web.includes('.'), `${clave} tiene una web que no parece dominio`)
  }
})

test('una tienda desconocida cae en Mandarina, no en undefined', () => {
  assert.equal(themeFor('LO QUE SEA').web, 'www.mandarinaec.com')
  assert.equal(themeFor(undefined).web, 'www.mandarinaec.com')
})
