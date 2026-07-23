export const dynamic = 'force-dynamic'
import { requireAdmin, HEADER_USUARIO } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { fechaAhora } from '@/lib/sheets'
import { logCambio, subestadoInicial } from '@/lib/pedidos'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { updatePedido, markImpreso, getPedidoById } from '@/lib/db/pedidos'
import { createGuia } from '@/lib/db/guias'
import { createItem } from '@/lib/db/detalle'
import { createPago } from '@/lib/db/pagos'

// Detalle de UN pedido (join acotado a ese id vía getPedidoById). Las pantallas
// de detalle y edición antes bajaban la lista COMPLETA con join de 5 tablas solo
// para mostrar uno; esto trae únicamente ese pedido → mucho más rápido.
export async function GET(req, { params }) {
  try {
    const pedido = await getPedidoById(params.id)
    if (!pedido) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // Un VENDEDOR solo abre sus propios pedidos. Se resuelve su rol contra la
    // base a partir de la cabecera de sesión, no del rol que diga el navegador.
    // Sin cabecera no se restringe: el resto de pantallas (producción, despacho,
    // tablero) consultan por otras vías y no la mandan.
    const sesionId = req.headers.get(HEADER_USUARIO)
    if (sesionId) {
      const usuario = await getUsuarioById(sesionId).catch(() => null)
      if (usuario?.ROL === 'VENDEDOR') {
        const suyo = pedido.VENDEDOR_ID === usuario.USUARIO_ID || pedido.VENDEDOR_ID === usuario.NOMBRE
        if (!suyo) return Response.json({ error: 'Este pedido es de otro vendedor' }, { status: 403 })
      }
    }

    return Response.json({ pedido })
  } catch (e) {
    console.error('GET pedido/[id] error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = params
    const body = await req.json()
    const usuarioId = body._usuarioId || 'SISTEMA'

    // Lectura vía repo (respeta DATA_BACKEND) para diffear contra el valor actual.
    const pedido = await getPedidoById(id)
    if (!pedido) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const now = fechaAhora()
    const changes = []

    // ── Campos editables del pedido (dual-write, escritura parcial por celda) ──
    const campos = {}

    if (body.ESTADO_PEDIDO && body.ESTADO_PEDIDO !== pedido.ESTADO_PEDIDO) {
      changes.push({ campo: 'ESTADO_PEDIDO', antes: pedido.ESTADO_PEDIDO, despues: body.ESTADO_PEDIDO })
      campos.estadoPedido = body.ESTADO_PEDIDO
    }

    if (body.DIRECCION_TEXTO !== undefined) {
      if (body.DIRECCION_TEXTO !== pedido.DIRECCION_TEXTO && body.DIRECCION_TEXTO !== pedido.DIRECCION_PEDIDO) {
        changes.push({ campo: 'DIRECCION', antes: pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO, despues: body.DIRECCION_TEXTO })
      }
      campos.direccionPedido = body.DIRECCION_TEXTO
    }

    if (body.FECHA_ENTREGA_PROMETIDA) {
      changes.push({ campo: 'FECHA_ENTREGA', antes: pedido.FECHA_ENTREGA_PROMETIDA, despues: body.FECHA_ENTREGA_PROMETIDA })
      campos.fechaEntregaPrometida = body.FECHA_ENTREGA_PROMETIDA
    }

    if (body.NOTAS_VENDEDOR !== undefined) campos.notasVendedor = body.NOTAS_VENDEDOR

    if (body.MONTO_TOTAL !== undefined) {
      campos.montoTotal     = body.MONTO_TOTAL
      campos.montoAbonado   = body.MONTO_ABONADO || pedido.MONTO_ABONADO
      campos.montoPendiente = Math.max(0, Number(body.MONTO_PENDIENTE) || 0)
      campos.estadoPago     = body.ESTADO_PAGO || pedido.ESTADO_PAGO
    }

    if (Object.keys(campos).length > 0) {
      await updatePedido(id, campos)
    }

    // Marcar impreso para producción (fecha + usuario). Va por su propio dual-write
    // (usa timestamp ISO para Supabase, no el string de la hoja).
    let impresion = null
    if (body.marcarImpreso) {
      // markImpreso devuelve el valor REALMENTE persistido (difiere por backend),
      // para que la bitácora no registre un valor distinto del que quedó guardado.
      impresion = await markImpreso(id, usuarioId)
      changes.push({
        campo: 'IMPRESION_PRODUCCION',
        antes: pedido.FECHA_IMPRESION_PRODUCCION || '(nunca impreso)',
        despues: impresion?.fecha || now,
      })
    }

    // Nota libre para la bitácora, sin tocar ningún campo del pedido. La usa
    // Despacho al cerrar un pedido SIN guía (taxi, retiro en tienda), para que
    // quede constancia de por qué se cerró y quién lo hizo.
    if (body.NOTA) {
      changes.push({ campo: 'NOTA', antes: '', despues: String(body.NOTA).slice(0, 500) })
    }

    for (const c of changes) {
      await logCambio(id, c.campo, c.antes, c.despues, usuarioId)
    }

    // ── GUÍA DE DESPACHO → hoja GUIAS_DESPACHO (dual-write) ────────────────────
    if (body.GUIA_NUMERO) {
      let fotoGuiaUrl = ''
      if (body.GUIA_FOTO_BASE64) {
        try {
          const r = await uploadToCloudinary(
            body.GUIA_FOTO_BASE64,
            `guia_${id}_${Date.now()}.jpg`,
            `mandarina-pro/guias`
          )
          fotoGuiaUrl = r.url
        } catch (uploadErr) {
          console.error('Error subiendo foto de guía:', uploadErr.message)
          // No bloquear el despacho si falla la foto
        }
      }

      await createGuia({
        pedidoId: id,
        numero: body.GUIA_NUMERO.trim(),
        transportista: body.GUIA_TRANSPORTISTA || 'SERVIENTREGA',
        fotoUrl: fotoGuiaUrl,
        registradoPor: usuarioId,
        notas: body.GUIA_NOTAS || '',
      })

      await logCambio(
        id, 'GUIA_DESPACHO', '',
        `${body.GUIA_TRANSPORTISTA || 'SERVIENTREGA'} #${body.GUIA_NUMERO}${fotoGuiaUrl ? ' 📷' : ''}`,
        usuarioId
      )
    }

    // ── Nuevo ítem (dual-write; createItem incluye ARCHIVO_DISENO, deuda #2) ───
    // SOLO ADMIN: sumar prendas a un pedido ya confirmado cambia el total y la
    // carga de fábrica. El vendedor arma el pedido completo antes de aprobarlo.
    if (body.nuevoItem) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

      const item = body.nuevoItem
      const cloudFolder = `mandarina-pro/pedidos/${id}`

      async function processPhoto(data, name) {
        if (!data) return ''
        if (data.startsWith('http')) return data
        if (data.startsWith('data:')) {
          try {
            const r = await uploadToCloudinary(data, name, cloudFolder)
            return r.url
          } catch (e) { console.error('Photo upload error:', e.message); return '' }
        }
        return ''
      }

      // itemId se resuelve dentro de createItem (cuenta ítems del pedido, +1).
      const itemIdPreview = `${id}` // solo para nombrar fotos de forma estable
      const fotoPecho   = await processPhoto(item.fotoPecho || item.imagenShopify || '', `${itemIdPreview}_pecho.jpg`)
      const fotoEspalda = await processPhoto(item.fotoEspalda || '', `${itemIdPreview}_espalda.jpg`)
      const fotoMangaD  = await processPhoto(item.fotoMangaD  || '', `${itemIdPreview}_manga_d.jpg`)
      const fotoMangaI  = await processPhoto(item.fotoMangaI  || '', `${itemIdPreview}_manga_i.jpg`)

      await createItem(id, {
        tiendaId: pedido.TIENDA_ID,
        productoNombre: item.productoNombre,
        detalle: item.detalle || '',
        esPersonalizado: item.esPersonalizado,
        color: item.color || '',
        talla: item.talla || '',
        cantidad: item.cantidad || 1,
        precioUnit: item.precioUnit || 0,
        area: item.area || '',
        subestado: subestadoInicial(item.area),
        fotoPecho, fotoEspalda, fotoMangaD, fotoMangaI,
        shopifyVariantId: item.shopifyVariantId || '',
      })

      await logCambio(id, 'ITEM_AGREGADO', '', item.productoNombre, usuarioId)
    }

    // ── Nuevo pago (dual-write; sin recálculo: los montos vienen del body arriba) ──
    if (body.nuevoPago) {
      const pago = body.nuevoPago
      const montoNuevo = parseFloat(pago.monto || 0)
      if (montoNuevo > 0) {
        await createPago(id, {
          tipo: pago.tipo || 'EFECTIVO',
          monto: montoNuevo,
          comprobanteUrl: pago.fotoComprobante || '',
          vendedorId: usuarioId,
          notas: pago.notas || '',
          estado: 'PAGADO', // este flujo siempre marca PAGADO, igual que antes
        })
        await logCambio(id, 'PAGO_AGREGADO', '', `$${montoNuevo.toFixed(2)} ${pago.tipo}`, usuarioId)
      }
    }

    return Response.json(
      impresion
        ? { ok: true, fechaImpresion: impresion.fecha, impresoPor: impresion.usuario }
        : { ok: true }
    )
  } catch (e) {
    console.error('PATCH pedido error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
