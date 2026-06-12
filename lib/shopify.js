// Shopify OAuth token exchange - client credentials grant
// Caches token in memory (resets on each serverless cold start)
const tokenCache = {}

export async function getShopifyToken(store, clientId, clientSecret) {
  const cacheKey = `${store}_${clientId}`
  
  // Return cached token if still valid (tokens last ~24h, cache for 23h)
  if (tokenCache[cacheKey] && tokenCache[cacheKey].expiresAt > Date.now()) {
    return tokenCache[cacheKey].token
  }

  console.log('Requesting new Shopify token for:', store)
  
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Token exchange failed:', res.status, err)
    throw new Error(`Token exchange failed: ${res.status} - ${err}`)
  }

  const data = await res.json()
  console.log('Token obtained, prefix:', data.access_token?.slice(0, 8))
  
  // Cache for 23 hours
  tokenCache[cacheKey] = {
    token: data.access_token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  }

  return data.access_token
}
