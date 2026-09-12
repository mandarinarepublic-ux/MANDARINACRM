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

// Cache de tokens en memoria (por tienda). Los tokens de client_credentials duran
// ~24h; los pedimos on-demand a Shopify y los reutilizamos mientras sigan válidos.
// Esto reemplaza el token estático (shpat_) que caducaba y tumbaba el sync (401).
const _tokenCache = {}

async function getAccessToken(tiendaId, store, clientId, clientSecret) {
  const cached = _tokenCache[tiendaId]
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token

  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Shopify token ${store} HTTP ${res.status}: ${t.slice(0, 200)}`)
  }

  const { access_token, expires_in } = await res.json()
  _tokenCache[tiendaId] = { token: access_token, expiresAt: Date.now() + (expires_in || 86400) * 1000 }
  return access_token
}

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
export async function fetchShopifyProducts(tiendaId, store, clientId, clientSecret) {
  if (!store || !clientId || !clientSecret) {
    throw new Error(`Faltan credenciales Shopify para ${tiendaId} (STORE/CLIENT_ID/CLIENT_SECRET)`)
  }

  const token = await getAccessToken(tiendaId, store, clientId, clientSecret)

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

// Una consulta por variante, para completar la foto que el webhook de pedidos
// no manda.
const FOTOS_QUERY = `
query Fotos($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      image { url }
      product { featuredImage { url } }
    }
  }
}`

/**
 * Las fotos de un conjunto de variantes, por id de variante.
 * El webhook de pedidos NO manda la imagen (verificado con un pedido real el
 * 30-ago-2026), así que hay que ir a buscarla al catálogo.
 * Devuelve { [variantId]: url }. Ante cualquier fallo devuelve {} — una foto
 * que no se pudo traer NUNCA puede impedir que el pedido entre.
 */
export async function fetchFotosDeVariantes(tienda, variantIds) {
  const ids = (variantIds || []).filter(Boolean).map(String)
  if (!ids.length) return {}

  try {
    const { id: tiendaId, store, clientId, clientSecret } = tienda || {}
    const token = await getAccessToken(tiendaId, store, clientId, clientSecret)
    const gids = ids.map((id) => `gid://shopify/ProductVariant/${id}`)
    const data = await shopifyGraphQL(store, token, FOTOS_QUERY, { ids: gids })

    const fotos = {}
    for (const nodo of data?.nodes || []) {
      if (!nodo?.id) continue
      const variantId = String(nodo.id).split('/').pop()
      const url = nodo.image?.url || nodo.product?.featuredImage?.url
      if (url) fotos[variantId] = url
    }
    return fotos
  } catch {
    // Ante cualquier fallo (red, credenciales, GraphQL) se devuelve vacío: el
    // pedido tiene que entrar igual, con o sin foto.
    return {}
  }
}

// Tiendas configuradas por env. Una tienda sin STORE+TOKEN simplemente se omite,
// así el sync funciona con una sola tienda mientras configuras la otra.
export function getTiendasConfig() {
  return [
    { id: 'MANDARINA', store: process.env.SHOPIFY_MANDARINA_STORE, clientId: process.env.SHOPIFY_MANDARINA_CLIENT_ID, clientSecret: process.env.SHOPIFY_MANDARINA_CLIENT_SECRET },
    { id: 'INDSTORE',  store: process.env.SHOPIFY_INDSTORE_STORE,  clientId: process.env.SHOPIFY_INDSTORE_CLIENT_ID,  clientSecret: process.env.SHOPIFY_INDSTORE_CLIENT_SECRET },
  ].filter(t => t.store && t.clientId && t.clientSecret)
}

/**
 * Habla con la Admin API de una tienda por su id, resolviendo el token sola.
 *
 * Es la puerta de ESCRITURA. La lectura (fetchShopifyProducts) sigue igual.
 *
 * ⚠️ getAccessToken cachea el token ~24 h en memoria. Al cambiar los permisos
 * de la app en Shopify, una instancia tibia de Vercel puede seguir usando el
 * token VIEJO y devolver 403 aunque el permiso ya este puesto. Quien llame
 * tiene que decir eso en el aviso al usuario.
 */
export async function shopifyGraphQLPorTienda(tiendaId, query, variables) {
  const tienda = getTiendasConfig().find((t) => t.id === tiendaId)
  if (!tienda) {
    throw new Error(`La tienda ${tiendaId} no tiene Shopify configurado en este entorno`)
  }
  const token = await getAccessToken(tienda.id, tienda.store, tienda.clientId, tienda.clientSecret)
  return shopifyGraphQL(tienda.store, token, query, variables)
}
