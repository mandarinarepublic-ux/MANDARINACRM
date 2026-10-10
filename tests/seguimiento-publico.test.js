// La ruta pública /api/publico/pedido la abre cualquiera con un celular y un
// número. Lo que se prueba aquí es lo que la protege: con qué coincide, qué se
// tapa y qué NUNCA sale del servidor.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  celularCoincide, normalizarNumero, pedidoCoincideNumero, taparCedula,
  tieneSaldoPendiente, armarRespuesta, decidirLimite, limpiarPromo, promoVisible,
  LIMITE, TIENDA_PUBLICA,
} from '../lib/seguimientoPublico.js'

test('el celular coincide en cualquier formato (últimos 9 dígitos)', () => {
  for (const escrito of ['0998765678', '+593 99 876 5678', '593998765678', '998765678', '099-876-5678']) {
    assert.ok(celularCoincide(escrito, '0998765678'), escrito)
  }
  assert.ok(celularCoincide('0998765678', '+593998765678'))
})

test('lo vacío o corto nunca coincide, ni con un cliente sin celular', () => {
  assert.equal(celularCoincide('', ''), false)
  assert.equal(celularCoincide('', null), false)
  assert.equal(celularCoincide('5678', '0998765678'), false)
  assert.equal(celularCoincide('0998765678', '0998765679'), false)
})

test('el número de pedido como lo escriba el cliente', () => {
  for (const e of ['6308', ' 6308 ', '#6308', '06308']) {
    assert.deepEqual(normalizarNumero(e), { id: null, numero: '6308' }, e)
  }
  assert.deepEqual(normalizarNumero('man-jac-6308'), { id: 'MAN-JAC-6308', numero: '6308' })
  assert.equal(normalizarNumero(''), null)
  assert.equal(normalizarNumero('abc'), null)
})

test('el número apunta a su pedido y no a uno que termina igual', () => {
  const n = normalizarNumero('6308')
  assert.ok(pedidoCoincideNumero('MAN-JAC-6308', n))
  assert.equal(pedidoCoincideNumero('MAN-JAC-16308', n), false)
  assert.ok(pedidoCoincideNumero('MAN-JAC-6308', normalizarNumero('MAN-JAC-6308')))
  assert.equal(pedidoCoincideNumero('MAN-AND-6308', normalizarNumero('MAN-JAC-6308')), false)
})

test('la cédula tapa los 5 dígitos del medio', () => {
  assert.equal(taparCedula('1712345321'), '17*****321')
  assert.equal(taparCedula('1712345674001'), '1712*****4001')
  assert.equal(taparCedula(''), '')
  assert.equal(taparCedula(null), '')
  assert.equal(taparCedula('12345'), '*****', 'una cédula rara y corta se tapa entera')
})

test('saldo pendiente: misma regla que la hoja del PDF', () => {
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 25, estado_pago: 'ABONO' }), true)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 50, estado_pago: 'ABONO' }), false)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 0, estado_pago: 'PAGADO' }), false)
  assert.equal(tieneSaldoPendiente({ monto_total: 50, monto_abonado: 49.995 }), false, 'menos de un centavo')
  assert.equal(tieneSaldoPendiente({}), false)
})

const muestra = () => ({
  pedido: {
    pedido_id: 'MAN-JAC-6308', tienda_id: 'MANDARINA', estado_pedido: 'COMPLETADO',
    monto_total: 125.5, monto_abonado: 50, monto_pendiente: 75.5, estado_pago: 'ABONO',
    direccion_pedido: 'QUITO\nAv. Amazonas N34-120\nEdificio Torres', notas_vendedor: 'cliente VIP',
  },
  items: [
    { producto_nombre: 'HOODIE PREMIUM', color: 'Negro', talla: 'M', cantidad: '1', precio_unit: '45', subtotal: '45',
      foto_pecho_url: '', foto_espalda_url: 'https://res.cloudinary.com/x/espalda.jpg', eliminado: false },
    { producto_nombre: 'CAMISETA', color: 'Blanco', talla: 'S', cantidad: '2', eliminado: true },
  ],
  cliente: { nombre: 'Valeria Andrade Montalvo', cedula: '1712345321', celular: '0998765678',
    ciudad: 'Quito', email: 'valeria@correo.com', direccion: 'Av. Amazonas N34-120' },
  guia: { numero: '1234567890', transportista: 'Servientrega' },
  etapaInfo: { etapa: 3, fechas: ['a', 'b', 'c', 'd', null], cancelado: false },
})

