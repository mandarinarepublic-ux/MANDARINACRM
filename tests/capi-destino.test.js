import test from 'node:test'
import assert from 'node:assert'
import { decidirDestino } from '../lib/capi-destino.js'

const PIXEL = '612911870044679'
const DATASET = '1873083357308826'
const TOKEN = 'EAAG-token-de-la-cloud-api'

test('una venta que vino de un anuncio va al dataset de su WABA, no al pixel', () => {
  const r = decidirDestino({
    origenPedido: 'business_messaging', datasetId: DATASET, tokenWaba: TOKEN, pixelId: PIXEL,
  })
  assert.equal(r.porDataset, true)
  assert.equal(r.destinoId, DATASET)
  assert.equal(r.origen, 'business_messaging')
})

test('sin token de la Cloud API la venta NO se pierde: va al pixel como venta de chat', () => {
  // Es el caso "META_TOKEN todavia no esta puesto en Vercel". Mandarlo al pixel
  // como business_messaging es lo que Meta rechaza entero: perdimos 21 compras
  // asi. Degradar a 'chat' reporta el dinero aunque sin decir de que anuncio vino.
  const r = decidirDestino({
    origenPedido: 'business_messaging', datasetId: DATASET, tokenWaba: '', pixelId: PIXEL,
  })
  assert.equal(r.porDataset, false)
  assert.equal(r.destinoId, PIXEL)
  assert.equal(r.origen, 'chat', 'NUNCA se manda business_messaging a un pixel')
})

test('sin dataset para esa WABA tambien degrada en vez de perder la venta', () => {
  const r = decidirDestino({
    origenPedido: 'business_messaging', datasetId: null, tokenWaba: TOKEN, pixelId: PIXEL,
  })
  assert.equal(r.porDataset, false)
  assert.equal(r.destinoId, PIXEL)
  assert.equal(r.origen, 'chat')
})

test('una venta de mostrador no se toca: sigue yendo al pixel como physical_store', () => {
  const r = decidirDestino({
    origenPedido: 'physical_store', datasetId: DATASET, tokenWaba: TOKEN, pixelId: PIXEL,
  })
  assert.equal(r.porDataset, false)
  assert.equal(r.destinoId, PIXEL)
  assert.equal(r.origen, 'physical_store')
})

test('una venta de chat sin anuncio no se toca: al pixel como chat', () => {
  const r = decidirDestino({
    origenPedido: 'chat', datasetId: DATASET, tokenWaba: TOKEN, pixelId: PIXEL,
  })
  assert.equal(r.porDataset, false)
  assert.equal(r.destinoId, PIXEL)
  assert.equal(r.origen, 'chat')
})

test('nunca sale un business_messaging hacia el pixel, pase lo que pase', () => {
  // La invariante que resume todo el arreglo. Se prueba a proposito sobre TODAS
  // las combinaciones: es la unica que, si se rompe, se pierde la venta entera.
  for (const datasetId of [DATASET, null, '', undefined]) {
    for (const tokenWaba of [TOKEN, '', null, undefined]) {
      for (const origenPedido of ['business_messaging', 'chat', 'physical_store']) {
        const r = decidirDestino({ origenPedido, datasetId, tokenWaba, pixelId: PIXEL })
        const vaAlPixel = r.destinoId === PIXEL
        assert.ok(
          !(vaAlPixel && r.origen === 'business_messaging'),
          `combinacion rota: origen=${origenPedido} dataset=${datasetId} token=${tokenWaba}`,
        )
      }
    }
  }
})
