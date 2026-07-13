import { readSheet } from '@/lib/sheets'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { shadow } from '@/lib/db/_backend'
import {
  listSucursalSupabase,
  createSucursalProducto,
  updateSucursalProducto,
  ajustarStock,
} from '@/lib/db/sucursal'

export const dynamic = 'force-dynamic'

const HOJA = 'SUCURSAL'

// ─── GET — listar productos de sucursal ──────────────────────────────────────
// ?tienda=Mandarina | Indstore   (opcional)
// ?todos=true                    (incluye stock=0, solo para admin/catálogo)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const tiendaFiltro = searchParams.get('tienda')
    const todos = searchParams.get('todos') === 'true'

    let productos = await readSheet(HOJA)

    // Filtrar por tienda si se especifica
    if (tiendaFiltro) {
      productos = productos.filter(p =>
        p.TIENDA?.toLowerCase() === tiendaFiltro.toLowerCase()
      )
    }

    // Por defecto solo mostrar activos con stock > 0
    if (!todos) {
      productos = productos.filter(p =>
        p.ACTIVO === 'TRUE' && parseInt(p.STOCK || '0') > 0
      )
    }

    // Parsear numéricos
    productos = productos.map(p => ({
      ...p,
      STOCK: parseInt(p.STOCK || '0'),
      RESERVADO: parseInt(p.RESERVADO || '0'),
      PRECIO: parseFloat(p.PRECIO || '0'),
    }))

    await shadow('sucursal.list', productos, () => listSucursalSupabase({ tienda: tiendaFiltro, todos }))

    return Response.json({ productos })
  } catch (e) {
    console.error('GET sucursal error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST — agregar producto nuevo ───────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json()
    const {
      nombre, tienda, talla, color,
      stock, precio, foto_url, foto_base64,
      usuario // quien crea
    } = body

    if (!nombre || !tienda || !stock) {
      return Response.json({ error: 'Faltan campos requeridos: nombre, tienda, stock' }, { status: 400 })
    }

    // Subir foto a Cloudinary si viene en base64
    let fotoFinal = foto_url || ''
    if (foto_base64 && foto_base64.startsWith('data:')) {
      const result = await uploadToCloudinary(foto_base64, `sucursal_${Date.now()}`, 'sucursal')
      fotoFinal = result.url
    }

    // dual-write: Sheets (append A-N idéntico) + Supabase (insert).
    const id = await createSucursalProducto({
      nombre, tienda, talla, color, stock, precio,
      foto_url: fotoFinal, usuario,
    })

    return Response.json({ ok: true, id })
  } catch (e) {
    console.error('POST sucursal error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// ─── PATCH — editar producto o descontar stock ───────────────────────────────
export async function PATCH(req) {
  try {
    const body = await req.json()
    const { id, usuario, accion, ...campos } = body

    if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })

    if (accion === 'vender' || accion === 'despachar' || accion === 'cancelar') {
      // Ajuste de stock (dual-write). Corrige el bug del rowIndex+4: el repo
      // localiza la fila por readSheet+updateRow (misma convención de lectura).
      await ajustarStock(id, accion, usuario)
    } else {
      // Edición manual. La foto base64 se sube antes; el repo espera foto_url.
      if (campos.foto_base64 && campos.foto_base64.startsWith('data:')) {
        const result = await uploadToCloudinary(campos.foto_base64, `sucursal_${Date.now()}`, 'sucursal')
        campos.foto_url = result.url
      }
      await updateSucursalProducto(id, {
        nombre:   campos.nombre,
        tienda:   campos.tienda,
        talla:    campos.talla,
        color:    campos.color,
        stock:    campos.stock,
        precio:   campos.precio,
        foto_url: campos.foto_url,
      }, usuario)
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH sucursal error:', e)
    const msg = e.message || ''
    if (/sin stock/i.test(msg))    return Response.json({ error: msg }, { status: 400 })
    if (/no encontrado/i.test(msg)) return Response.json({ error: msg }, { status: 404 })
    return Response.json({ error: msg }, { status: 500 })
  }
}
