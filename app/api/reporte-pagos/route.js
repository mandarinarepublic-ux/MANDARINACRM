import { requireAdmin } from '@/lib/auth'
import { sincronizarPasarelas, INICIO_HISTORIA } from '@/lib/sincronizarPagos'
import { getSupabase } from '@/lib/supabase'
import { listUsuarios } from '@/lib/db/usuarios'
import {
  listarLinksRango, guardarPagosExternos,
} from '@/lib/db/linksPago'
import { ventaPayphone } from '@/lib/payphone'
import { dlocalConfigurado, listarRetirosDlocal } from '@/lib/dlocal'
import {
  rangoEcuador, filtrar, resumen, filaRetiroDlocal, estimarPayphone, estadoEfectivo,
  filaDesdeVentaPayphone, normalizarTransaccion, hoyEcuador, saldos,
} from '@/lib/reportePagos'

// Desde cuándo se cuenta "todo" para el tablero de saldos (antes no había links).
const HISTORIA_ISO = '2025-01-01T05:00:00.000Z'

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


/** Pagos con tarjeta dentro de la tienda (Cajita de Payphone) de un rango. */
async function tiendaWebTotal({ desde, hasta, por = 'pagado', tienda = '' }) {
  const col = por === 'pagado' ? 'actualizado_en' : 'creado_en'
  const { data, error } = await getSupabase()
    .from('checkouts_tienda')
    .select('id,tienda,total_centavos,estado,payphone_tx_id,actualizado_en')
    .eq('estado', 'PAGADO')
    .not('payphone_tx_id', 'is', null)
    .gte(col, desde).lt(col, hasta)
    .limit(1000)
  if (error) throw new Error(error.message)
  const lista = (data || []).filter((c) => !tienda || c.tienda === tienda)
  const cobrado = lista.reduce((s, c) => s + (Number(c.total_centavos) || 0) / 100, 0)
  const est = estimarPayphone(cobrado)
  return { pagos: lista.length, cobrado: Math.round(cobrado * 100) / 100, comision: est.comision, neto: est.neto }
}

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
    tiendaWeb = await tiendaWebTotal({ ...rango, por, tienda: p.get('tienda') || '' })
  } catch (e) { avisos.push(`Tienda web: ${e.message}`) }

  // Tablero de arriba: SALDOS de TODA la historia, sin filtros (pedido de Rodrigo:
  // "el dinero disponible en esas cuentas, a primera vista").
  let tablero = null
  try {
    const manana = new Date(Date.now() + 86400000).toISOString()
    const pagadas = (await listarLinksRango({ desde: HISTORIA_ISO, hasta: manana, por: 'pagado' }))
      .filter((f) => f.estado === 'PAGADO')
    let retirosTodos = []
    if (dlocalConfigurado()) {
      try { retirosTodos = (await listarRetirosDlocal(INICIO_HISTORIA, hoyEcuador())).items.map(filaRetiroDlocal) }
      catch (e) { avisos.push(`dLocal (retiros para el saldo): ${e.message}`) }
    }
    tablero = {
      ...saldos({ filas: pagadas, retiros: retirosTodos, tiendaWeb: await tiendaWebTotal({ desde: HISTORIA_ISO, hasta: manana }) }),
      dlocal_conectado: dlocalConfigurado(),
    }
  } catch (e) { avisos.push(`Saldos: ${e.message}`) }

  return Response.json({
    ok: true, tablero, filas, resumen: resumen(filas, nombres), retiros, tiendaWeb, vendedores, avisos,
  })
}

export async function POST(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))

  // Traer UN pago de Payphone por su # de transacción (el que se ve en el panel).
  // Para los links que salieron antes de que los inbox los registraran.
  if (body?.accion === 'traer_payphone') {
    const tx = normalizarTransaccion(body?.transaccion)
    if (!tx) return Response.json({ ok: false, error: 'Escribe el # de transacción de Payphone (solo números)' }, { status: 400 })
    try {
      const venta = await ventaPayphone(tx)
      if (!venta) return Response.json({ ok: false, error: `Payphone no tiene la transacción #${tx} con esta cuenta` }, { status: 404 })
      const fila = filaDesdeVentaPayphone(venta)
      if (!fila) return Response.json({ ok: false, error: 'Payphone respondió algo que no se entiende' }, { status: 502 })
      const r = await guardarPagosExternos([fila], 'PAYPHONE')
      return Response.json({ ok: true, fila, ...r })
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 502 })
    }
  }

  const { desde, hasta } = body || {}
  const rango = rangoEcuador(desde, hasta)
  if (!rango) return Response.json({ ok: false, error: 'Rango de fechas inválido' }, { status: 400 })

  const r = await sincronizarPasarelas({ desde, hasta })
  return Response.json({ ok: true, ...r })
}