test('la respuesta lleva lo acordado', () => {
  const r = armarRespuesta(muestra())
  assert.equal(r.pedidoId, 'MAN-JAC-6308')
  assert.equal(r.primerNombre, 'Valeria')
  assert.equal(r.celular, '0998765678', 'el celular va completo')
  assert.equal(r.cedula, '17*****321')
  assert.equal(r.ciudad, 'Quito')
  assert.equal(r.saldoPendiente, true)
  assert.deepEqual(r.guia, { numero: '1234567890', transportista: 'Servientrega' })
  assert.equal(r.prendas.length, 1, 'las prendas eliminadas no se muestran')
  assert.equal(r.prendas[0].foto, 'https://res.cloudinary.com/x/espalda.jpg', 'sin foto de pecho, la de espalda')
  assert.equal(r.prendas[0].cantidad, 1)
})

test('NUNCA salen montos, cédula completa, dirección, email ni notas', () => {
  const json = JSON.stringify(armarRespuesta(muestra()))
  for (const prohibido of ['125.5', '75.5', '1712345321', 'Amazonas', 'valeria@correo.com',
    'cliente VIP', 'monto', 'precio', 'subtotal', 'direccion', 'email', 'notas']) {
    assert.ok(!json.includes(prohibido), `la respuesta filtró «${prohibido}»`)
  }
})

test('la guía solo se muestra desde Tránsito', () => {
  const m = muestra()
  m.etapaInfo = { etapa: 2, fechas: [null, null, null, null, null], cancelado: false }
  assert.equal(armarRespuesta(m).guia, null)
})

test('pedido sin prendas vivas: lista vacía, sin romperse', () => {
  const m = muestra()
  m.items = [{ producto_nombre: 'X', eliminado: true }]
  assert.deepEqual(armarRespuesta(m).prendas, [])
})

test('límite de intentos', () => {
  assert.deepEqual(LIMITE, { ventanaMin: 15, porIp: 10, fallosPorNumero: 5 })
  assert.equal(decidirLimite({ intentosIp: 9, fallosNumero: 4 }), 'ok')
  assert.equal(decidirLimite({ intentosIp: 10, fallosNumero: 0 }), 'bloqueado')
  assert.equal(decidirLimite({ intentosIp: 0, fallosNumero: 5 }), 'bloqueado')
})

test('solo MANDARINA', () => {
  assert.equal(TIENDA_PUBLICA, 'MANDARINA')
})

test('la promo: se limpia, se corta y el link debe ser https', () => {
  const p = limpiarPromo({ activa: 'true', titulo: '  2x1 en camisetas  ', link: 'javascript:alert(1)', codigo: 'x'.repeat(200) })
  assert.equal(p.activa, true)
  assert.equal(p.titulo, '2x1 en camisetas')
  assert.equal(p.link, '', 'un link que no es https se descarta')
  assert.equal(p.codigo.length, 40)
  assert.equal(limpiarPromo({ link: 'https://www.mandarinaec.com/x' }).link, 'https://www.mandarinaec.com/x')
  assert.equal(limpiarPromo(null).activa, false)
})

test('la promo se ve solo prendida y con título', () => {
  assert.equal(promoVisible({ activa: true, titulo: '2x1' }), true)
  assert.equal(promoVisible({ activa: false, titulo: '2x1' }), false)
  assert.equal(promoVisible({ activa: true, titulo: '' }), false)
  assert.equal(promoVisible(null), false)
})

test('la ruta pública está en RUTAS_PUBLICAS del middleware', () => {
  const mw = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8')
  assert.ok(mw.includes("'/api/publico/pedido'"), 'falta /api/publico/pedido en RUTAS_PUBLICAS')
})
