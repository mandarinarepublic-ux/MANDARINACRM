import { readSheet, appendRow } from '@/lib/sheets'

export async function GET() {
  try {
    const productos = await readSheet('PRODUCTOS_CATALOGO')
    const activos = productos.filter(p => p.ACTIVO === 'TRUE' || p.ACTIVO === '')
    if (activos.length === 0) throw new Error('empty')
    return Response.json({ productos: activos })
  } catch (e) {
    return Response.json({ productos: [
      { NOMBRE: 'CAMISETA NORMAL' },
      { NOMBRE: 'CAMISETA OVERSIZE' },
      { NOMBRE: 'CHAQUETA' },
      { NOMBRE: 'BUZO' },
      { NOMBRE: 'HOODIE' },
      { NOMBRE: 'POLO' },
      { NOMBRE: 'CAMISETA CUELLO V' },
      { NOMBRE: 'CAMISETA MANGA LARGA' },
    ]})
  }
}

export async function POST(req) {
  try {
    const { nombre } = await req.json()
    await appendRow('PRODUCTOS_CATALOGO', [nombre, 'TRUE'])
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
