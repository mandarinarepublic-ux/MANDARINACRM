import { listCotizaciones, createCotizacion } from '@/lib/db/cotizaciones'

export const dynamic = 'force-dynamic'

// GET /api/cotizaciones?createdBy=<usuario_id>&rol=<ROL>
// VENDEDOR/VENDEDOR_YAW → solo las suyas; ADMIN → todas.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const cotizaciones = await listCotizaciones({
      createdBy: searchParams.get('createdBy') || undefined,
      rol: searchParams.get('rol') || undefined,
    })
    return Response.json({ cotizaciones })
  } catch (e) {
    console.error('GET cotizaciones error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/cotizaciones — crea una cotización. Body = objeto cotización completo.
export async function POST(req) {
  try {
    const body = await req.json()
    const row = await createCotizacion(body)
    return Response.json({ cotizacion: row })
  } catch (e) {
    console.error('POST cotizaciones error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
