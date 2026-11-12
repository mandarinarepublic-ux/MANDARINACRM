// Transferencia dentro de la tienda (12-nov-2026): lo que se puede romper sin red.
import test from 'node:test'
import assert from 'node:assert'
import { CUENTAS, cuentaPorId } from '../lib/cuentasBancarias.js'
import {
  ETIQUETA_TRANSFERENCIA, textoAvisoTransferencia, idAvisoTransferencia, idAvisoConfirmacion,
  transferenciaSinConfirmar, cuentaComoAbono, tieneEtiquetaTransferencia, ESTADOS_QUE_EXIGEN_PAGO,
} from '../lib/transferenciaTienda.js'
import { textoAbandono } from '../lib/checkoutTienda.js'

const checkout = {
  id: 'abcdefghij0123456789',
  cliente: { nombre: 'Ana', apellido: 'Pérez', email: 'ana@x.com', celular: '0991234567', cedula: '1712345678' },
  direccion: { direccion: 'Av. Siempre Viva 1', referencia: 'casa azul', ciudad: 'Quito', provincia: 'Pichincha' },
  calculo: {
    lineas: [{ titulo: 'Chaqueta DBZ', variante: 'Naranja / L', cantidad: 1, centavos: 3500 }],
    envio: { title: 'GRATIS en compras $20 o más', centavos: 0 }, total: 3500,
  },
  total_centavos: 3500,
  metodo: 'TRANSFERENCIA',
  banco: 'guayaquil',
}

test('cuentas: las 4 de las respuestas rápidas, con los números exactos', () => {
  assert.deepEqual(CUENTAS.map((c) => c.id), ['pichincha', 'guayaquil', 'produbanco', 'deuna'])
  assert.equal(cuentaPorId('pichincha').numero, '2210996988')
  assert.equal(cuentaPorId('guayaquil').numero, '38180287')
  assert.equal(cuentaPorId('produbanco').numero, '18059046370')
  assert.equal(cuentaPorId('deuna').numero, '7700310145')
  assert.equal(cuentaPorId('deuna').tipo, 'Corriente')
  for (const c of CUENTAS) {
    assert.equal(c.titular, 'RODRIGO CASTILLO')
    assert.equal(c.cedula, '1716608094')
  }
})

test('cuentas: un banco que no existe no se inventa', () => {
  assert.equal(cuentaPorId('bolivariano'), null)
  assert.equal(cuentaPorId(''), null)
  assert.equal(cuentaPorId(undefined), null)
})

test('aviso del inbox: dice transferencia, banco, total, pedido y que hay que verificar', () => {
  const t = textoAvisoTransferencia(checkout, { pedidoId: 'MAN-WEB-6700' })
  assert.match(t.split('\n')[0], /TRANSFERENCIA/)
  assert.match(t, /Banco Guayaquil/)
  assert.match(t, /\$35\.00/)
  assert.match(t, /MAN-WEB-6700/)
  assert.match(t, /Chaqueta DBZ/)
  assert.match(t, /Quito/)
  assert.match(t, /1712345678/)
  assert.match(t, /⚠️.*(verific|confirm)/i)
})

test('ids de aviso: estables e idempotentes', () => {
  assert.equal(idAvisoTransferencia('abc'), 'transferencia_abc')
  assert.equal(idAvisoConfirmacion('p1', 'confirmar'), 'transferencia_confirmar_p1')
  assert.equal(idAvisoConfirmacion('p1', 'rechazar'), 'transferencia_rechazar_p1')
})

test('transferencia sin confirmar: solo TRANSFERENCIA en PENDIENTE', () => {
  assert.equal(transferenciaSinConfirmar([{ TIPO: 'TRANSFERENCIA', ESTADO: 'PENDIENTE' }]), true)
  assert.equal(transferenciaSinConfirmar([{ tipo: 'TRANSFERENCIA', estado: 'PENDIENTE' }]), true)
  assert.equal(transferenciaSinConfirmar([{ TIPO: 'TRANSFERENCIA', ESTADO: 'PAGADO' }]), false)
  assert.equal(transferenciaSinConfirmar([{ TIPO: 'LINK_PAGO', ESTADO: 'PENDIENTE' }]), false)
  // así los trae getPedidoById (lib/db/pedidos.js)
  assert.equal(transferenciaSinConfirmar([{ TIPO_PAGO: 'TRANSFERENCIA', ESTADO_PAGO: 'PENDIENTE' }]), true)
  assert.equal(cuentaComoAbono({ TIPO_PAGO: 'TRANSFERENCIA', ESTADO_PAGO: 'PENDIENTE' }), false)
  assert.equal(transferenciaSinConfirmar([]), false)
  assert.equal(transferenciaSinConfirmar(null), false)
})

