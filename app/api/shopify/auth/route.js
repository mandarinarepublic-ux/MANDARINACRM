export const dynamic = 'force-dynamic'

// One-time endpoint to get the shpat_ token from client credentials
// Visit: /api/shopify/auth?tienda=MANDARINA to get your token
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda') || 'MANDARINA'

    const store = tiendaId === 'MANDARINA'
      ? process.env.SHOPIFY_MANDARINA_STORE
      : process.env.SHOPIFY_INDSTORE_STORE

    const clientId = tiendaId === 'MANDARINA'
      ? process.env.SHOPIFY_MANDARINA_CLIENT_ID
      : process.env.SHOPIFY_INDSTORE_CLIENT_ID

    const clientSecret = tiendaId === 'MANDARINA'
      ? process.env.SHOPIFY_MANDARINA_CLIENT_SECRET
      : process.env.SHOPIFY_INDSTORE_CLIENT_SECRET

    // Try client_credentials grant
    const res = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })

    const text = await res.text()
    console.log('Auth response status:', res.status)
    console.log('Auth response:', text)

    return new Response(
      `<html><body style="font-family:monospace;padding:20px">
        <h2>Shopify Auth Debug - ${tiendaId}</h2>
        <p>Store: ${store}</p>
        <p>Client ID: ${clientId?.slice(0,8)}...</p>
        <p>Status: ${res.status}</p>
        <pre>${text}</pre>
        <hr>
        <p><a href="/api/shopify/auth?tienda=INDSTORE">Test INDSTORE</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 })
  }
}
