// La lista de orígenes decide QUIÉN puede enmarcar el CRM y a quién se le manda
// el aviso del pedido creado. Un parecido que se cuele acá es un agujero real.
import test from 'node:test'
import assert from 'node:assert'
import { ORIGENES_INBOX, ORIGEN_CRM, HOSTS_PERMITIDOS, esOrigenInbox } from '../lib/origenes.js'

test('los dos inbox están, y con https', () => {
  assert.deepStrictEqual([...ORIGENES_INBOX], [
    'https://inbox.apps.mandarinaec.com',
    'https://ind-inbox.apps.mandarinaec.com',
  ])
})

test('esOrigenInbox acepta los nuestros', () => {
  assert.strictEqual(esOrigenInbox('https://inbox.apps.mandarinaec.com'), true)
  assert.strictEqual(esOrigenInbox('https://ind-inbox.apps.mandarinaec.com'), true)
})

test('el CRM no es un inbox', () => {
  // El CRM puede enmarcarse a sí mismo por 'self', pero no es destino de avisos.
  assert.strictEqual(esOrigenInbox(ORIGEN_CRM), false)
})

test('un sufijo parecido NO pasa', () => {
  // El truco clásico: termina igual pero el dominio es de otro.
  assert.strictEqual(esOrigenInbox('https://inbox.apps.mandarinaec.com.evil.com'), false)
  assert.strictEqual(esOrigenInbox('https://evil.com/inbox.apps.mandarinaec.com'), false)
})

test('http:// no pasa aunque el host sea el nuestro', () => {
  assert.strictEqual(esOrigenInbox('http://inbox.apps.mandarinaec.com'), false)
})

test('vacío, basura y null no lanzan', () => {
  assert.strictEqual(esOrigenInbox(''), false)
  assert.strictEqual(esOrigenInbox('null'), false)   // origin de un iframe sandbox
  assert.strictEqual(esOrigenInbox(null), false)
  assert.strictEqual(esOrigenInbox(undefined), false)
})

test('HOSTS_PERMITIDOS trae los tres hosts, sin protocolo', () => {
  // Es lo que consume lib/volver.js, que compara hostname.
  assert.strictEqual(HOSTS_PERMITIDOS.has('inbox.apps.mandarinaec.com'), true)
  assert.strictEqual(HOSTS_PERMITIDOS.has('ind-inbox.apps.mandarinaec.com'), true)
  assert.strictEqual(HOSTS_PERMITIDOS.has('crm.apps.mandarinaec.com'), true)
  assert.strictEqual(HOSTS_PERMITIDOS.size, 3)
})
