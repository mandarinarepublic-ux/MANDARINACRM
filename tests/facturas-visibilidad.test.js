import test from 'node:test'
import assert from 'node:assert'
import { yaFacturado, pidioFactura, botonFactura, decidirEmision } from '../lib/facturas-visibilidad.js'

// El botón de emitir factura llevaba meses escrito en la pantalla del pedido y
// NO SE DIBUJÓ NI UNA VEZ: preguntaba por `pedido.EMITIR_FACTURA` y la API
// devuelve `FACTURA_SOLICITADA`. `undefined === 'TRUE'` es falso siempre.
//
// Misma familia que el bug de las fotos entrantes y el de los audios: la
// pantalla mirando un campo que nadie llena. Por eso la decisión vive acá,
// donde se puede probar, y no suelta en el JSX.

function pedido(over = {}) {
  return {
    PEDIDO_ID: 'MAN-AND-9000',
    FACTURA_SOLICITADA: 'TRUE',
    FACTURA_ID: '',
    FACTURA_PDF_URL: '',
    ...over,
  }
}

test('sin FACTURA_ID no está facturado', () => {
  assert.equal(yaFacturado(pedido()), false)
})

test('con FACTURA_ID está facturado', () => {
  assert.equal(yaFacturado(pedido({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })), true)
})

test('con solo FACTURA_PDF_URL también está facturado', () => {
  // Los pedidos viejos de Make guardaron la URL sin el id de Dátil. Si no se
  // miraran las dos, el botón reaparecería en pedidos YA facturados y apretarlo
  // emitiría una SEGUNDA factura al SRI.
  assert.equal(yaFacturado(pedido({ FACTURA_PDF_URL: 'https://link.datil.co/invoices/x/ride' })), true)
})

test('sin pedido no hay botón', () => {
  // Un pedido que todavía no cargó no puede ofrecer emitir al SRI. Ante la
  // duda, el que NO se puede deshacer no se ofrece.
  assert.equal(yaFacturado(null), false)
  assert.equal(pidioFactura(null), false)
  assert.equal(botonFactura(null, 'ADMIN'), null)
  assert.equal(botonFactura(undefined, 'ADMIN'), null)
})

test('pidioFactura acepta TRUE, true y minúsculas', () => {
  // boolStr (lib/db/_backend.js:74) devuelve 'TRUE'/'FALSE' hoy. Se tolera el
  // booleano real y la minúscula para que el día que cambie el backend la
  // pantalla no se apague EN SILENCIO otra vez, que es justo lo que pasó.
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'TRUE' })), true)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'true' })), true)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: true })), true)
})

test('pidioFactura es falso con FALSE, vacío o ausente', () => {
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'FALSE' })), false)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: '' })), false)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: undefined })), false)
})

test('pidió factura y no la tiene -> botón PENDIENTE', () => {
  assert.equal(botonFactura(pedido(), 'ADMIN'), 'PENDIENTE')
})

test('no pidió factura y no la tiene -> botón OPCIONAL', () => {
  // No falta nada: facturar o no es una decisión del negocio. Se ofrece, pero
  // apagado, para no pintar como pendiente algo que nadie pidió.
  assert.equal(botonFactura(pedido({ FACTURA_SOLICITADA: 'FALSE' }), 'ADMIN'), 'OPCIONAL')
})

test('ya facturado -> NO hay botón, haya pedido factura o no', () => {
  // Esta es la regla que evita la factura duplicada al SRI.
  const conId = pedido({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })
  assert.equal(botonFactura(conId, 'ADMIN'), null)
  assert.equal(botonFactura({ ...conId, FACTURA_SOLICITADA: 'FALSE' }, 'ADMIN'), null)
})

test('solo ADMIN ve el botón', () => {
  // Emitir al SRI no se deshace.
  assert.equal(botonFactura(pedido(), 'VENDEDOR'), null)
  assert.equal(botonFactura(pedido(), 'PRODUCCION'), null)
  assert.equal(botonFactura(pedido(), undefined), null)
})

// El candalo de /api/factura/emitir no tenía ni una prueba propia. Es el
// camino que emite al SRI: si se equivoca, o queda un pedido sin factura o
// sale una factura duplicada, y ninguna de las dos se deshace.

test('un pedido que no existe no se factura', () => {
  // Antes, un UPDATE que no encontraba filas devolvía error: null y eso se
  // reportaba como éxito. Un pedido inexistente tiene que FALLAR, no pasar.
  assert.deepEqual(decidirEmision(null), { accion: 'NO_EXISTE' })
  assert.deepEqual(decidirEmision(undefined), { accion: 'NO_EXISTE' })
})

test('un pedido con FACTURA_ID no se vuelve a facturar, y devuelve su RIDE', () => {
  const r = decidirEmision({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })
  assert.equal(r.accion, 'YA_FACTURADA')
  assert.equal(r.datilId, '51b3f2a1bae045bfbdae9b52ed40982e')
  assert.equal(r.rideUrl, 'https://link.datil.co/invoices/51b3f2a1bae045bfbdae9b52ed40982e/ride')
})

test('un pedido viejo con solo FACTURA_PDF_URL tampoco se refactura', () => {
  // Los pedidos que emitió Make guardaron la URL sin el id de Dátil. Si este
  // caso se colara, se emitiría una SEGUNDA factura de algo ya facturado.
  const r = decidirEmision({ FACTURA_PDF_URL: 'https://link.datil.co/invoices/abc/ride' })
  assert.equal(r.accion, 'YA_FACTURADA')
  assert.equal(r.rideUrl, 'https://link.datil.co/invoices/abc/ride')
})

test('un pedido sin factura sí se emite', () => {
  // El camino normal no puede haberse roto por poner el candado.
  assert.deepEqual(decidirEmision({ PEDIDO_ID: 'MAN-AND-9000', FACTURA_ID: '', FACTURA_PDF_URL: '' }), { accion: 'EMITIR' })
})
