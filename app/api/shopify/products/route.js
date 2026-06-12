export const dynamic = 'force-dynamic'

import { getTiendaConfig } from '@/lib/auth'
import { getShopifyToken } from '@/lib/shopify'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda')
    const query = searchParams.get('q') || ''

    if (!tiendaId) return Response.json({ error: 'tienda requerida' }, { status: 400 })

    const config = getTiendaConfig(tiendaId)
    if (!config) return Response.json({ error: 'Tienda no válida' }, { status: 400 })

    // Get credentials - support both old token and new client credentials
    const clientId = tiendaId === 'MANDARINA'
      ? process.env.SHOPIFY_MANDARINA_CLIENT_ID
      : process.env.SHOPIFY_INDSTORE_CLIENT_ID

    const clientSecret = tiendaId === 'MANDARINA'
      ? process.env.SHOPIFY_MANDARINA_CLIENT_SECRET
      : process.env.SHOPIFY_INDSTORE_CLIENT_SECRET

    // Try direct token first, then OAuth exchange
    let accessToken = config.shopifyToken

    if ((!accessToken || accessToken.startsWith('shpss_')) && clientId && clientSecret) {
      // Use OAuth exchange with client credentials
      accessToken = await getShopifyToken(config.shopifyStore, clientId, clientSecret)
    }

    if (!accessToken) {
      return Response.json({ error: 'No hay credenciales de Shopify configuradas', products: [] })
    }

    const shopifyUrl = `https://${config.shopifyStore}/admin/api/2024-10/products.json?limit=50${query ? `&title=${encodeURIComponent(query)}` : ''}`

    console.log('Fetching from:', config.shopifyStore)
    console.log('Token prefix:', accessToken?.slice(0, 8))

    const res = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })

    const responseText = await res.text()
    console.log('Shopify status:', res.status)

    if (!res.ok) {
      console.error('Shopify error:', responseText.slice(0, 300))
      return Response.json({ error: `Shopify ${res.status}`, detail: responseText, products: [] })
    }

    const data = JSON.parse(responseText)
    console.log('Products found:', data.products?.length)

    const products = (data.products || []).map(p => ({
      id: p.id,
      title: p.title,
      image: p.image?.src || p.images?.[0]?.src || null,
      variants: (p.variants || []).map(v => ({
        id: v.id, title: v.title, price: v.price,
        sku: v.sku, option1: v.option1, option2: v.option2,
      })),
      options: p.options,
      tags: p.tags,
    }))

    return Response.json({ products })
  } catch (e) {
    console.error('Shopify API error:', e.message)
    return Response.json({ error: e.message, products: [] })
  }
}
