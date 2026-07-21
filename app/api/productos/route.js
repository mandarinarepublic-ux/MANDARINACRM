export const dynamic = 'force-dynamic'
import {
  listCatalogo, addCatalogo, listCatalogoGestion, updateCatalogo, deleteCatalogo,
} from '@/lib/db/catalogo'
import { requireAdmin } from '@/lib/auth'

export async function GET(req) {
  try {
    // ?gestion=1 → catálogo COMPLETO (con inactivos y conteo de usos) para la
    // pantalla de administración. Solo ADMIN.
    const { searchParams } = new URL(req.url)
    if (searchParams.get('gestion')) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
      return Response.json({ productos: await listCatalogoGestion() })
    }

    // Lectura vía repo (respeta DATA_BACKEND). listCatalogo ya lee header-fila-0
    // y cae al mismo fallback hardcodeado si viene vacío o falla.
    const productos = await listCatalogo()
    return Response.json({ productos })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// Crear un tipo de prenda. Lo usa cualquier vendedor desde el selector del
// pedido: si la prenda no está en la lista, tiene que poder darla de alta sin
// esperar a un admin.
export async function POST(req) {
  try {
    const { nombre } = await req.json()
    const limpio = String(nombre ?? '').trim().toUpperCase()
    if (!limpio) return Response.json({ error: 'Nombre requerido' }, { status: 400 })

    // Evita el "HOODIE SPIDERMAN" / "HOODIES SPIDERMAN" que ya ensució el catálogo.
    const existentes = await listCatalogo()
    if (existentes.some(p => String(p.NOMBRE).trim().toUpperCase() === limpio)) {
      return Response.json({ error: `"${limpio}" ya existe en el catálogo` }, { status: 409 })
    }

    // dual-write: Sheets (append [NOMBRE,'TRUE']) + Supabase (upsert por nombre).
    await addCatalogo(limpio)
    return Response.json({ ok: true, nombre: limpio })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// Renombrar / activar / desactivar. Solo ADMIN: el catálogo lo ven todos los
// vendedores.
export async function PATCH(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { nombre, nuevoNombre, activo } = await req.json()
    if (!nombre) return Response.json({ error: 'nombre requerido' }, { status: 400 })

    if (nuevoNombre !== undefined) {
      const destino = String(nuevoNombre).trim().toUpperCase()
      if (!destino) return Response.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
      if (destino !== String(nombre).trim().toUpperCase()) {
        const existentes = await listCatalogoGestion()
        if (existentes.some(p => p.NOMBRE.trim() === destino)) {
          return Response.json({ error: `"${destino}" ya existe en el catálogo` }, { status: 409 })
        }
      }
    }

    await updateCatalogo(nombre, { nuevoNombre, activo })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { nombre } = await req.json()
    if (!nombre) return Response.json({ error: 'nombre requerido' }, { status: 400 })

    // Si ya se vendió, borrarlo dejaría el histórico sin referencia en el
    // catálogo: se obliga a desactivar.
    const enUso = (await listCatalogoGestion())
      .find(p => p.NOMBRE.trim() === String(nombre).trim().toUpperCase())
    if (enUso && enUso.USOS > 0) {
      return Response.json({
        error: `"${enUso.NOMBRE}" ya se usó en ${enUso.USOS} prenda(s). Desactívalo en vez de borrarlo.`,
      }, { status: 409 })
    }

    await deleteCatalogo(nombre)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