test('abonos: la transferencia sin confirmar o rechazada NO cuenta; lo demás cuenta como hoy', () => {
  assert.equal(cuentaComoAbono({ tipo: 'TRANSFERENCIA', estado: 'PENDIENTE' }), false)
  assert.equal(cuentaComoAbono({ tipo: 'TRANSFERENCIA', estado: 'RECHAZADO' }), false)
  assert.equal(cuentaComoAbono({ tipo: 'TRANSFERENCIA', estado: 'PAGADO' }), true)
  // LINK_PAGO pendiente sigue contando: no se mueven los números de cobranza.
  assert.equal(cuentaComoAbono({ tipo: 'LINK_PAGO', estado: 'PENDIENTE' }), true)
  assert.equal(cuentaComoAbono({ TIPO: 'TRANSFERENCIA', ESTADO: 'PENDIENTE' }), false)
  assert.equal(cuentaComoAbono({ tipo: 'EFECTIVO' }), true)
})

test('webhook: reconoce la etiqueta del pedido creado al confirmar', () => {
  assert.equal(ETIQUETA_TRANSFERENCIA, 'transferencia-tienda')
  assert.equal(tieneEtiquetaTransferencia({ tags: 'pago-en-tienda, transferencia-tienda' }), true)
  assert.equal(tieneEtiquetaTransferencia({ tags: ['transferencia-tienda'] }), true)
  assert.equal(tieneEtiquetaTransferencia({ tags: 'payphone, pago-en-tienda' }), false)
  assert.equal(tieneEtiquetaTransferencia({}), false)
})

test('candado: los estados que exigen el pago confirmado', () => {
  assert.deepEqual([...ESTADOS_QUE_EXIGEN_PAGO].sort(), ['COMPLETADO', 'DESPACHO', 'ENTREGADO', 'EN_FABRICA'])
})

test('carrito abandonado: si eligió transferencia, lo dice con el banco', () => {
  const t = textoAbandono(checkout)
  assert.match(t, /transferencia/i)
  assert.match(t, /Banco Guayaquil/)
  assert.match(t, /comprobante/i)
})

test('carrito abandonado: con tarjeta sigue igual', () => {
  const t = textoAbandono({ ...checkout, metodo: null, banco: null })
  assert.match(t, /tarjeta/)
  assert.doesNotMatch(t, /Banco Guayaquil/)
})

test('pedido del CRM: retenido, pago TRANSFERENCIA con foto, cédula real y prendas de Shopify', async () => {
  const { payloadPedidoTransferencia } = await import('../lib/transferenciaTienda.js')
  const c = { ...checkout, lineas: [{ variantId: '43372760334429', cantidad: 1 }] }
  const p = payloadPedidoTransferencia(c, 'https://res.cloudinary.com/x/comp.jpg')
  assert.equal(p.retenerTransferencia, true)
  assert.equal(p.tiendaId, 'MANDARINA')
  assert.equal(p.emitirFactura, false)
  assert.equal(p.cliente.cedula, '1712345678')
  assert.equal(p.cliente.nombre, 'Ana Pérez')
  assert.equal(p.items.length, 1)
  assert.equal(p.items[0].shopifyVariantId, '43372760334429')
  assert.equal(p.items[0].precioUnit, 35)
  assert.equal(p.items[0].talla, 'L')
  assert.equal(p.pagos.length, 1)
  assert.equal(p.pagos[0].tipo, 'TRANSFERENCIA')
  assert.equal(p.pagos[0].monto, 35)
  assert.equal(p.pagos[0].fotoComprobante, 'https://res.cloudinary.com/x/comp.jpg')
  assert.match(p.pagos[0].notas, /Banco Guayaquil/)
  assert.match(p.notasVendedor, /Retenido/)
})

test('pedido del CRM: varias unidades → precio unitario, no el total de la línea', async () => {
  const { payloadPedidoTransferencia } = await import('../lib/transferenciaTienda.js')
  const c = {
    ...checkout,
    lineas: [{ variantId: '1', cantidad: 2 }],
    calculo: { lineas: [{ titulo: 'Camiseta', variante: 'M', cantidad: 2, centavos: 3000 }] },
  }
  const p = payloadPedidoTransferencia(c, '')
  assert.equal(p.items[0].precioUnit, 15)
  assert.equal(p.items[0].cantidad, 2)
  assert.equal(p.pagos[0].monto, 30)
})
