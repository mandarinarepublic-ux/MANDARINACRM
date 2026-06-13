export const dynamic = 'force-dynamic'
import { google } from 'googleapis'

async function readProductosShopify(tiendaId, query = '') {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'PRODUCTOS_SHOPIFY!A:G',
  })

  const rows = res.data.values || []
  if (rows.length < 2) return []

  // Skip header row if present
  let dataRows = rows
  if (rows[0][0]?.toUpperCase() === 'TIENDA') {
    dataRows = rows.slice(1)
  }

  return dataRows
    .filter(r => {
      if (!r[2]) return false // no name
      if (r[6] === 'FALSE') return false // inactive
      if (tiendaId && r[0]?.toUpperCase() !== tiendaId.toUpperCase()) return false
      if (query && !r[2]?.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
    .map(r => ({
      id: r[1] || r[2],
      title: r[2],
      price: r[3] || '35.00',
      image: r[5] || null,
      variants: (r[4] || '').split(',').map(t => t.trim()).filter(Boolean).map(t => ({
        id: `${r[1]}_${t}`,
        title: t,
        price: r[3] || '35.00',
      })),
      options: [{ name: 'Talla', values: (r[4] || '').split(',').map(t => t.trim()) }],
      tags: '',
      tienda: r[0],
    }))
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaId = searchParams.get('tienda') || 'MANDARINA'
    const query = searchParams.get('q') || ''

    const products = await readProductosShopify(tiendaId, query)

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
