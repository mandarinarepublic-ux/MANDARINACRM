export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/fidelidad/canje — un canje del club de premios entra como pedido de $0.
//
// Lo llama el servidor de la app del club (premios.mandarinaec.com) DESPUÉS de
// descontar los puntos. Sigue el patrón de /api/shopify/pedidos: valida, y crea
// el pedido llamando a /api/pedidos con la sesión firmada de un usuario
// dedicado (PREMIOS, código PRE → MAN-PRE-#### / IND-PRE-####).
//
// Idempotencia: el canje se RESERVA en crm.canjes_fidelidad (PK canje_id) ANTES
// de crear nada. ☠️ Sin reserva previa, dos llamadas a la vez (el cliente y el
// botón "Mandar al CRM" del panel) pasarían las dos el "¿ya existe?" y crearían
// dos pedidos — la misma carrera que tuvo Shopify con orders/create + orders/paid.

import { tokenFidelidadValido, armarPedidoDeCanje } from '@/lib/canjeFidelidad'
import { firmarSesion, secretoSesion, COOKIE_SESION } from '@/lib/sesion'
import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'

// Una reserva sin pedido más vieja que esto se da por abandonada (la función
// murió a la mitad) y se puede retomar.
const RESERVA_VENCE_MS = 2 * 60 * 1000

export async function POST(req) {
  if (!tokenFidelidadValido(req.headers.get('authorization'), process.env.FIDELIDAD_TOKEN)) {
    return Response.json({ error: 'sin permiso' }, { status: 401 })
  }
  const usuarioPremios = String(process.env.PREMIOS_USUARIO_ID || '').trim()
  if (!usuarioPremios || !secretoSesion()) {
    return Response.json({ error: 'canjes sin configurar en el CRM (PREMIOS_USUARIO_ID / SESSION_SECRET)' }, { status: 503 })
  }

  const v = armarPedidoDeCanje(await req.json().catch(() => null))
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 })
  const { canjeId, cuerpo } = v
  const sb = getSupabase()

  try {
    // 1) Reservar el canje. Si ya estaba: devolver su pedido, o esperar al otro.
    const { data: nueva, error: errReserva } = await sb.from('canjes_fidelidad')
      .upsert({ canje_id: canjeId }, { onConflict: 'canje_id', ignoreDuplicates: true })
      .select('canje_id')
    if (errReserva) throw new Error(`reserva: ${errReserva.message}`)
    if (!nueva?.length) {
      const { data: ya } = await sb.from('canjes_fidelidad').select('pedido_id, reservado_en').eq('canje_id', canjeId).maybeSingle()
      if (ya?.pedido_id) return Response.json({ pedidoId: ya.pedido_id, repetido: true })
      if (ya && Date.now() - new Date(ya.reservado_en).getTime() < RESERVA_VENCE_MS) {
        return Response.json({ error: 'este canje se está creando en este momento' }, { status: 409 })
      }
      // Reserva abandonada: se retoma, pero solo si nadie más la tomó entretanto.
      const { data: tomada } = await sb.from('canjes_fidelidad')
        .update({ reservado_en: new Date().toISOString() })
        .eq('canje_id', canjeId).is('pedido_id', null).eq('reservado_en', ya.reservado_en)
        .select('canje_id')
      if (!tomada?.length) return Response.json({ error: 'este canje se está creando en este momento' }, { status: 409 })
    }

    // 2) Crear el pedido como el usuario PREMIOS.
    const token = await firmarSesion({ id: usuarioPremios }, secretoSesion(), 1)
    const base = process.env.CRM_BASE_URL || `https://${req.headers.get('host')}`
    const res = await fetch(`${base}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${COOKIE_SESION}=${token}` },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(45000),
    })
    // ☠️ LINKPAGO: un 401 NO lanza. Sin mirar res.ok el fallo se descarta solo.
    if (!res.ok) {
      const motivo = `${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`
      await sb.from('canjes_fidelidad').delete().eq('canje_id', canjeId).is('pedido_id', null) // que el reintento pueda volver a intentar
      await registrarEvento({ fuente: 'fidelidad', nivel: 'error', mensaje: `Canje ${canjeId} no creó pedido: ${motivo}` })
      return Response.json({ error: `no se creó el pedido: ${motivo}` }, { status: 502 })
    }
    const { pedidoId } = await res.json()

    // 3) Amarrar el canje a su pedido y marcar el origen (como 'tienda_web' en Shopify).
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      sb.from('canjes_fidelidad').update({ pedido_id: pedidoId }).eq('canje_id', canjeId),
      sb.from('pedidos').update({ origen: 'premio' }).eq('pedido_id', pedidoId),
    ])
    if (e1 || e2) {
      // ☠️ El pedido YA existe. Si se pierde el amarre, un reintento crearía otro.
      await registrarEvento({
        fuente: 'fidelidad', nivel: 'error', pedidoId,
        mensaje: `Canje ${canjeId} creó ${pedidoId} pero no se pudo marcar: ${(e1 || e2).message}`,
      })
    } else {
      await registrarEvento({ fuente: 'fidelidad', nivel: 'ok', pedidoId, mensaje: `Canje del club → ${pedidoId}` })
    }
    return Response.json({ pedidoId })
  } catch (e) {
    const motivo = String(e?.message || e).slice(0, 200)
    await sb.from('canjes_fidelidad').delete().eq('canje_id', canjeId).is('pedido_id', null)
    await registrarEvento({ fuente: 'fidelidad', nivel: 'error', mensaje: `Canje ${canjeId}: ${motivo}` })
    return Response.json({ error: motivo }, { status: 500 })
  }
}
