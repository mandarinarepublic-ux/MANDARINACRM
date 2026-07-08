import { readSheet, appendRow, updateRow, findRow, updateCell } from '@/lib/sheets'
import { v4 as uuid } from 'uuid'

// Columnas de la hoja USUARIOS (mismo orden que usa el POST/appendRow):
// A USUARIO_ID · B NOMBRE · C CODIGO · D EMAIL · E PASSWORD_HASH · F ROL
// G AREAS · H TIENDAS · I ACTIVO · J FECHA
const COL = { rol: 'F', areas: 'G', tiendas: 'H', activo: 'I' }

export async function GET() {
  try {
    const usuarios = await readSheet('USUARIOS')
    // Don't expose passwords
    return Response.json({
      usuarios: usuarios.map(u => ({ ...u, PASSWORD_HASH: undefined }))
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { nombre, codigo, email, password, rol, areas, tiendas } = body

    const id = uuid()
    const now = new Date().toISOString()

    await appendRow('USUARIOS', [
      id, nombre, codigo, email, password,
      rol, areas?.join(',') || '', tiendas?.join(',') || '',
      'TRUE', now,
    ])

    return Response.json({ id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// Editar un usuario existente. Actualiza solo los campos enviados (rol, areas,
// tiendas, activo) sin tocar la contraseña ni el resto de la fila.
export async function PATCH(req) {
  try {
    const { id, rol, areas, tiendas, activo } = await req.json()
    if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

    const { index } = await findRow('USUARIOS', 'USUARIO_ID', id)
    if (index < 0) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

    if (rol !== undefined)     await updateCell('USUARIOS', index, COL.rol, rol)
    if (areas !== undefined)   await updateCell('USUARIOS', index, COL.areas, Array.isArray(areas) ? areas.join(',') : (areas || ''))
    if (tiendas !== undefined) await updateCell('USUARIOS', index, COL.tiendas, Array.isArray(tiendas) ? tiendas.join(',') : (tiendas || ''))
    if (activo !== undefined)  await updateCell('USUARIOS', index, COL.activo, activo ? 'TRUE' : 'FALSE')

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
