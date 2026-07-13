export const dynamic = 'force-dynamic'
import { listCatalogo, addCatalogo } from '@/lib/db/catalogo'

export async function GET() {
  try {
    // Lectura vía repo (respeta DATA_BACKEND). listCatalogo ya lee header-fila-0
    // y cae al mismo fallback hardcodeado si viene vacío o falla.
    const productos = await listCatalogo()
    return Response.json({ productos })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { nombre } = await req.json()
    if (!nombre?.trim()) return Response.json({ error: 'Nombre requerido' }, { status: 400 })
    // dual-write: Sheets (append [NOMBRE,'TRUE']) + Supabase (upsert por nombre).
    await addCatalogo(nombre)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
