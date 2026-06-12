import { getTiendaConfig } from '@/lib/auth'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda')
    const query = searchParams.get('q') || ''

    if (!tiendaId) return Response.json({ error: 'tienda requerida' }, { status: 400 })

    const config = getTiendaConfig(tiendaId)
    if (!config) return Response.json({ error: 'Tienda no válida' }, { status: 400 })

    if (!config.shopifyToken) {
      return Response.json({ error: 'Token de Shopify no configurado', products: [] }, { status: 200 })
    }

    // Try 2024-10 API version
    const shopifyUrl = `https://${config.shopifyStore}/admin/api/2024-10/products.json?limit=50${query ? `&title=${encodeURIComponent(query)}` : ''}`

    console.log('Shopify URL:', shopifyUrl)
    console.log('Token prefix:', config.shopifyToken?.slice(0, 8))

    const res = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': config.shopifyToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })

    // Log full error
    if (!res.ok) {
      const errBody = await res.text()
      console.error('Shopify error status:', res.status)
      console.error('Shopify error body:', errBody)
      return Response.json({ 
        error: `Shopify ${res.status}`,
        detail: errBody,
        products: [] 
      }, { status: 200 }) // Return 200 so frontend shows error
    }

    const data = await res.json()

    const products = (data.products || []).map(p => ({
      id: p.id,
      title: p.title,
      image: p.image?.src || p.images?.[0]?.src || null,
      variants: (p.variants || []).map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        option1: v.option1,
        option2: v.option2,
      })),
      options: p.options,
      tags: p.tags,
    }))

    return Response.json({ products })
  } catch (e) {
    console.error('Shopify API error:', e)
    return Response.json({ error: e.message, products: [] }, { status: 200 })
  }
}
