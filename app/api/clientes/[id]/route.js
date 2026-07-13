import { updateCliente } from '@/lib/db/clientes'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()

    // dual-write: Sheets (primario, mismos updateCell por columna) + Supabase (espejo).
    // Solo se actualizan los campos presentes en el body (upper-case desde la UI).
    await updateCliente(id, {
      nombre:    body.NOMBRE,
      cedula:    body.CEDULA    !== undefined ? String(body.CEDULA)  : undefined,
      celular:   body.CELULAR   !== undefined ? String(body.CELULAR) : undefined,
      email:     body.EMAIL,
      ciudad:    body.CIUDAD,
      direccion: body.DIRECCION,
    })

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH cliente error:', e)
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}
