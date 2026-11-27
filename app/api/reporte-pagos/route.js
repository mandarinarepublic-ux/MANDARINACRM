import { requireAdmin } from '@/lib/auth'
import { sincronizarPasarelas, INICIO_HISTORIA } from '@/lib/sincronizarPagos'
import { getSupabase } from '@/lib/supabase'
import { listUsuarios } from '@/lib/db/usuarios'
import { listarDepositos, crearDeposito, borrarDeposito } from '@/lib/db/depositosPasarela'
import {
  listarLinksRango, guardarPagosExternos,
} from '@/lib/db/linksPago'
import { ventaPayphone } from '@/lib/payphone'
import { dlocalConfigurado, listarRetirosDlocal } from '@/lib/dlocal'
import {
  rangoEcuador, filtrar, resumen, filaRetiroDlocal, estimarPayphone, estadoEfectivo,
  filaDesdeVentaPayphone, normalizarTransaccion, hoyEcuador, saldos, validarDeposito, saldoPayphone,
  coincideBusqueda,
} from '@/lib/reportePagos'
import { nombresWhatsappPorTelefono } from '@/lib/inbox-supabase'

// Desde cuándo se cuenta "todo" para el tablero de saldos (antes no había links).
const HISTORIA_ISO = '2025-01-01T05:00:00.000Z'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── REPORTE DE LINKS DE PAGO (solo ADMIN) ────────────────────────────────────
// Pantalla /dashboard/reporte-pagos (13-nov-2026). Lo puro en lib/reportePagos.js.
//
// GET  ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&por=creado|pagado
//      &proveedor=&tienda=&vendedor=&estado=&origen=&q=
//      Con `q` (27-nov-2026) se busca en TODA la historia, no en el rango: el
//      que busca un pago no sabe de qué día es.
//      → { ok, filas, resumen, retiros, tiendaWeb, vendedores, avisos }
// POST { desde, hasta } → sincroniza con dLocal (lista de pagos del rango) y
//      le pregunta a Payphone por los links pendientes. → { ok, dlocal, payphone, avisos }


const cola9 = (s) => String(s || '').replace(/\D/g, '').replace(/^593/, '').replace(/^0+/, '').slice(-9)
const cedulaFalsa = (c) => /^0*$/.test(String(c || '').replace(/\D/g, ''))

/**
 * El nombre del cliente detrás de cada celular: primero la ficha del CRM (la
 * escribe el vendedor), si no, el nombre de WhatsApp del inbox. Devuelve
 * { cola9: { nombre, fuente } }. Nunca lanza: sin nombres el reporte sirve igual.
 */
