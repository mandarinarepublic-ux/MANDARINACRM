import { readSheet, updateRow } from '@/lib/sheets'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const clientes = await readSheet('CLIENTES')
    const idx = clientes.findIndex(c => c.CLIENTE_ID === id)
    if (idx === -1) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
    const updated = { ...clientes[idx], ...body }
    await updateRow('CLIENTES', idx, [
      updated.CLIENTE_ID, updated.NOMBRE, updated.CEDULA,
      updated.CELULAR, updated.EMAIL, updated.CIUDAD,
      updated.DIRECCION, updated.FECHA_REGISTRO,
    ])
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
