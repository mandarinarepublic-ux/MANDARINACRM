export const dynamic = 'force-dynamic'

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
      return Response.json({ error: 'Token no configurado', products: [] })
    }

    const shopifyUrl = `https://${config.shopifyStore}/admin/api/2024-10/products.json?limit=50${query ? `&title=${encodeURIComponent(query)}` : ''}`

    console.log('Shopify store:', config.shopifyStore)
    console.log('Token prefix:', config.shopifyToken?.slice(0, 8))

    const res = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': config.shopifyToken,
        'Content-Type': 'application/json',
      },
    })

    const responseText = await res.text()
    console.log('Status:', res.status)
    console.log('Response preview:', responseText.slice(0, 300))

    if (!res.ok) {
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
    console.error('Shopify error:', e.message)
    return Response.json({ error: e.message, products: [] })
  }
}
