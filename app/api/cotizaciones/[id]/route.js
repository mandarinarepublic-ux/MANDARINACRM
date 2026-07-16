import { getCotizacion, updateCotizacion } from '@/lib/db/cotizaciones'

export const dynamic = 'force-dynamic'

// GET /api/cotizaciones/[id] — una cotización.
export async function GET(_req, { params }) {
  try {
    const row = await getCotizacion(params.id)
    if (!row) return Response.json({ error: 'no encontrada' }, { status: 404 })
    return Response.json({ cotizacion: row })
  } catch (e) {
    console.error('GET cotizacion error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/cotizaciones/[id] — actualiza una cotización.
export async function PATCH(req, { params }) {
  try {
    const patch = await req.json()
    const row = await updateCotizacion(params.id, patch)
    return Response.json({ cotizacion: row })
  } catch (e) {
    console.error('PATCH cotizacion error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
