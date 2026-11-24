import test from 'node:test'
import assert from 'node:assert'
import { esFotoDeInbox, fotosDeUrl, leerFotoPedido, agregarFotoPago, TIPO_MENSAJE_FOTO } from '../lib/fotoDesdeInbox.js'

const FOTO = 'https://piingkecjgoisnxccvaa.supabase.co/storage/v1/object/public/inbox-media/fotos/MANDI/abc.jpg'
const INBOX = 'https://inbox.apps.mandarinaec.com'

test('esFotoDeInbox: solo una foto pública del bucket del inbox', () => {
  assert.equal(esFotoDeInbox(FOTO), true)
  assert.equal(esFotoDeInbox(FOTO.replace('https:', 'http:')), false)
  assert.equal(esFotoDeInbox('https://piingkecjgoisnxccvaa.supabase.co.evil.com/storage/v1/object/public/inbox-media/x.jpg'), false)
  assert.equal(esFotoDeInbox('https://piingkecjgoisnxccvaa.supabase.co/storage/v1/object/public/otro-bucket/x.jpg'), false)
  assert.equal(esFotoDeInbox('https://otro.supabase.co/storage/v1/object/public/inbox-media/x.jpg'), false)
  assert.equal(esFotoDeInbox('data:image/jpeg;base64,AAAA'), false)
  assert.equal(esFotoDeInbox('javascript:alert(1)'), false)
  assert.equal(esFotoDeInbox(''), false)
  assert.equal(esFotoDeInbox(null), false)
})

test('fotosDeUrl: lee fotoPago y fotoFrente, descarta lo que no sirve', () => {
  const p = new URLSearchParams({ fotoPago: FOTO, fotoFrente: 'https://evil.com/x.jpg' })
  assert.deepEqual(fotosDeUrl(p), { pago: FOTO, producto: '' })
  assert.deepEqual(fotosDeUrl(new URLSearchParams()), { pago: '', producto: '' })
  assert.deepEqual(fotosDeUrl(null), { pago: '', producto: '' })
})

test('leerFotoPedido: solo del padre que nos enmarca, desde un inbox nuestro', () => {
  const padre = {}
  const ventana = { parent: padre }
  const ok = { source: padre, origin: INBOX, data: { tipo: TIPO_MENSAJE_FOTO, destino: 'pago', url: FOTO } }
  assert.deepEqual(leerFotoPedido(ok, ventana), { destino: 'pago', url: FOTO })
  assert.deepEqual(leerFotoPedido({ ...ok, data: { ...ok.data, destino: 'producto' } }, ventana), { destino: 'producto', url: FOTO })
  // otro origen, otra ventana, otro tipo, otro destino, otra url → nada
  assert.equal(leerFotoPedido({ ...ok, origin: 'https://evil.com' }, ventana), null)
  assert.equal(leerFotoPedido({ ...ok, source: {} }, ventana), null)
  assert.equal(leerFotoPedido({ ...ok, data: { ...ok.data, tipo: 'otra-cosa' } }, ventana), null)
  assert.equal(leerFotoPedido({ ...ok, data: { ...ok.data, destino: 'cliente' } }, ventana), null)
  assert.equal(leerFotoPedido({ ...ok, data: { ...ok.data, url: 'https://evil.com/x.jpg' } }, ventana), null)
  // sin padre (pantalla suelta, no enmarcada) → nada
  const suelta = {}; suelta.parent = suelta
  assert.equal(leerFotoPedido({ ...ok, source: suelta }, suelta), null)
})

test('agregarFotoPago: usa el pago vacío, si no agrega uno nuevo, y nunca pisa', () => {
  const inicial = [{ tipo: 'EFECTIVO', monto: '', notas: '' }]
  assert.deepEqual(agregarFotoPago(inicial, FOTO), [{ tipo: 'TRANSFERENCIA', monto: '', notas: '', fotoComprobante: FOTO }])
  // un pago con monto escrito no se toca: va uno nuevo
  const conMonto = [{ tipo: 'EFECTIVO', monto: '20', notas: '' }]
  const r = agregarFotoPago(conMonto, FOTO)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], conMonto[0])
  assert.equal(r[1].fotoComprobante, FOTO)
  assert.equal(r[1].tipo, 'TRANSFERENCIA')
  // un pago que ya tiene OTRA foto no se pisa
  const otra = [{ tipo: 'TRANSFERENCIA', monto: '', fotoComprobante: 'https://x/otra.jpg' }]
  assert.equal(agregarFotoPago(otra, FOTO).length, 2)
  // la misma foto dos veces no duplica
  const una = agregarFotoPago(inicial, FOTO)
  assert.equal(agregarFotoPago(una, FOTO), una)
})
