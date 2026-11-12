import { leerCarrito, nuevoIdCheckout, validarDatos, ctxDeIntento, montosPayphone, ID_VALIDO } from '@/lib/checkoutTienda'
import { crearCheckout, leerCheckout, actualizarCheckout } from '@/lib/db/checkouts'
import { calcularCompra } from '@/lib/shopifyCheckout'
import { tokenCajita } from '@/lib/payphone'
import { cuentaPorId, tiendaPago } from '@/lib/cuentasBancarias'
import { procesarComprobante } from '@/lib/procesarTransferencia'
import { revisarLimite, MENSAJE_TOPE } from '@/lib/limitePublico'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Pago con tarjeta DENTRO de la tienda (pública) ──────────────────────────
// La usa /pagar, que la tienda abre en un recuadro. El cliente no tiene sesión.
//
// Se defiende sola:
//   - El navegador solo manda VARIANTES y CANTIDADES. Precios, descuentos y envío
//     los calcula Shopify; lo que se cobra es lo guardado acá, no lo que diga el cliente.
//   - El id de la compra sale de un generador criptográfico (~103 bits) y solo
//     da acceso a ESA compra.
//   - El token que se entrega es el de la app WEB de Payphone, que Payphone
//     limita al dominio autorizado (es así por diseño de la Cajita).
//
// POST { accion: 'iniciar', carrito }                 → { id }
// POST { accion: 'cotizar', id, datos }               → { ok, resumen } | { ok:false, errores }
// POST { accion: 'intento', id }                      → { ok, cajita }
// POST { accion: 'estado', id }                       → { estado, pedido }
// POST { accion: 'transferencia', id, banco }         → { ok, cuenta, total }   (12-nov-2026)
// POST { accion: 'comprobante', id, banco, foto }     → { ok, pedido }          foto = data:image/…;base64

