// scripts/seed-productos.mjs
// Carga inicial / manual del catálogo en la hoja PRODUCTOS_SHOPIFY.
//
// Uso (desde la carpeta del proyecto, con Node 20+):
//   node --env-file=.env.local scripts/seed-productos.mjs
//
// Requiere en .env.local:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY   (para escribir la hoja)
//   SHEET_ID  (o PRODUCTOS_SHEET_ID)                    -> por defecto la DB del CRM
// Opcional (si están, jala EN VIVO desde Shopify en vez del snapshot):
//   SHOPIFY_MANDARINA_STORE + SHOPIFY_MANDARINA_TOKEN
//   SHOPIFY_INDSTORE_STORE  + SHOPIFY_INDSTORE_TOKEN
//
// Sin tokens de Shopify usa scripts/mandarina_seed.json (snapshot de 285 productos
// de Mandarina jalado por Claude). Con tokens, ignora el snapshot y trae todo en vivo.

import { google } from 'googleapis'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SHEET_ID = process.env.PRODUCTOS_SHEET_ID || process.env.SHEET_ID || '13MiI4BPE247suz539TtObvS3L0SqhMu5KnvIg2YkAfs'
const TAB = 'PRODUCTOS_SHOPIFY'
const HEADER = ['TIENDA', 'ID', 'TITLE', 'PRICE', 'VARIANTS', 'IMAGE', 'ACTIVO']
const API_VERSION = '2024-10'

const PRODUCTS_QUERY = `
query Products($cursor: String) {
  products(first: 250, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title status
      featuredImage { url }
      priceRangeV2 { minVariantPrice { amount } }
      variants(first: 100) { edges { node { title price } } }
    } }
  }
}`

async function fetchLive(tiendaId, store, token) {
  const rows = []
  let cursor = null, pages = 0
  do {
    const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { cursor } }),
    })
    if (!res.ok) throw new Error(`${tiendaId} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    if (json.errors) throw new Error(`${tiendaId} GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`)
    const conn = json.data.products
    for (const e of conn.edges) {
      const n = e.node
      const id = (n.id || '').split('/').pop()
      const vs = (n.variants?.edges || []).map(x => x.node)
      const sizes = vs.map(v => v.title).filter(t => t && t !== 'Default Title')
      const price = n.priceRangeV2?.minVariantPrice?.amount || vs[0]?.price || ''
      rows.push([tiendaId, id, n.title || '', String(price), sizes.join(', '), n.featuredImage?.url || '', n.status === 'ACTIVE' ? 'TRUE' : 'FALSE'])
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null
    pages++
  } while (cursor && pages < 20)
  return rows
}

function tiendasConfig() {
  return [
    { id: 'MANDARINA', store: process.env.SHOPIFY_MANDARINA_STORE, token: process.env.SHOPIFY_MANDARINA_TOKEN },
    { id: 'INDSTORE',  store: process.env.SHOPIFY_INDSTORE_STORE,  token: process.env.SHOPIFY_INDSTORE_TOKEN },
  ].filter(t => t.store && t.token)
}

async function main() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('❌ Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY en .env.local')
    process.exit(1)
  }

  const tiendas = tiendasConfig()
  let rows = []
  if (tiendas.length > 0) {
    console.log(`→ Jalando EN VIVO desde Shopify (${tiendas.map(t => t.id).join(', ')})…`)
    for (const t of tiendas) {
      const r = await fetchLive(t.id, t.store, t.token)
      console.log(`   ${t.id}: ${r.length} productos`)
      rows = rows.concat(r)
    }
  } else {
    const snap = JSON.parse(readFileSync(join(__dirname, 'mandarina_seed.json'), 'utf8'))
    rows = snap
    console.log(`→ Sin tokens de Shopify: usando snapshot (${rows.length} productos de Mandarina)`)
  }

  if (rows.length === 0) throw new Error('0 productos — no escribo la hoja')

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  console.log(`→ Escribiendo ${rows.length} filas en ${TAB} (spreadsheet ${SHEET_ID.slice(0, 8)}…)`)
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TAB}!A:G` })
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER, ...rows] },
  })

  // Verificación: leer de vuelta
  const check = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A:A` })
  const written = (check.data.values?.length || 0) - 1
  console.log(`✅ Listo. Filas en la hoja (sin header): ${written}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
