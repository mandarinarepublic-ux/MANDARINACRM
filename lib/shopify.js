// lib/shopify.js
// Lee productos desde la Shopify Admin API usando un Admin API access token (shpat_...).
// NO usa IA ni consume "tokens" de IA. Solo se llama desde el sync (1x/día por tienda,
// más el botón "Actualizar ahora"), NUNCA en cada request de un vendedor — por eso el
// número de vendedores no afecta el consumo de la API de Shopify.

const API_VERSION = '2024-10'

// Trae solo lo que el catálogo necesita: título, precio mínimo, tallas/variantes,
// imagen destacada y estado. Paginado de a 250 (máximo de Shopify).
const PRODUCTS_QUERY = `
query Products($cursor: String) {
  products(first: 250, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        status
        featuredImage { url }
        priceRangeV2 { minVariantPrice { amount } }
        variants(first: 100) {
          edges { node { title price } }
        }
      }
    }
  }
}`

async function shopifyGraphQL(store, token, query, variables) {
  const res = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Shopify ${store} HTTP ${res.status}: ${t.slice(0, 200)}`)
  }
  const json = await res.json()
  if (json.errors) {
    throw new Error(`Shopify ${store} GraphQL error: ${JSON.stringify(json.errors).slice(0, 200)}`)
  }
  return json.data
}

// Devuelve filas normalizadas al formato del sheet PRODUCTOS_SHOPIFY (7 columnas):
//   [TIENDA, id, title, price, variantsCSV, image, activo]
// que es exactamente lo que /api/shopify/products ya sabe leer.
export async function fetchShopifyProducts(tiendaId, store, token) {
  if (!store || !token) throw new Error(`Faltan credenciales Shopify para ${tiendaId} (STORE/TOKEN)`)

  const rows = []
  let cursor = null
  let pages = 0

  do {
    const data = await shopifyGraphQL(store, token, PRODUCTS_QUERY, { cursor })
    const conn = data.products
    for (const edge of conn.edges) {
      const n = edge.node
      const id = (n.id || '').split('/').pop() // gid://shopify/Product/123 -> 123
      const variants = (n.variants?.edges || []).map(e => e.node)
      const sizes = variants
        .map(v => v.title)
        .filter(t => t && t !== 'Default Title')
      const price = n.priceRangeV2?.minVariantPrice?.amount || variants[0]?.price || ''
      rows.push([
        tiendaId,
        id,
        n.title || '',
        String(price),
        sizes.join(', '),
        n.featuredImage?.url || '',
        n.status === 'ACTIVE' ? 'TRUE' : 'FALSE',
      ])
    }
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null
    pages++
  } while (cursor && pages < 20) // tope de seguridad (250 * 20 = 5000 productos)

  return rows
}

// Tiendas configuradas por env. Una tienda sin STORE+TOKEN simplemente se omite,
// así el sync funciona con una sola tienda mientras configuras la otra.
export function getTiendasConfig() {
  return [
    { id: 'MANDARINA', store: process.env.SHOPIFY_MANDARINA_STORE, token: process.env.SHOPIFY_MANDARINA_TOKEN },
    { id: 'INDSTORE',  store: process.env.SHOPIFY_INDSTORE_STORE,  token: process.env.SHOPIFY_INDSTORE_TOKEN },
  ].filter(t => t.store && t.token)
}
