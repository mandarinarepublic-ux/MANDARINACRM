export const dynamic = 'force-dynamic'
import { readSheet } from '@/lib/sheets'
import { logCambio } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { parseSubestados, serializeSubestados } from '@/lib/subestados'
import {
  updateItem,
  updateSubestado,
  updateNotasArea,
  updateSubestadoCorte,
  softDeleteItem,
} from '@/lib/db/detalle'
import { setEstado } from '@/lib/db/pedidos'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    // Buscar el ítem (se necesita para logs y auto-avance; las escrituras van por repo).
    const detalles = await readSheet('DETALLE_PEDIDO')
    const idx = detalles.findIndex(d => d.ITEM_ID === id)
    if (idx === -1) return Response.json({ error: 'Ítem no encontrado' }, { status: 404 })

    const item = detalles[idx]
    const bodyKeys = Object.keys(body).filter(k => !k.startsWith('_'))

    // ── CASO 1: solo NOTAS_AREA ──────────────────────────────────────────────
    if (bodyKeys.length === 1 && bodyKeys[0] === 'NOTAS_AREA') {
      await updateNotasArea(id, body.NOTAS_AREA ?? '')
      if (body.NOTAS_AREA) {
        await logCambio(item.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId).catch(() => {})
      }
      return Response.json({ ok: true })
    }

    // ── CASO 1b: solo SUBESTADO_CORTE ────────────────────────────────────────
    if (bodyKeys.length === 1 && bodyKeys[0] === 'SUBESTADO_CORTE') {
      await updateSubestadoCorte(id, body.SUBESTADO_CORTE)
      await logCambio(item.PEDIDO_ID, `CORTE ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO_CORTE || 'PENDIENTE', body.SUBESTADO_CORTE, usuarioId).catch(() => {})
      return Response.json({ ok: true })
    }

    // ── CASO 2: SUBESTADO (posible multi-área con AREA_ROL) ───────────────────
    if (bodyKeys.length <= 2 && bodyKeys.includes('SUBESTADO')) {
      const areaRol = body.AREA_ROL // área específica que cambia
      const nuevoEstado = body.SUBESTADO

      // Valor resultante (para log y chequeo de auto-avance). El repo recomputa
      // internamente lo mismo para la escritura dual.
      let nuevoValor
      if (areaRol) {
        const subestados = parseSubestados(item.SUBESTADO, item.AREA)
        subestados[areaRol] = nuevoEstado
        nuevoValor = serializeSubestados(subestados)
      } else {
        nuevoValor = nuevoEstado
      }

      await updateSubestado(id, nuevoEstado, areaRol)
      await logCambio(item.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}${areaRol ? ` (${areaRol})` : ''}`, item.SUBESTADO, nuevoValor, usuarioId).catch(() => {})

      // ── Auto-avance a DESPACHO si TODOS los ítems del pedido están LISTO ──
      try {
        const todosDetalles = await readSheet('DETALLE_PEDIDO')
        const itemsDelPedido = todosDetalles.filter(
          d => d.PEDIDO_ID === item.PEDIDO_ID && d.SUBESTADO !== 'ELIMINADO' && d.SUBESTADO !== 'ENTREGADO_TIENDA'
        )
        // Reflejar en memoria el valor recién guardado del ítem actual.
        const itemsActualizados = itemsDelPedido.map(d =>
          d.ITEM_ID === id ? { ...d, SUBESTADO: nuevoValor } : d
        )
        const todosListos = itemsActualizados.every(d => {
          const sub = d.SUBESTADO || ''
          if (sub.includes(':')) {
            return sub.split('|').every(p => p.split(':')[1]?.trim() === 'LISTO')
          }
          return sub === 'LISTO'
        })
        if (todosListos) {
          const pedidos = await readSheet('PEDIDOS')
          const pedido = pedidos.find(p => p.PEDIDO_ID === item.PEDIDO_ID)
          if (pedido && pedido.ESTADO_PEDIDO === 'EN_FABRICA') {
            // dual-write: solo la celda ESTADO_PEDIDO (Sheets + Supabase).
            await setEstado(item.PEDIDO_ID, 'DESPACHO')
            await logCambio(item.PEDIDO_ID, 'ESTADO_PEDIDO', 'EN_FABRICA', 'DESPACHO', 'SISTEMA').catch(() => {})
          }
        }
      } catch (autoErr) {
        console.error('Auto-avance DESPACHO error:', autoErr)
        // No bloqueamos la respuesta si falla el auto-avance
      }

      return Response.json({ ok: true, subestado: nuevoValor })
    }

    // ── CASO 3: edición general del ítem (editar-pedido) ──────────────────────
    // Solo campos de producto (nombre/color/talla/área/cantidad/precio/subtotal/fotos).
    const campos = {}
    if (body.PRODUCTO_NOMBRE !== undefined)       campos.PRODUCTO_NOMBRE = body.PRODUCTO_NOMBRE
    if (body.COLOR !== undefined)                 campos.COLOR = body.COLOR
    if (body.TALLA !== undefined)                 campos.TALLA = body.TALLA
    if (body.AREA !== undefined)                  campos.AREA = body.AREA
    if (body.DETALLE_PERSONALIZADO !== undefined) campos.DETALLE_PERSONALIZADO = body.DETALLE_PERSONALIZADO
    if (body.CANTIDAD !== undefined) {
      campos.CANTIDAD = String(body.CANTIDAD)
      campos.SUBTOTAL = String((parseFloat(item.PRECIO_UNIT || 0) * parseInt(body.CANTIDAD || 1)).toFixed(2))
    }
    if (body.PRECIO_UNIT !== undefined) {
      campos.PRECIO_UNIT = String(body.PRECIO_UNIT)
      campos.SUBTOTAL = String((parseFloat(body.PRECIO_UNIT) * parseInt(body.CANTIDAD ?? item.CANTIDAD ?? 1)).toFixed(2))
    }
    if (body.SUBTOTAL !== undefined) campos.SUBTOTAL = String(body.SUBTOTAL)

    // Fotos: '' limpia, http se conserva, base64 se sube a Cloudinary.
    for (const field of ['FOTO_PECHO_URL', 'FOTO_ESPALDA_URL', 'FOTO_MANGA_D_URL', 'FOTO_MANGA_I_URL']) {
      if (body[field] === undefined) continue
      if (body[field] === '') { campos[field] = '' }
      else if (body[field].startsWith('http')) { campos[field] = body[field] }
      else if (body[field].startsWith('data:')) {
        try {
          const r = await uploadToCloudinary(body[field], `${id}_${field}.jpg`, 'mandarina-pro/pedidos')
          campos[field] = r.url
        } catch (e) { console.error('Photo upload error:', e.message) }
      }
    }

    // Escritura principal de campos editables (dual-write, reescribe fila en Sheets).
    await updateItem(id, campos)

    // Defensivo: SUBESTADO / NOTAS_AREA en una edición general (hoy no los manda
    // la UI, pero se preservan por compatibilidad). Cada uno es su propio dual-write.
    if (body.SUBESTADO !== undefined)  await updateSubestado(id, body.SUBESTADO)
    if (body.NOTAS_AREA !== undefined) await updateNotasArea(id, body.NOTAS_AREA)

    // Logs (idénticos a la versión previa).
    if (body.SUBESTADO) await logCambio(item.PEDIDO_ID, `SUBESTADO ${item.PRODUCTO_NOMBRE}`, item.SUBESTADO, body.SUBESTADO, usuarioId).catch(() => {})
    if (body.NOTAS_AREA && body.NOTAS_AREA !== item.NOTAS_AREA) await logCambio(item.PEDIDO_ID, `NOTA ${item.PRODUCTO_NOMBRE}`, '', body.NOTAS_AREA, usuarioId).catch(() => {})

    const cambios = []
    if (body.COLOR !== undefined && body.COLOR !== item.COLOR) cambios.push(`Color: ${item.COLOR}→${body.COLOR}`)
    if (body.TALLA !== undefined && body.TALLA !== item.TALLA) cambios.push(`Talla: ${item.TALLA}→${body.TALLA}`)
    if (body.CANTIDAD !== undefined && String(body.CANTIDAD) !== String(item.CANTIDAD)) cambios.push(`Cant: ${item.CANTIDAD}→${body.CANTIDAD}`)
    if (body.PRECIO_UNIT !== undefined && String(body.PRECIO_UNIT) !== String(item.PRECIO_UNIT)) cambios.push(`Precio: $${item.PRECIO_UNIT}→$${body.PRECIO_UNIT}`)
    if (body.AREA !== undefined && body.AREA !== item.AREA) cambios.push(`Área: ${item.AREA}→${body.AREA}`)
    if (cambios.length > 0) await logCambio(item.PEDIDO_ID, `EDICION ${item.PRODUCTO_NOMBRE}`, '', cambios.join(' | '), usuarioId).catch(() => {})

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH item error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    // Se lee para el log (PRODUCTO_NOMBRE / PEDIDO_ID); la escritura va por repo.
    const detalles = await readSheet('DETALLE_PEDIDO')
    const item = detalles.find(d => d.ITEM_ID === id)
    if (!item) return Response.json({ error: 'Ítem no encontrado' }, { status: 404 })

    // Soft-delete dual-write: Sheets SUBESTADO='ELIMINADO', Supabase eliminado=true.
    await softDeleteItem(id, usuarioId)
    await logCambio(item.PEDIDO_ID, 'ITEM_ELIMINADO', item.PRODUCTO_NOMBRE, 'ELIMINADO', usuarioId).catch(() => {})
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
