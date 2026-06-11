import { readSheet } from '@/lib/sheets'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.toLowerCase() || ''

    const clientes = await readSheet('CLIENTES')
    if (!q) return Response.json({ clientes: clientes.slice(0, 20) })

    const filtered = clientes.filter(c =>
      c.NOMBRE?.toLowerCase().includes(q) ||
      c.CEDULA?.includes(q) ||
      c.CELULAR?.includes(q)
    ).slice(0, 10)

    return Response.json({ clientes: filtered })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
