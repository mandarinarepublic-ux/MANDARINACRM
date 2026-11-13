import { requireAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { listUsuarios } from '@/lib/db/usuarios'
import { listarLinksRango, linksPayphonePendientes, guardarPagosDlocal, actualizarEstadoLink } from '@/lib/db/linksPago'
import { consultarLink } from '@/lib/payphone'
import { dlocalConfigurado, listarPagosDlocal, listarRetirosDlocal } from '@/lib/dlocal'
import { registrarEvento } from '@/lib/eventos'
import {
  rangoEcuador, filtrar, resumen, filaDesdeDlocal, filaRetiroDlocal, estimarPayphone, estadoEfectivo,
} from '@/lib/reportePagos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── REPORTE DE LINKS DE PAGO (solo ADMIN) ────────────────────────────────────
// Pantalla /dashboard/reporte-pagos (13-nov-2026). Lo puro en lib/reportePagos.js.
//
// GET  ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&por=creado|pagado
//      &proveedor=&tienda=&vendedor=&estado=&origen=
//      → { ok, filas, resumen, retiros, tiendaWeb, vendedores, avisos }
// POST { desde, hasta } → sincroniza con dLocal (lista de pagos del rango) y
//      le pregunta a Payphone por los links pendientes. → { ok, dlocal, payphone, avisos }

const ESTADO_PAYPHONE_DIAS = 7   // un link vence a las 48 h; margen por si pagaron al filo
const TOPE_PAYPHONE = 25         // Payphone permite 30 consultas por minuto

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status })

  const p = new URL(req.url).searchParams
  const desde = p.get('desde'), hasta = p.get('hasta')
  const rango = rangoEcuador(desde, hasta)
  if (!rango) return Response.json({ ok: false, error: 'Rango de fechas inválido' }, { status: 400 })
  const por = p.get('por') === 'pagado' ? 'pagado' : 'creado'

  const avisos = []
  let todas
  try {
    todas = await listarLinksRango({ ...rango, por })
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }

  const nombres = {}
  try {
    for (const u of await listUsuarios()) nombres[String(u.USUARIO_ID)] = u.NOMBRE
  } catch (e) { avisos.push('No se pudieron leer los nombres de los vendedores') }
  for (const f of todas) {
    if (f.vendedor_id && !nombres[f.vendedor_id] && f.vendedor_nombre) nombres[f.vendedor_id] = f.vendedor_nombre
  }

  // Los vendedores del selector salen de TODO el rango, no de lo ya filtrado:
  // si no, al elegir uno desaparecen los demás de la lista.
  const vendedores = [...new Set(todas.map((f) => f.vendedor_id).filter(Boolean).map(String))]
    .map((id) => ({ id, nombre: nombres[id] || `Usuario ${id}` }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const ahora = Date.now()
  todas = todas.map((f) => ({ ...f, estado: estadoEfectivo(f, ahora) }))

  const filas = filtrar(todas, {
    proveedor: p.get('proveedor') || '', tienda: p.get('tienda') || '',
    vendedor: p.get('vendedor') || '', estado: p.get('estado') || '', origen: p.get('origen') || '',
  }).map((f) => ({ ...f, vendedor: f.vendedor_id ? (nombres[f.vendedor_id] || f.vendedor_nombre || null) : null }))

  // Retiros de dLocal a la cuenta del banco (no dependen de los filtros de lista).
  let retiros = null
  if (dlocalConfigurado()) {
    try {
      const r = await listarRetirosDlocal(desde, hasta)
      retiros = r.items.map(filaRetiroDlocal)
    } catch (e) { avisos.push(`dLocal (retiros): ${e.message}`) }
  } else {
    avisos.push('dLocal no está conectado en el CRM: faltan DLOCAL_API_KEY y DLOCAL_SECRET en Vercel')
  }

  // Pagos con tarjeta DENTRO de la tienda (Cajita de Payphone). No son links,
  // pero es plata de Payphone: van aparte para que el balance de Payphone cuadre.
  let tiendaWeb = null
  try {
    const col = por === 'pagado' ? 'actualizado_en' : 'creado_en'
    const { data, error } = await getSupabase()
      .from('checkouts_tienda')
      .select('id,tienda,total_centavos,estado,payphone_tx_id,shopify_order_name,actualizado_en')
      .eq('estado', 'PAGADO')
      .not('payphone_tx_id', 'is', null)
      .gte(col, rango.desde).lt(col, rango.hasta)
      .limit(1000)
    if (error) throw new Error(error.message)
    const tienda = p.get('tienda') || ''
    const lista = (data || []).filter((c) => !tienda || c.tienda === tienda)
    const cobrado = lista.reduce((s, c) => s + (Number(c.total_centavos) || 0) / 100, 0)
    const est = estimarPayphone(cobrado)
    tiendaWeb = { pagos: lista.length, cobrado: Math.round(cobrado * 100) / 100, comision: est.comision, neto: est.neto }
  } catch (e) { avisos.push(`Tienda web: ${e.message}`) }

  return Response.json({
    ok: true, filas, resumen: resumen(filas, nombres), retiros, tiendaWeb, vendedores, avisos,
  })
}

export async function POST(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { desde, hasta } = body || {}
  const rango = rangoEcuador(desde, hasta)
  if (!rango) return Response.json({ ok: false, error: 'Rango de fechas inválido' }, { status: 400 })

  const avisos = []

  // 1) dLocal: la lista de pagos del rango es la verdad (comisión y neto reales).
  let dlocal = null
  if (dlocalConfigurado()) {
    try {
      // Un día más al final: si dLocal filtra en UTC, un pago después de las
      // 19:00 de Ecuador del último día caería fuera. Lo de más no estorba.
      const hastaMas = new Date(Date.parse(`${hasta}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
      const { items, truncado } = await listarPagosDlocal(desde, hastaMas)
      dlocal = { leidos: items.length, ...(await guardarPagosDlocal(items.map(filaDesdeDlocal))) }
      if (truncado) avisos.push('dLocal devolvió más de 1000 pagos: achica el rango de fechas')
    } catch (e) {
      avisos.push(`dLocal: ${e.message}`)
      await registrarEvento({
        fuente: 'otro', nivel: 'error', mensaje: `Reporte de pagos: dLocal falló: ${e.message}`,
        detalle: { ruta: '/api/reporte-pagos', desde, hasta },
      })
    }
  }

  // 2) Payphone: no lista links; se pregunta uno por uno por los pendientes.
  let payphone = { revisados: 0, pagados: 0, fallos: 0 }
  try {
    const desdeIso = new Date(Date.now() - ESTADO_PAYPHONE_DIAS * 86400000).toISOString()
    const pendientes = await linksPayphonePendientes({ desdeIso, limite: TOPE_PAYPHONE })
    for (const l of pendientes) {
      try {
        const r = await consultarLink(l.client_tx_id)
        const fecha = r.fecha && !Number.isNaN(Date.parse(r.fecha)) ? new Date(r.fecha).toISOString() : null
        await actualizarEstadoLink(l.id, {
          estado: r.estado, transactionId: r.transactionId, tarjeta: r.tarjeta, pagadoEn: fecha, valor: l.valor,
        })
        payphone.revisados++
        if (r.estado === 'PAGADO') payphone.pagados++
      } catch (e) {
        payphone.fallos++
        console.error('[/api/reporte-pagos] Payphone', l.client_tx_id, e.message)
      }
    }
    if (payphone.fallos) avisos.push(`Payphone: ${payphone.fallos} links no se pudieron revisar`)
  } catch (e) {
    avisos.push(`Payphone: ${e.message}`)
  }

  return Response.json({ ok: true, dlocal, payphone, avisos })
}
