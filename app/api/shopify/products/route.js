import { getTiendaConfig } from '@/lib/auth'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda')
    const query = searchParams.get('q') || ''

    if (!tiendaId) return Response.json({ error: 'tienda requerida' }, { status: 400 })

    const config = getTiendaConfig(tiendaId)
    if (!config) return Response.json({ error: 'Tienda no válida' }, { status: 400 })

    const shopifyUrl = `https://${config.shopifyStore}/admin/api/2024-01/products.json?limit=50${query ? `&title=${encodeURIComponent(query)}` : ''}`

    const res = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': config.shopifyToken,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) throw new Error('Shopify error: ' + res.status)

    const data = await res.json()

    const products = data.products.map(p => ({
      id: p.id,
      title: p.title,
      image: p.image?.src || p.images?.[0]?.src || null,
      variants: p.variants.map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        option1: v.option1, // size/talla usually
        option2: v.option2,
      })),
      options: p.options,
      tags: p.tags,
    }))

    return Response.json({ products })
  } catch (e) {
    console.error('Shopify API error:', e)
    return Response.json({ error: 'Error al cargar productos' }, { status: 500 })
  }
}
