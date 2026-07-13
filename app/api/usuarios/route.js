import { listUsuarios, createUsuario, updateUsuario } from '@/lib/db/usuarios'

export async function GET() {
  try {
    // Lectura vía repo (respeta DATA_BACKEND). listUsuarios ya normaliza y NO expone password.
    const usuarios = await listUsuarios()
    return Response.json({ usuarios })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { nombre, codigo, email, username, password, rol, areas, tiendas } = body

    // dual-write: Sheets (append) + Supabase (insert). createUsuario hashea la
    // contraseña con bcrypt antes de guardar (cierra la deuda #1).
    const { id } = await createUsuario({ nombre, codigo, email, username, password, rol, areas, tiendas })

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

    // dual-write: Sheets (updateCell por columna) + Supabase (update parcial).
    await updateUsuario(id, { rol, areas, tiendas, activo })

    return Response.json({ ok: true })
  } catch (e) {
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}
