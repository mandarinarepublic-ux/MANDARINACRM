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

// Crear un tipo de prenda. SOLO ADMIN desde el 7-oct-2026.
//
// ☠️ Antes lo podía hacer cualquier vendedor desde el selector del pedido, y el
// catálogo llegó a 346 tipos activos: 10 versiones de HOODIE PREMIUM, nombres
// cortados (BUZ, CAMISETA P), personajes (HOODIE SPIDERMAN) y notas de pedido
// metidas como tipo. Se limpió a 194 (respaldo en
// crm.respaldo_productos_catalogo_20261007).
export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) {
      const error = auth.status === 403 ? 'Solo un ADMIN puede crear tipos de prenda' : auth.error
      return Response.json({ error }, { status: auth.status })
    }

    const { nombre } = await req.json()
    const limpio = String(nombre ?? '').trim().toUpperCase()
    if (!limpio) return Response.json({ error: 'Nombre requerido' }, { status: 400 })

    // Evita el "HOODIE SPIDERMAN" / "HOODIES SPIDERMAN" que ya ensució el catálogo.
    // ☠️ Contra el catálogo COMPLETO, no solo los activos: addCatalogo hace un
    // upsert con activo=true, así que "crear" uno desactivado lo REACTIVABA en
    // silencio (HOODIE SPIDERMAN volvía al buscador de todos).
    const existentes = await listCatalogoGestion()
    const previo = existentes.find(p => String(p.NOMBRE).trim().toUpperCase() === limpio)
    if (previo) {
      const error = previo.ACTIVO
        ? `"${limpio}" ya existe en el catálogo`
        : `"${limpio}" existe pero está DESACTIVADO. Si de verdad hace falta, actívalo en Tipos de prenda.`
      return Response.json({ error }, { status: 409 })
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
