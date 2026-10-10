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
  buscarPedidosPorNumero, cargarDetallePublico, contarIntentos, registrarConsulta,
} from '@/lib/db/seguimiento'
import { registrarEvento } from '@/lib/eventos'

const SIN_CACHE = { 'Cache-Control': 'no-store' }

function ipDe(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'desconocida'
}

export async function POST(req) {
  const ip = ipDe(req)
  let body = {}
  try { body = await req.json() } catch { /* cuerpo vacío o roto: cae en «no encontrado» */ }

  const n = normalizarNumero(body?.numero)
  const numero = n ? (n.id || n.numero) : String(body?.numero ?? '').slice(0, 40)

  try {
    const intentos = await contarIntentos({ ip, numero })
    if (decidirLimite(intentos) === 'bloqueado') {
      await registrarConsulta({ ip, numero, resultado: 'bloqueado' })
      return Response.json({ error: MENSAJE_DEMASIADOS }, { status: 429, headers: SIN_CACHE })
    }

    // Un número suelto puede calzar con más de un pedido de MANDARINA (p. ej.
    // MAN-JAC-6308 y MAN-AND-6308). No te quedes con el primero: revisa cada
    // candidato y acepta el primero cuyo celular coincida.
    const candidatos = n ? await buscarPedidosPorNumero(n) : []
    let pedido = null
    let detalle = null
    for (const p of candidatos) {
      if (p.tienda_id !== TIENDA_PUBLICA || !pedidoCoincideNumero(p.pedido_id, n)) continue
      const d = await cargarDetallePublico(p)
      if (celularCoincide(body?.celular, d?.cliente?.celular)) { pedido = p; detalle = d; break }
    }

    if (!pedido) {
      await registrarConsulta({ ip, numero, resultado: 'fallo' })
      return Response.json({ error: MENSAJE_NO_ENCONTRADO }, { status: 404, headers: SIN_CACHE })
    }

    const etapaInfo = calcularEtapa({ pedido, items: detalle.items, logs: detalle.logs })
    await registrarConsulta({ ip, numero, resultado: 'ok', pedidoId: pedido.pedido_id })
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
