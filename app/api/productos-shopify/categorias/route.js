export const dynamic = 'force-dynamic'
import { requireAdmin } from '@/lib/auth'
import { shopifyGraphQLPorTienda } from '@/lib/shopify'

// Busca categorias en la taxonomia de Shopify — SOLO ADMIN.
//
// ⚠️ La taxonomia viene EN ESPAÑOL (el idioma de la tienda) y falla en
// SILENCIO: probado el 10-sep-2026, "jacket" devuelve [] sin error y "Coats"
// devuelve Congas y Capotas. Solo "Chaquetas" trae lo correcto. Por eso la IA
// nunca inventa un id: propone un TERMINO en español y aqui se busca de verdad.
const TAXONOMIA = `
query BuscarCategoria($search: String!) {
  taxonomy {
    categories(first: 10, search: $search) {
      nodes { id name fullName isLeaf }
    }
  }
}`

export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const tienda = searchParams.get('tienda') || 'MANDARINA'
    if (!q) return Response.json({ categorias: [] })

    const data = await shopifyGraphQLPorTienda(tienda, TAXONOMIA, { search: q })
    const categorias = (data?.taxonomy?.categories?.nodes || [])
      .filter((c) => c.isLeaf)   // solo hojas: Shopify no acepta ramas
      .map((c) => ({ id: c.id, nombre: c.name, ruta: c.fullName }))

    return Response.json({ categorias })
  } catch (e) {
    console.error('categorias error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