const no = (error, status = 400, extra = {}) => Response.json({ ok: false, error, ...extra }, { status })

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const accion = String(body?.accion || '')

  try {
    // Tope de envíos (12-nov): por IP y por compra. Si el contador falla, deja pasar.
    const idLimite = ID_VALIDO.test(String(body?.id || '')) ? String(body.id) : null
    const limite = await revisarLimite({ req, accion, checkoutId: idLimite })
    if (!limite.ok) {
      console.warn('[/api/publico/pago] tope', accion, limite.motivo)
      return no(MENSAJE_TOPE, 429)
    }

    if (accion === 'iniciar') {
      const lineas = leerCarrito(body?.carrito)
      if (!lineas.length) return no('El carrito está vacío')
      // La tienda sale de una lista CERRADA (MANDARINA | INDSTORE); cualquier otra cosa → MANDARINA.
      const c = await crearCheckout({ id: nuevoIdCheckout(), tienda: tiendaPago(body?.tienda), lineas })
      return Response.json({ ok: true, id: c.id })
    }

    const id = String(body?.id || '')
    if (!ID_VALIDO.test(id)) return no('Compra no válida')
    const c = await leerCheckout(id)
    if (!c) return no('Compra no encontrada', 404)

    if (accion === 'estado') {
      return Response.json({ ok: true, estado: c.estado, pedido: c.shopify_order_name || null })
    }

    if (c.estado === 'COMPROBANTE' || (c.estado === 'ERROR' && c.comprobante_url)) {
      return Response.json({ ok: true, yaComprobante: true, pedido: c.crm_pedido_id || null })
    }
    if (['PAGADO', 'CREANDO'].includes(c.estado)) {
      return Response.json({ ok: true, yaPagado: true, pedido: c.shopify_order_name || null })
    }

    if (accion === 'transferencia') {
      const cuenta = cuentaPorId(body?.banco, c.tienda)
      if (!cuenta) return no('Elige un banco')
      if (!['COTIZADO', 'PAGANDO'].includes(c.estado) || !(c.total_centavos > 0)) return no('Primero completa tus datos')
      // Se guarda ya: si no sube el comprobante, el carrito abandonado dice qué banco eligió.
      await actualizarCheckout(c.id, { metodo: 'TRANSFERENCIA', banco: cuenta.id })
      const { color, texto, ...datos } = cuenta
      return Response.json({ ok: true, cuenta: datos, total: c.total_centavos })
    }

    if (accion === 'comprobante') {
      // Dominio FIJO: la sesión firmada de la TIENDA WEB nunca va a un host que mande el cliente.
      const base = String(process.env.CRM_BASE_URL || 'https://crm.apps.mandarinaec.com').replace(/[^\x21-\x7E]/g, '').replace(/\/$/, '')
      const r = await procesarComprobante({ checkoutId: c.id, banco: body?.banco, foto: body?.foto, base })
      if (!r.ok) return no(r.mensaje, r.estado === 'ERROR' ? 502 : 400)
      return Response.json({ ok: true, pedido: r.pedido || null })
    }

    if (accion === 'cotizar') {
      const v = validarDatos(body?.datos || {})
      if (!v.ok) return no('Revisa tus datos', 400, { errores: v.errores })
      let resumen
      try {
        resumen = await calcularCompra({
          tienda: c.tienda, lineas: c.lineas, checkoutId: c.id, ...v.datos,
          // la tarifa que eligió el cliente (si Shopify da varias); si ya no existe, la más barata
          handleEnvio: typeof body?.envio === 'string' ? body.envio.slice(0, 200) : null,
        })
      } catch (e) {
        console.error('[/api/publico/pago] cotizar:', e.message)
        return no('No pudimos calcular tu compra. Intenta de nuevo en un momento.', 502)
      }
      if (!resumen.envio) return no('No hacemos envíos a esa dirección', 400)
      // Un código que Shopify no aplicó se avisa, no se cobra como si sí.
      const codigoNoAplicado = v.datos.descuento && !resumen.codigos.includes(v.datos.descuento)
      await actualizarCheckout(c.id, {
        cliente: v.datos.cliente, direccion: v.datos.direccion,
        descuento: codigoNoAplicado ? null : v.datos.descuento,
        calculo: resumen, total_centavos: resumen.total, estado: 'COTIZADO', error: null,
      })
      return Response.json({ ok: true, resumen, codigoNoAplicado: !!codigoNoAplicado })
    }

    if (accion === 'intento') {
      if (!['COTIZADO', 'PAGANDO'].includes(c.estado) || !(c.total_centavos > 0)) {
        return no('Primero completa tus datos')
      }
      const token = tokenCajita()
      const storeId = String(process.env[`PAYPHONE_STORE_ID_${tiendaPago(c.tienda)}`] || '').replace(/[^\x21-\x7E]/g, '')
      if (!token || !storeId) return no('El pago con tarjeta no está disponible en este momento', 503)
      const montos = montosPayphone(c.total_centavos, c.calculo?.impuestos || 0)
      const intento = (c.intentos || 0) + 1
      await actualizarCheckout(c.id, { intentos: intento, estado: 'PAGANDO', metodo: null, banco: null })
      const cli = c.cliente || {}
      return Response.json({
        ok: true,
        cajita: {
          token, storeId,
          clientTransactionId: ctxDeIntento(c.id, intento),
          ...montos,
          currency: 'USD',
          reference: tiendaPago(c.tienda) === 'INDSTORE' ? 'Compra en indlovers.com' : 'Compra en mandarinaec.com',
          email: cli.email,
          phoneNumber: cli.celular ? '+593' + cli.celular.slice(1) : undefined,
          documentId: cli.cedula,
          identificationType: String(cli.cedula || '').length === 13 ? 2 : 1,
        },
      })
    }

    return no('Acción no reconocida')
  } catch (e) {
    console.error('[/api/publico/pago]', accion, e.message)
    return no('Algo falló. Intenta de nuevo.', 500)
  }
}
