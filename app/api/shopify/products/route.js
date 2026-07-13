export const dynamic = 'force-dynamic'
import { listProductosShopify } from '@/lib/db/productosShopify'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda') || 'MANDARINA'
    const query = searchParams.get('q') || ''

    // Lectura vía repo (respeta DATA_BACKEND). Mismos filtros y shape de hoy.
    const products = await listProductosShopify({ tienda: tiendaId, q: query })

    // Fallback to hardcoded if sheet is empty
    if (products.length === 0) {
      return Response.json({ products: FALLBACK_CATALOG.filter(p =>
        !query || p.title.toLowerCase().includes(query.toLowerCase())
      )})
    }

    return Response.json({ products })
  } catch (e) {
    console.error('Catalogo error:', e.message)
    return Response.json({ products: FALLBACK_CATALOG })
  }
}

const FALLBACK_CATALOG = [
  { id: "7903025463389", title: "Chaqueta Dragon Ball Z - CLASIC", image: "https://cdn.shopify.com/s/files/1/0689/5832/2781/files/goku-02.png?v=1746627152", price: "35.00", variants: [{title:"S",price:"35.00"},{title:"M",price:"35.00"},{title:"L",price:"35.00"},{title:"XL",price:"35.00"},{title:"2XL",price:"35.00"}] },
  { id: "7903041421405", title: "Camisetas Dragon Ball", image: "https://cdn.shopify.com/s/files/1/0689/5832/2781/files/mock_Mesadetrabajo1.png?v=1746648611", price: "19.99", variants: [{title:"S",price:"19.99"},{title:"M",price:"19.99"},{title:"L",price:"19.99"},{title:"XL",price:"19.99"},{title:"2XL",price:"19.99"}] },
  { id: "7903144509533", title: "Chaqueta Naruto", image: "https://cdn.shopify.com/s/files/1/0689/5832/2781/files/NARUTOHOODIEGOLDEDITION_Mesadetrabajo1.png?v=1746652796", price: "35.00", variants: [{title:"S",price:"35.00"},{title:"M",price:"35.00"},{title:"L",price:"35.00"},{title:"XL",price:"35.00"},{title:"2XL",price:"35.00"}] },
  { id: "7904348340317", title: "Hoodie One Piece - Luffy", image: "https://cdn.shopify.com/s/files/1/0689/5832/2781/files/WhatsAppImage2025-05-07at12.14.16_1.jpg?v=1746736819", price: "30.00", variants: [{title:"XS",price:"30.00"},{title:"S",price:"30.00"},{title:"M",price:"30.00"},{title:"L",price:"30.00"},{title:"XL",price:"30.00"}] },
  { id: "7906034286685", title: "Hoodie X-men Wolverine", image: "https://cdn.shopify.com/s/files/1/0689/5832/2781/files/WOLVERINE-01.png?v=1746661894", price: "19.99", variants: [{title:"S",price:"19.99"},{title:"M",price:"19.99"},{title:"L",price:"19.99"},{title:"XL",price:"19.99"},{title:"2XL",price:"19.99"}] },
]
