export const dynamic = 'force-dynamic'

import { usuarioDeSesion } from '@/lib/auth'
import { listTablero } from '@/lib/db/tablero'
import { getPlan, getPlanAnterior, guardarPlan } from '@/lib/db/planFabrica'
import { limpiarPlan, fechaValida } from '@/lib/planFabrica'
import { hoyEcuador } from '@/lib/parseFecha'
import { registrarEvento } from '@/lib/eventos'
import { contextoDeError } from '@/lib/detalle-evento'

// Plan de fábrica: los pedidos vivos + la lista "QUÉ SE HACE HOY".
// ☠️ Solo guía: el PUT guarda la lista del día y NO cambia ningún pedido.
//
// El trabajo de fábrica es transversal: no se filtra por tienda (igual que el
// Tablero para los roles de fábrica).

// Mismo criterio que /api/tablero: a los roles de VENTA se les filtra por sus
// tiendas (no ven pedidos ni clientes de otra tienda); la fábrica ve todo.
const ROLES_POR_TIENDA = ['VENDEDOR', 'VENDEDOR_YAW']
function tiendasDe(usuario) {
  const rol = String(usuario?.ROL ?? '').toUpperCase()
  if (rol === 'ADMIN' || !ROLES_POR_TIENDA.includes(rol)) return []
  const t = usuario?.TIENDAS
  const lista = Array.isArray(t) ? t : String(t ?? '').split(',')
  const r = lista.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
  return r.length ? r : ['__NINGUNA__']
}

export async function GET(req) {
  let usuario = null
  try {
    const s = await usuarioDeSesion()
    if (!s.ok) return Response.json({ error: s.error }, { status: s.status })
    usuario = s.usuario
    const f = new URL(req.url).searchParams.get('fecha')
    const fecha = fechaValida(f) ? f : hoyEcuador()
    const [tablero, plan, anterior] = await Promise.all([
      listTablero({ tiendas: tiendasDe(usuario) }),
      getPlan(fecha),
      getPlanAnterior(fecha),
    ])
    return Response.json({ fecha, plan, anterior, pedidos: tablero.pedidos, completo: tablero.completo })
  } catch (e) {
    console.error('GET /api/plan-fabrica:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `El Plan de fábrica falló al cargar: ${e.message}`,
      detalle: contextoDeError({ error: e, ruta: '/api/plan-fabrica', usuario }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req) {
  let usuario = null
  try {
    const s = await usuarioDeSesion()
    if (!s.ok) return Response.json({ error: s.error }, { status: s.status })
    usuario = s.usuario
    const rol = String(usuario.ROL || '').toUpperCase()
    if (rol === 'VENDEDOR' || rol === 'VENDEDOR_YAW') {
      return Response.json({ error: 'Solo la fábrica arma el plan' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    if (!fechaValida(body.fecha)) return Response.json({ error: 'Fecha inválida' }, { status: 400 })
    const ids = limpiarPlan(body.pedidos)
    if (!ids) return Response.json({ error: 'Lista inválida' }, { status: 400 })
    await guardarPlan(body.fecha, ids, usuario.NOMBRE || usuario.USUARIO_ID || '')
    return Response.json({ ok: true, plan: ids })
  } catch (e) {
    console.error('PUT /api/plan-fabrica:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `No se pudo guardar el Plan de fábrica: ${e.message}`,
      detalle: contextoDeError({ error: e, ruta: '/api/plan-fabrica', usuario }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
