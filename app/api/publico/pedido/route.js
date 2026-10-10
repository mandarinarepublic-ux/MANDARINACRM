// app/api/publico/pedido/route.js
//
// Seguimiento del pedido para el CLIENTE (mandarinaec.com/pedido). Pública: está
// en RUTAS_PUBLICAS del middleware y se defiende sola. Ver
// docs/superpowers/specs/2026-10-09-seguimiento-pedido-mandarina-design.md.
//
// ☠️ Un solo mensaje para todo fallo (no existe, otro celular, otra tienda): si
// dijera «ese pedido existe pero el celular no», regalaría la mitad del secreto.
export const dynamic = 'force-dynamic'

import {
  normalizarNumero, pedidoCoincideNumero, celularCoincide, armarRespuesta,
  decidirLimite, TIENDA_PUBLICA, MENSAJE_NO_ENCONTRADO, MENSAJE_DEMASIADOS,
} from '@/lib/seguimientoPublico'
import { calcularEtapa } from '@/lib/etapaCliente'
import {
  buscarPedidosPorNumero, cargarDetallePublico, celularDelCliente,
  abrirConsulta, contarIntentos, cerrarConsulta,
} from '@/lib/db/seguimiento'
import { registrarEvento } from '@/lib/eventos'

const SIN_CACHE = { 'Cache-Control': 'no-store' }

// Orden: la IP que pone Vercel (no se falsea), x-real-ip, y al final el primer
// valor de x-forwarded-for. Se recorta a 64 para que no inflen la tabla.
function ipDe(req) {
  const h = (k) => (req.headers.get(k) || '').trim()
  const ip = h('x-vercel-forwarded-for') || h('x-real-ip')
    || h('x-forwarded-for').split(',')[0].trim() || 'desconocida'
  return ip.slice(0, 64)
}

export async function POST(req) {
  const ip = ipDe(req)
  let body = {}
  try { body = await req.json() } catch { /* cuerpo vacío o roto: cae en «no encontrado» */ }

  const n = normalizarNumero(body?.numero)
  // Siempre el número pelado: «6308» y «MAN-JAC-6308» comparten el mismo contador.
  const numero = n ? n.numero : String(body?.numero ?? '').slice(0, 40)

  try {
    const consultaId = await abrirConsulta({ ip, numero })
    const intentos = await contarIntentos({ ip, numero, antesDe: consultaId })
    if (decidirLimite(intentos) === 'bloqueado') {
      await cerrarConsulta(consultaId, 'bloqueado')
      return Response.json({ error: MENSAJE_DEMASIADOS }, { status: 429, headers: SIN_CACHE })
    }

    // Un número suelto puede calzar con más de un pedido de MANDARINA (p. ej.
    // MAN-JAC-6308 y MAN-AND-6308). No te quedes con el primero: revisa el celular
    // de cada candidato (solo esa columna) y carga el detalle únicamente del que calce.
    const candidatos = n ? await buscarPedidosPorNumero(n) : []
    let pedido = null
    for (const p of candidatos) {
      if (p.tienda_id !== TIENDA_PUBLICA || !pedidoCoincideNumero(p.pedido_id, n)) continue
      if (celularCoincide(body?.celular, await celularDelCliente(p.cliente_id))) { pedido = p; break }
    }

    if (!pedido) {
      await cerrarConsulta(consultaId, 'fallo')
      return Response.json({ error: MENSAJE_NO_ENCONTRADO }, { status: 404, headers: SIN_CACHE })
    }

    const detalle = await cargarDetallePublico(pedido)
    const etapaInfo = calcularEtapa({ pedido, items: detalle.items, logs: detalle.logs, guia: detalle.guia })
    await cerrarConsulta(consultaId, 'ok', pedido.pedido_id)
    return Response.json(armarRespuesta({ pedido, ...detalle, etapaInfo }), { headers: SIN_CACHE })
  } catch (e) {
    await registrarEvento({
      fuente: 'supabase',
      nivel: 'error',
      mensaje: `El seguimiento público falló: ${e?.message || e}`,
      detalle: { ruta: '/api/publico/pedido', numero },
    })
    return Response.json(
      { error: 'No pudimos cargar tu pedido. Intenta de nuevo en un momento.' },
      { status: 500, headers: SIN_CACHE },
    )
  }
}
