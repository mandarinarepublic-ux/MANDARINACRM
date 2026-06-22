export const dynamic = 'force-dynamic'
import { readSheet, updateRow, appendRow, fechaAhora } from '@/lib/sheets'
import { logCambio, subestadoInicial, generateItemId } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { v4 as uuid } from 'uuid'

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    const pedidos = await readSheet('PEDIDOS')
    const idx = pedidos.findIndex(p => p.PEDIDO_ID === id)
    if (idx === -1) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const pedido = pedidos[idx]
    const now = fechaAhora()
    const changes = []
    const updated = { ...pedido }

    if (body.ESTADO_PEDIDO && body.ESTADO_PEDIDO !== pedido.ESTADO_PEDIDO) {
      changes.push({ campo: 'ESTADO_PEDIDO', antes: pedido.ESTADO_PEDIDO, despues: body.ESTADO_PEDIDO })
      updated.ESTADO_PEDIDO = body.ESTADO_PEDIDO
    }

    if (body.DIRECCION_TEXTO !== undefined) {
      if (body.DIRECCION_TEXTO !== pedido.DIRECCION_TEXTO && body.DIRECCION_TEXTO !== pedido.DIRECCION_PEDIDO) {
        changes.push({ campo: 'DIRECCION', antes: pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO, despues: body.DIRECCION_TEXTO })
      }
      updated.DIRECCION_TEXTO  = body.DIRECCION_TEXTO
      updated.DIRECCION_PEDIDO = body.DIRECCION_TEXTO
    }

    if (body.FECHA_ENTREGA_PROMETIDA) {
      changes.push({ campo: 'FECHA_ENTREGA', antes: pedido.FECHA_ENTREGA_PROMETIDA, despues: body.FECHA_ENTREGA_PROMETIDA })
      updated.FECHA_ENTREGA_PROMETIDA = body.FECHA_ENTREGA_PROMETIDA
    }

    if (body.NOTAS_VENDEDOR !== undefined) updated.NOTAS_VENDEDOR = body.NOTAS_VENDEDOR

    if (body.MONTO_TOTAL !== undefined) {
      updated.MONTO_TOTAL     = String(body.MONTO_TOTAL)
      updated.MONTO_ABONADO   = String(body.MONTO_ABONADO || pedido.MONTO_ABONADO)
      updated.MONTO_PENDIENTE = String(body.MONTO_PENDIENTE || 0)
      updated.ESTADO_PAGO     = body.ESTADO_PAGO || pedido.ESTADO_PAGO
    }

    // ── NUEVO: marcar pedido como impreso para producción ──────────────────
    // Se usa desde /dashboard/impresion al terminar de generar el PDF.
    // Permite alertar si alguien intenta reimprimir un pedido ya impreso.
    if (body.marcarImpreso) {
      changes.push({
        campo: 'IMPRESION_PRODUCCION',
        antes: pedido.FECHA_IMPRESION_PRODUCCION || '(nunca impreso)',
        despues: now,
      })
      updated.FECHA_IMPRESION_PRODUCCION = now
      updated.IMPRESO_POR = usuarioId
    }

    updated.FECHA_ACTUALIZACION = now

    // ── Leer headers reales de PEDIDOS ────────────────────────────────────────
    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'PEDIDOS!A2:AZ2', // ampliado de Z a AZ — ver nota en lib/sheets.js
    })
    const headers = headerRes.data.values?.[0] || []

    const fieldMap = {
      'PEDIDO_ID':               updated.PEDIDO_ID,
      'TIENDA_ID':               updated.TIENDA_ID,
      'VENDEDOR_ID':             updated.VENDEDOR_ID,
      'CLIENTE_ID':              updated.CLIENTE_ID,
      'FECHA_PEDIDO':            updated.FECHA_PEDIDO,
      'FECHA_ACTUALIZACION':     updated.FECHA_ACTUALIZACION,
      'FECHA_ENTREGA_PROMETIDA': updated.FECHA_ENTREGA_PROMETIDA || '',
      'DIAS_CALCULADO':          updated.DIAS_CALCULADO || '',
      'DIAS_PROMETIDO':          updated.DIAS_PROMETIDO || '',
      'ALERTA_ENTREGA':          updated.ALERTA_ENTREGA || '',
      'ESTADO_PEDIDO':           updated.ESTADO_PEDIDO,
      'ESTADO_PAGO':             updated.ESTADO_PAGO,
      'MONTO_TOTAL':             updated.MONTO_TOTAL,
      'MONTO_ABONADO':           updated.MONTO_ABONADO,
      'MONTO_PENDIENTE':         updated.MONTO_PENDIENTE,
      'FACTURA_SOLICITADA':      updated.EMITIR_FACTURA || updated.FACTURA_SOLICITADA || '',
      'FACTURA_DATIL_ID':        updated.NUMERO_FACTURA || updated.FACTURA_DATIL_ID || '',
      'NOTAS_VENDEDOR':          updated.NOTAS_VENDEDOR || '',
      'GUIA_NUMERO':             updated.GUIA_NUMERO || '',
      'GUIA_TRANSPORTISTA':      updated.GUIA_TRANSPORTISTA || '',
      'DIRECCION_TEXTO':         updated.DIRECCION_TEXTO || updated.DIRECCION_PEDIDO || '',
      'DIRECCION_PEDIDO':        updated.DIRECCION_TEXTO || updated.DIRECCION_PEDIDO || '',
      'LATITUD':                 updated.LATITUD || '',
      'LONGITUD':                updated.LONGITUD || '',
      // ── NUEVO ──────────────────────────────────────────────────────────────
      'FECHA_IMPRESION_PRODUCCION': updated.FECHA_IMPRESION_PRODUCCION || '',
      'IMPRESO_POR':                updated.IMPRESO_POR || '',
    }

    const row = headers.map(h =>
      fieldMap[h] !== undefined ? String(fieldMap[h]) : String(updated[h] || '')
    )
    await updateRow('PEDIDOS', idx, row)

    for (const c of changes) {
      await logCambio(id, c.campo, c.antes, c.despues, usuarioId)
    }

    // ── GUÍA DE DESPACHO → graba en hoja GUIAS_DESPACHO ─────────────────────
    // La hoja PEDIDOS NO tiene columna de foto — el registro completo va a GUIAS_DESPACHO
    if (body.GUIA_NUMERO) {
      // 1. Subir foto a Cloudinary si viene base64
      let fotoGuiaUrl = ''
      if (body.GUIA_FOTO_BASE64) {
        try {
          const cloudFolder = `mandarina-pro/guias`
          const r = await uploadToCloudinary(
            body.GUIA_FOTO_BASE64,
            `guia_${id}_${Date.now()}.jpg`,
            cloudFolder
          )
          fotoGuiaUrl = r.url
        } catch (uploadErr) {
          console.error('Error subiendo foto de guía:', uploadErr.message)
          // No bloquear el despacho si falla la foto
        }
      }

      // 2. Guardar fila en GUIAS_DESPACHO
      // Estructura: GUIA_ID | PEDIDO_ID | NUMERO_GUIA | TRANSPORTISTA | FOTO_GUIA_URL | FECHA_DESPACHO | REGISTRADO_POR | NOTAS
      await appendRow('GUIAS_DESPACHO', [
        uuid(),                          // GUIA_ID
        id,                              // PEDIDO_ID
        body.GUIA_NUMERO.trim(),         // NUMERO_GUIA
        body.GUIA_TRANSPORTISTA || 'SERVIENTREGA', // TRANSPORTISTA
        fotoGuiaUrl,                     // FOTO_GUIA_URL (URL de Cloudinary o vacío)
        now,                             // FECHA_DESPACHO
        usuarioId,                       // REGISTRADO_POR
        body.GUIA_NOTAS || '',           // NOTAS
      ])

      // 3. Log en bitácora
      await logCambio(
        id, 'GUIA_DESPACHO', '',
        `${body.GUIA_TRANSPORTISTA || 'SERVIENTREGA'} #${body.GUIA_NUMERO}${fotoGuiaUrl ? ' 📷' : ''}`,
        usuarioId
      )
    }

    // ── Nuevo ítem ────────────────────────────────────────────────────────────
    if (body.nuevoItem) {
      const detalles = await readSheet('DETALLE_PEDIDO')
      const itemsExistentes = detalles.filter(d => d.PEDIDO_ID === id).length
      const itemId = await generateItemId(id, itemsExistentes + 1)
      const item = body.nuevoItem
      const cloudFolder = `mandarina-pro/pedidos/${id}`
      const initSubestado = subestadoInicial(item.area)

      async function processPhoto(data, name) {
        if (!data) return ''
        if (data.startsWith('http')) return data
        if (data.startsWith('data:')) {
          try {
            const r = await uploadToCloudinary(data, name, cloudFolder)
            return r.url
          } catch(e) { console.error('Photo upload error:', e.message); return '' }
        }
        return ''
      }

      const fotoPecho   = await processPhoto(item.fotoPecho   || item.imagenShopify || '', `${itemId}_pecho.jpg`)
      const fotoEspalda = await processPhoto(item.fotoEspalda || '', `${itemId}_espalda.jpg`)
      const fotoMangaD  = await processPhoto(item.fotoMangaD  || '', `${itemId}_manga_d.jpg`)
      const fotoMangaI  = await processPhoto(item.fotoMangaI  || '', `${itemId}_manga_i.jpg`)

      await appendRow('DETALLE_PEDIDO', [
        itemId, id, updated.TIENDA_ID,
        item.productoNombre, item.detalle || '', item.esPersonalizado ? 'TRUE' : 'FALSE',
        item.color || '', item.talla || '',
        String(item.cantidad || 1), String(item.precioUnit || 0),
        String((parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)),
        item.area || '', initSubestado,
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        item.shopifyVariantId || '',
        fechaAhora(), '',
      ])

      await logCambio(id, 'ITEM_AGREGADO', '', item.productoNombre, usuarioId)
    }

    // ── Nuevo pago ────────────────────────────────────────────────────────────
    if (body.nuevoPago) {
      const pago = body.nuevoPago
      const montoNuevo = parseFloat(pago.monto || 0)
      if (montoNuevo > 0) {
        await appendRow('PAGOS', [
          uuid(), id, pago.tipo || 'EFECTIVO',
          String(montoNuevo.toFixed(2)), now, 'PAGADO',
          '', '', '', pago.fotoComprobante || '',
          usuarioId, pago.notas || '',
        ])
        await logCambio(id, 'PAGO_AGREGADO', '', `$${montoNuevo.toFixed(2)} ${pago.tipo}`, usuarioId)
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('PATCH pedido error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
