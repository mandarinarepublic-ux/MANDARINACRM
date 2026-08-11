export const dynamic = 'force-dynamic'
import { emitirFacturaDatil, datilDirectoActivo } from '@/lib/datil'
import { registrarEvento } from '@/lib/eventos'

// Punto ÚNICO de emisión de factura. Emite directo en Dátil (lib/datil.js).
//
// Antes esto tenía un respaldo: si DATIL_DIRECTO no estaba puesto, reenviaba al
// webhook de Make. Ese respaldo se quitó porque era PEOR que no tener nada:
// el escenario de Make se detuvo el 28-jul-2026 (a mano, dando por hecho que el
// CRM ya facturaba solo), y un webhook de Make apagado SIGUE contestando 200.
// O sea que el respaldo reportaba "ok" mientras no se emitía ni una factura.
// Trece días y ~40 pedidos así.
//
// Regla que queda: esta ruta solo dice "ok" si Dátil devolvió el id de una
// factura. Cualquier otra cosa falla fuerte y queda en el tablero de ERRORES.

export async function POST(req) {
  try {
    const body = await req.json()
    const { pedidoId, cliente, montoTotal, tipoId } = body
    if (!pedidoId) return Response.json({ ok: false, error: 'pedidoId requerido' }, { status: 400 })

    // Sin el interruptor no hay a dónde emitir. Se avisa en vez de fingir que
    // salió: ESTE es exactamente el silencio que nos costó los 13 días.
    if (!datilDirectoActivo()) {
      const falta = process.env.DATIL_API_KEY ? 'DATIL_DIRECTO' : 'DATIL_API_KEY'
      const mensaje = `No se emitió la factura: falta configurar ${falta} en el servidor`
      console.error(`factura/emitir ${pedidoId}: ${mensaje}`)
      await registrarEvento({ fuente: 'datil', nivel: 'error', mensaje, pedidoId })
      return Response.json({ ok: false, error: mensaje }, { status: 503 })
    }

    // emitirFacturaDatil ya registra su propio evento (ok o error) con el
    // detalle que devuelve Dátil, así que acá no se duplica.
    const r = await emitirFacturaDatil({ pedidoId, cliente, montoTotal, tipoId })
    if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 502 })
    return Response.json({ ok: true, via: 'directo', ...r })
  } catch (e) {
    console.error('factura/emitir error:', e)
    await registrarEvento({ fuente: 'datil', nivel: 'error', pedidoId: null,
      mensaje: `Error emitiendo la factura: ${e.message}` })
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
