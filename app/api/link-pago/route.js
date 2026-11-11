import { usuarioDeSesion } from '@/lib/auth'
import { crearLinkPayphone, consultarLink } from '@/lib/payphone'
import { crearLinkPago, listarLinksPago, actualizarEstadoLink } from '@/lib/db/linksPago'
import { registrarEvento } from '@/lib/eventos'
import {
  TIENDAS_LINK, tiendasLinkPago, normalizarCelular, validarValor, formatoValor,
  urlWhatsApp, linksPorRevisar,
} from '@/lib/linkPago'

export const dynamic = 'force-dynamic'

// ── LINK DE PAGO (Payphone) desde el CRM ─────────────────────────────────────
// Pantalla /dashboard/link-pago (10-nov-2026). Ver lib/linkPago.js.
//
// La identidad sale de la cookie firmada (usuarioDeSesion), nunca del cuerpo:
// el vendedor y su tienda los decide el servidor. Los tokens de máquina no
// tienen usuario y reciben 401: es un módulo de personas.

const PUEDE_COBRAR = ['ADMIN', 'VENDEDOR', 'VENDEDOR_YAW']

function puedeCobrar(u) {
  const accesos = Array.isArray(u?.ACCESOS) ? u.ACCESOS : []
  return PUEDE_COBRAR.includes(u?.ROL) || accesos.includes('VENTAS')
}

const sinCaracteresRaros = (s) => String(s || '').replace(/[^\x21-\x7E]/g, '')

/**
 * POST { celular, valor, tienda? } → { ok, link, texto, whatsapp, registro }
 * Crea el link en Payphone, lo guarda en el histórico y devuelve el wa.me listo.
 */
export async function POST(req) {
  const quien = await usuarioDeSesion()
  if (!quien.ok) return Response.json({ ok: false, error: quien.error }, { status: quien.status })
  const u = quien.usuario
  if (!puedeCobrar(u)) return Response.json({ ok: false, error: 'No tienes permiso para cobrar' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const celular = normalizarCelular(body?.celular)
  if (!celular) {
    return Response.json({ ok: false, error: 'El celular no es válido. Ej: 0987654321' }, { status: 400 })
  }
  const valor = validarValor(body?.valor)
  if (valor === null) {
    return Response.json({ ok: false, error: 'El valor tiene que ser mayor a $0' }, { status: 400 })
  }

  const permitidas = tiendasLinkPago(u)
  const pedida = String(body?.tienda || '').toUpperCase()
  const tienda = permitidas.includes(pedida) ? pedida : permitidas[0]
  const conf = TIENDAS_LINK[tienda]

  let creado
  try {
    creado = await crearLinkPayphone({
      monto: valor,
      telefono: celular,
      storeId: sinCaracteresRaros(process.env[conf.envStore]),
      reference: conf.referencia,
    })
  } catch (e) {
    await registrarEvento({
      fuente: 'otro', nivel: 'error',
      mensaje: `Link de pago Payphone falló: ${e.message}`,
      detalle: { ruta: '/api/link-pago', usuario: u.NOMBRE, tienda, valor },
    })
    return Response.json({ ok: false, error: `No se pudo crear el link: ${e.message}` }, { status: 502 })
  }

  const texto = conf.mensaje(formatoValor(valor), creado.link)

  // El histórico es lo que permite saber después si pagaron. Si no se pudo
  // guardar, el link IGUAL sirve (ya existe en Payphone): se entrega y se avisa.
  let registro = null
  let aviso = ''
  try {
    registro = await crearLinkPago({
      vendedorId: u.USUARIO_ID,
      vendedorNombre: u.NOMBRE,
      tienda,
      celular,
      valor,
      link: creado.link,
      clientTxId: creado.clientTransactionId,
    })
  } catch (e) {
    aviso = 'El link sirve, pero no se guardó en tu histórico.'
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `Link de pago creado pero no guardado: ${e.message}`,
      detalle: { ruta: '/api/link-pago', usuario: u.NOMBRE, clientTxId: creado.clientTransactionId },
    })
  }

  return Response.json({ ok: true, link: creado.link, texto, whatsapp: urlWhatsApp(celular, texto), registro, aviso })
}

/**
 * GET → { ok, links, tiendas }
 * El histórico de quien llama (ADMIN: el de todos). Antes de devolverlo le
 * pregunta a Payphone por los que siguen sin pagar (ver linksPorRevisar).
 */
export async function GET() {
  const quien = await usuarioDeSesion()
  if (!quien.ok) return Response.json({ ok: false, error: quien.error }, { status: quien.status })
  const u = quien.usuario
  if (!puedeCobrar(u)) return Response.json({ ok: false, error: 'No tienes permiso para cobrar' }, { status: 403 })

  const esAdmin = u.ROL === 'ADMIN'
  let links
  try {
    links = await listarLinksPago({ vendedorId: esAdmin ? null : u.USUARIO_ID })
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }

  // Una consulta que falla no tumba el histórico: ese link se queda como estaba.
  const porRevisar = linksPorRevisar(links)
  const revisados = await Promise.all(porRevisar.map(async (l) => {
    try {
      const r = await consultarLink(l.client_tx_id)
      const fecha = r.fecha && !Number.isNaN(Date.parse(r.fecha)) ? new Date(r.fecha).toISOString() : null
      return await actualizarEstadoLink(l.id, {
        estado: r.estado, transactionId: r.transactionId, tarjeta: r.tarjeta, pagadoEn: fecha,
      })
    } catch (e) {
      console.error('[/api/link-pago] no se pudo revisar', l.client_tx_id, e.message)
      return null
    }
  }))
  const porId = new Map(revisados.filter(Boolean).map((l) => [l.id, l]))
  links = links.map((l) => porId.get(l.id) || l)

  return Response.json({ ok: true, links, tiendas: tiendasLinkPago(u), todos: esAdmin })
}