async function nombresDeClientes(filas, avisos) {
  const colas = [...new Set(filas.map((f) => cola9(f.celular)).filter((t) => t.length === 9))]
  const out = {}
  if (!colas.length) return out
  try {
    const sb = getSupabase()
    // 4 formas de escribir el mismo celular × 50 = 200 valores por petición.
    for (let i = 0; i < colas.length; i += 50) {
      const lote = colas.slice(i, i + 50).flatMap((t) => [`0${t}`, `593${t}`, `+593${t}`, t])
      const { data, error } = await sb.from('clientes').select('nombre,celular,cedula,fecha_registro').in('celular', lote)
      if (error) throw new Error(error.message)
      // ☠️ Una ficha con cédula de puros ceros junta a varias personas y su nombre
      // es el del ÚLTIMO que compró (ver upsertClienteByCedula): no se usa.
      for (const c of (data || []).filter((c) => !cedulaFalsa(c.cedula))) {
        const t = cola9(c.celular), nombre = String(c.nombre || '').trim()
        if (nombre && !out[t]) out[t] = { nombre, fuente: 'CRM' }
      }
    }
  } catch (e) { avisos.push(`Nombres del CRM: ${e.message}`) }
  try {
    const faltan = colas.filter((t) => !out[t])
    const pref = {}
    for (const f of filas) pref[cola9(f.celular)] = f.tienda === 'INDSTORE' ? 'IND' : 'MANDI'
    const wa = await nombresWhatsappPorTelefono(faltan, { cuentaPreferida: pref })
    for (const [t, nombre] of Object.entries(wa)) out[t] = { nombre, fuente: 'WhatsApp' }
  } catch (e) { avisos.push(`Nombres de WhatsApp: ${e.message}`) }
  return out
}

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
  const q = String(p.get('q') || '').trim().slice(0, 80)
  let todas
  try {
    todas = q
      ? await listarLinksRango({ desde: HISTORIA_ISO, hasta: new Date(Date.now() + 86400000).toISOString(), por: 'creado' })
      : await listarLinksRango({ ...rango, por })
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

  const clientes = await nombresDeClientes(todas, avisos)
  // La respuesta cruda de la pasarela NO viaja en la lista (pesa y casi nunca se
  // mira): solo cuántos datos trae, para el «ver todo» del detalle.
  const filas = filtrar(todas, {
    proveedor: p.get('proveedor') || '', tienda: p.get('tienda') || '',
    vendedor: p.get('vendedor') || '', estado: p.get('estado') || '', origen: p.get('origen') || '',
  }).map(({ datos_pasarela, ...f }) => {
    const c = clientes[cola9(f.celular)]
    return {
      ...f,
      vendedor: f.vendedor_id ? (nombres[f.vendedor_id] || f.vendedor_nombre || null) : null,
      cliente_nombre: c?.nombre || null, cliente_fuente: c?.fuente || null,
      con_datos_pasarela: !!datos_pasarela,
    }
  }).filter((f) => !q || coincideBusqueda(f, q))

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
    const base = saldos({ filas: pagadas, retiros: retirosTodos, tiendaWeb: await tiendaWebTotal({ desde: HISTORIA_ISO, hasta: manana }) })
    // Depósitos de Payphone anotados a mano (su API no los da): saldo = neto − depósitos.
    let depositos = []
    try { depositos = await listarDepositos('PAYPHONE') }
    catch (e) { avisos.push(`Depósitos de Payphone: ${e.message}`) }
    const pp = saldoPayphone(base.payphone.neto, depositos)
    tablero = {
      ...base,
      payphone: { ...base.payphone, depositado: pp.depositado, saldo: pp.saldo, depositos },
      total: Math.round((base.dlocal.saldo + pp.saldo) * 100) / 100,
      dlocal_conectado: dlocalConfigurado(),
    }
  } catch (e) { avisos.push(`Saldos: ${e.message}`) }

  return Response.json({
    ok: true, tablero, filas, resumen: resumen(filas, nombres), retiros, tiendaWeb, vendedores, avisos, q,
  })
}

export async function POST(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))

  // Depósitos de Payphone al banco, anotados a mano (19-nov-2026).
  if (body?.accion === 'deposito_crear') {
    const v = validarDeposito(body)
    if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 })
    try {
      const d = await crearDeposito({
        ...v.datos, proveedor: 'PAYPHONE',
        usuarioId: auth.usuario?.USUARIO_ID, usuarioNombre: auth.usuario?.NOMBRE,
      })
      return Response.json({ ok: true, deposito: d })
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 })
    }
  }
  if (body?.accion === 'deposito_borrar') {
    const id = Number(body?.id)
    if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ ok: false, error: 'Depósito no válido' }, { status: 400 })
    try {
      const borrado = await borrarDeposito(id, auth.usuario?.USUARIO_ID)
      if (!borrado) return Response.json({ ok: false, error: 'Ese depósito ya no existe' }, { status: 404 })
      return Response.json({ ok: true })
    } catch (e) {
      return Response.json({ ok: false, error: e.message }, { status: 500 })
    }
  }

  // La respuesta COMPLETA de la pasarela de un link (el «ver todo» del detalle).
  if (body?.accion === 'datos_pasarela') {
    const id = Number(body?.id)
    if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ ok: false, error: 'Link no válido' }, { status: 400 })
    const { data, error } = await getSupabase().from('links_pago').select('id,datos_pasarela').eq('id', id).maybeSingle()
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    if (!data) return Response.json({ ok: false, error: 'Ese link ya no existe' }, { status: 404 })
    return Response.json({ ok: true, datos: data.datos_pasarela || null })
  }

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
