import { readSheet, appendRow, updateRow } from '@/lib/sheets'
import { v4 as uuid } from 'uuid'

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
