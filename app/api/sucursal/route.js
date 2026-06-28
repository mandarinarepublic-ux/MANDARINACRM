import { readSheet, getSheets, formatFecha } from '@/lib/sheets'
import { uploadToCloudinary } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'

const SHEET_ID = process.env.SHEET_ID
const HOJA = 'SUCURSAL'

// Columnas en orden exacto de la hoja
const COLS = [
  'ID', 'NOMBRE', 'TIENDA', 'TALLA', 'COLOR',
  'STOCK', 'RESERVADO', 'PRECIO', 'FOTO_URL', 'ACTIVO',
  'FECHA_CREACION', 'CREADO_POR', 'ULTIMA_MODIFICACION', 'MODIFICADO_POR'
]

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
      fotoFinal = await uploadToCloudinary(foto_base64, `sucursal_${Date.now()}`)
    }

    const ahora = formatFecha(new Date())
    const id = `SUC-${Date.now()}`

    const fila = [
      id,                          // ID
      nombre,                      // NOMBRE
      tienda,                      // TIENDA
      talla || 'U',               // TALLA
      color || '',                 // COLOR
      parseInt(stock),             // STOCK
      0,                           // RESERVADO
      parseFloat(precio || 0),     // PRECIO
      fotoFinal,                   // FOTO_URL
      'TRUE',                      // ACTIVO
      ahora,                       // FECHA_CREACION
      usuario || '',               // CREADO_POR
      ahora,                       // ULTIMA_MODIFICACION
      usuario || '',               // MODIFICADO_POR
    ]

    const sheets = await getSheets()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${HOJA}!A:N`,
      valueInputOption: 'RAW',
      requestBody: { values: [fila] },
    })

    return Response.json({ ok: true, id, producto: Object.fromEntries(COLS.map((c, i) => [c, fila[i]])) })
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

    const sheets = await getSheets()

    // Leer hoja para encontrar la fila
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${HOJA}!A:N`,
    })

    const rows = res.data.values || []
    const header = rows[0]
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === id)

    if (rowIndex === -1) {
      return Response.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    const fila = [...rows[rowIndex]]
    const idx = (col) => COLS.indexOf(col)
    const ahora = formatFecha(new Date())

    if (accion === 'vender') {
      // Descontar 1 unidad al confirmar pedido
      const stockActual = parseInt(fila[idx('STOCK')] || '0')
      const reservado = parseInt(fila[idx('RESERVADO')] || '0')

      if (stockActual <= 0) {
        return Response.json({ error: 'Sin stock disponible' }, { status: 400 })
      }

      fila[idx('STOCK')] = stockActual - 1
      fila[idx('RESERVADO')] = reservado + 1

      // Si llega a 0, desactivar
      if (stockActual - 1 <= 0) {
        fila[idx('ACTIVO')] = 'FALSE'
      }

    } else if (accion === 'despachar') {
      // Confirmar salida física al despachar
      const reservado = parseInt(fila[idx('RESERVADO')] || '0')
      fila[idx('RESERVADO')] = Math.max(0, reservado - 1)

    } else if (accion === 'cancelar') {
      // Devolver unidad si se cancela el pedido
      const stockActual = parseInt(fila[idx('STOCK')] || '0')
      const reservado = parseInt(fila[idx('RESERVADO')] || '0')
      fila[idx('STOCK')] = stockActual + 1
      fila[idx('RESERVADO')] = Math.max(0, reservado - 1)
      fila[idx('ACTIVO')] = 'TRUE'

    } else {
      // Edición manual de campos
      if (campos.nombre !== undefined)  fila[idx('NOMBRE')] = campos.nombre
      if (campos.tienda !== undefined)  fila[idx('TIENDA')] = campos.tienda
      if (campos.talla !== undefined)   fila[idx('TALLA')]  = campos.talla
      if (campos.color !== undefined)   fila[idx('COLOR')]  = campos.color
      if (campos.stock !== undefined) {
        fila[idx('STOCK')]  = parseInt(campos.stock)
        fila[idx('ACTIVO')] = parseInt(campos.stock) > 0 ? 'TRUE' : 'FALSE'
      }
      if (campos.precio !== undefined)    fila[idx('PRECIO')]   = parseFloat(campos.precio)
      if (campos.foto_url !== undefined)  fila[idx('FOTO_URL')] = campos.foto_url

      // Subir nueva foto si viene en base64
      if (campos.foto_base64 && campos.foto_base64.startsWith('data:')) {
        fila[idx('FOTO_URL')] = await uploadToCloudinary(campos.foto_base64, `sucursal_${Date.now()}`)
      }
    }

    // Siempre actualizar quien modificó y cuándo
    fila[idx('ULTIMA_MODIFICACION')] = ahora
    fila[idx('MODIFICADO_POR')] = usuario || ''

    // Escribir fila actualizada (rowIndex+1 porque Sheets es 1-based)
    const rangoFila = `${HOJA}!A${rowIndex + 1}:N${rowIndex + 1}`
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: rangoFila,
      valueInputOption: 'RAW',
      requestBody: { values: [fila] },
    })

    return Response.json({
      ok: true,
      stock: parseInt(fila[idx('STOCK')]),
      activo: fila[idx('ACTIVO')] === 'TRUE',
    })
  } catch (e) {
    console.error('PATCH sucursal error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
