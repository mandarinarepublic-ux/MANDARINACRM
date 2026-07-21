import {
  listUsuarios, createUsuario, updateUsuario,
  getUsuarioById, buscarConflicto, contarAdminsActivos,
} from '@/lib/db/usuarios'
import { requireAdmin } from '@/lib/auth'
import { esRolValido } from '@/lib/roles'
import { toBool } from '@/lib/db/_backend'

const MIN_PASSWORD = 6

/** Convierte el resultado de requireAdmin en una Response, o null si pasa. */
function bloqueo(auth) {
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status })
}

/**
 * La base tiene índices únicos parciales sobre username/email/código de los
 * usuarios ACTIVOS (migración usuarios_unique_login_activos). Si se escapa un
 * duplicado por una ruta que no lo validó antes, Postgres lanza un 23505 con un
 * texto ininteligible; aquí se traduce a algo que el admin pueda entender.
 */
function errorDeDuplicado(e) {
  const msg = String(e?.message || '')
  if (e?.code !== '23505' && !/duplicate key|usuarios_.*_uk/i.test(msg)) return null
  if (/username/i.test(msg)) return 'Ese usuario para entrar ya lo tiene otra persona activa.'
  if (/email/i.test(msg)) return 'Ese correo ya lo tiene otra persona activa.'
  if (/codigo/i.test(msg)) return 'Ese código ya lo tiene otra persona activa.'
  return 'Ya existe otro usuario activo con esos datos.'
}

export async function GET(req) {
  try {
    // La lista trae nombres, correos y roles de todo el personal: solo ADMIN.
    const auth = await requireAdmin(req)
    const no = bloqueo(auth); if (no) return no

    const usuarios = await listUsuarios()
    return Response.json({ usuarios })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    const no = bloqueo(auth); if (no) return no

    const body = await req.json()
    const nombre = String(body.nombre || '').trim()
    const codigo = String(body.codigo || '').trim().toUpperCase()
    const email = String(body.email || '').trim()
    const username = String(body.username || '').trim().toUpperCase()
    const { password, rol, areas, tiendas } = body

    if (!nombre) return Response.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    if (!codigo) return Response.json({ error: 'El código es obligatorio' }, { status: 400 })
    if (!username) return Response.json({ error: 'El usuario (para entrar) es obligatorio' }, { status: 400 })
    if (!esRolValido(rol)) return Response.json({ error: `Rol inválido: ${rol}` }, { status: 400 })
    if (!password || String(password).length < MIN_PASSWORD) {
      return Response.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 })
    }

    // Sin esto se crearon dos usuarios con el mismo login y uno de los dos dejó
    // de poder entrar. Se cruzan nombre/usuario/email porque el login acepta
    // cualquiera de los tres como identificador.
    const conflicto = await buscarConflicto({ nombre, username, email, codigo })
    if (conflicto) {
      return Response.json({
        error: `Ya existe "${conflicto.usuario.NOMBRE}" usando "${conflicto.campo}". ` +
               `El usuario, el correo, el nombre y el código deben ser únicos.`,
      }, { status: 409 })
    }

    const { id } = await createUsuario({ nombre, codigo, email, username, password, rol, areas, tiendas })
    return Response.json({ id })
  } catch (e) {
    const dup = errorDeDuplicado(e)
    if (dup) return Response.json({ error: dup }, { status: 409 })
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// Editar un usuario existente. Actualiza solo los campos enviados. `password`
// vacío = no se toca la contraseña.
export async function PATCH(req) {
  try {
    const auth = await requireAdmin(req)
    const no = bloqueo(auth); if (no) return no

    const body = await req.json()
    const { id, rol, areas, tiendas, password } = body
    if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

    const actual = await getUsuarioById(id)
    if (!actual) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

    // Se normaliza igual que en el escritor: 'false' (string) debe desactivar.
    const activo = body.activo !== undefined ? toBool(body.activo) : undefined

    if (rol !== undefined && !esRolValido(rol)) {
      return Response.json({ error: `Rol inválido: ${rol}` }, { status: 400 })
    }
    if (password !== undefined && password !== '' && String(password).length < MIN_PASSWORD) {
      return Response.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 })
    }

    // No dejar el CRM sin ningún administrador con el que poder entrar.
    // Solo cuenta si el editado está ACTIVO: degradar a un admin ya desactivado
    // es inocuo y no debe bloquearse.
    const dejaDeSerAdmin =
      actual.ROL === 'ADMIN' && actual.ACTIVO === 'TRUE' &&
      ((rol !== undefined && rol !== 'ADMIN') || (activo !== undefined && !activo))
    if (dejaDeSerAdmin && (await contarAdminsActivos()) <= 1) {
      return Response.json({
        error: 'Es el último ADMIN activo. Nombra otro administrador antes de cambiar este.',
      }, { status: 409 })
    }

    // NOMBRE y CODIGO NO son editables a propósito: crm.pedidos.vendedor_id guarda
    // el NOMBRE del vendedor (verificado en producción: 'CAMILA' tiene 172 pedidos,
    // 'JACKELINE BARRETO' 78). Renombrar a alguien dejaría huérfano todo su
    // historial de ventas. Para corregir un nombre hace falta migrar también los
    // pedidos, así que no se hace desde esta pantalla.
    const email = body.email !== undefined ? String(body.email).trim() : undefined
    const username = body.username !== undefined ? String(body.username).trim().toUpperCase() : undefined

    // Vaciar el username deja a la persona sin poder entrar como se le indicó.
    if (username !== undefined && !username && actual.USERNAME) {
      return Response.json({
        error: 'No se puede dejar vacío el usuario para entrar: la persona no podría iniciar sesión.',
      }, { status: 400 })
    }

    // Solo se valida contra duplicados lo que REALMENTE cambia. Comparando contra
    // el valor actual con la misma normalización: si se revalidara todo en cada
    // guardado, los usuarios que ya están duplicados en la base quedarían
    // imposibles de editar (ni siquiera para desactivarlos o arreglarlos).
    const norm = (v) => String(v ?? '').trim().toLowerCase()
    const cambios = {}
    if (email !== undefined && norm(email) !== norm(actual.EMAIL)) cambios.email = email
    if (username !== undefined && norm(username) !== norm(actual.USERNAME)) cambios.username = username

    if (Object.keys(cambios).length > 0) {
      const conflicto = await buscarConflicto(cambios, id)
      if (conflicto) {
        return Response.json({
          error: `"${Object.values(cambios).join('", "')}" ya lo usa ${conflicto.usuario.NOMBRE}. ` +
                 `El usuario y el correo deben ser únicos.`,
        }, { status: 409 })
      }
    }

    const { passwordCambiada } = await updateUsuario(id, {
      rol, areas, tiendas, activo, email, username, password,
    })

    return Response.json({ ok: true, passwordCambiada })
  } catch (e) {
    const dup = errorDeDuplicado(e)
    if (dup) return Response.json({ error: dup }, { status: 409 })
    const notFound = /no encontrado/i.test(e.message || '')
    return Response.json({ error: e.message }, { status: notFound ? 404 : 500 })
  }
}
