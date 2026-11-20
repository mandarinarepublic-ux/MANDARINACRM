// lib/sincronizarPagos.js — Sincroniza el REPORTE DE PAGOS con las pasarelas.
//
// Lo usan DOS caminos (19-nov-2026):
//   · el botón Sincronizar de /dashboard/reporte-pagos (POST /api/reporte-pagos, ADMIN)
//   · el cron diario /api/cron/pagos (vercel.json), para que los pagos entren
//     aunque nadie abra la pantalla.
// Pasos: 1) dLocal (lista de pagos del rango; la 1.ª vez, toda la historia),
// 2) Payphone aprobados de los últimos 3 días por lotes (☠️ 5 llamadas/día/token:
// cada 5 h como mucho, control en crm.sync_pasarelas), 3) Payphone link por link
// para los pendientes. Nunca lanza: lo que falla va en `avisos`.
import {
  linksPayphonePendientes, guardarPagosDlocal, guardarPagosExternos, actualizarEstadoLink,
  ultimaSync, marcarSync,
} from './db/linksPago.js'
import { consultarLink, ventaPayphone, loteAprobadosPayphone } from './payphone.js'
import { dlocalConfigurado, listarPagosDlocal } from './dlocal.js'
import { registrarEvento } from './eventos.js'
import { filaDesdeDlocal, filaDesdeVentaPayphone, idsDeLotePayphone, hoyEcuador } from './reportePagos.js'

export const INICIO_HISTORIA = '2025-01-01'
const ESTADO_PAYPHONE_DIAS = 7   // un link vence a las 48 h; margen por si pagaron al filo
const TOPE_PAYPHONE = 25         // Payphone permite 30 consultas por minuto (en TOTAL por sincronización)
const HORAS_ENTRE_LOTES = 5      // la consulta por lotes tiene 5 llamadas por día

/** { desde, hasta } = días YYYY-MM-DD (ya validados con rangoEcuador). */
export async function sincronizarPasarelas({ desde, hasta, origen = 'pantalla' }) {
  const avisos = []

  // 1) dLocal: la lista de pagos del rango es la verdad (comisión y neto reales).
  //    La PRIMERA vez se trae toda la historia: el saldo del tablero la necesita.
  let dlocal = null
  if (dlocalConfigurado()) {
    try {
      if (!(await ultimaSync('dlocal_historico'))) {
        const { items } = await listarPagosDlocal(INICIO_HISTORIA, hoyEcuador(Date.now() + 86400000))
        const r = await guardarPagosDlocal(items.map(filaDesdeDlocal))
        await marcarSync('dlocal_historico', { leidos: items.length, ...r })
      }
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
        detalle: { ruta: '/api/reporte-pagos', desde, hasta, origen },
      })
    }
  }

  // 2) Payphone, pagos APROBADOS de los últimos 3 días (consulta por lotes):
  //    trae los que nadie registró (links del inbox de antes del 13-nov, o
  //    hechos en el panel de Payphone). Cupo de 5 por día → cada 5 h como mucho.
  let payphone = { revisados: 0, pagados: 0, fallos: 0, lote: null }
  let cupo = TOPE_PAYPHONE
  try {
    const ult = await ultimaSync('payphone_lotes')
    if (!ult || Date.now() - Date.parse(ult.ultima) > HORAS_ENTRE_LOTES * 3600000) {
      const fin = hoyEcuador()
      const ini = new Date(Date.parse(`${fin}T12:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10)
      const ids = idsDeLotePayphone(await loteAprobadosPayphone(ini, fin)).slice(0, cupo)
      const filasLote = []
      for (const id of ids) {
        cupo--
        try {
          const f = filaDesdeVentaPayphone(await ventaPayphone(id))
          if (f) filasLote.push(f)
        } catch (e) { payphone.fallos++ }
      }
      payphone.lote = { aprobados: ids.length, ...(await guardarPagosExternos(filasLote, 'PAYPHONE')) }
      await marcarSync('payphone_lotes', { desde: ini, hasta: fin, ...payphone.lote })
    }
  } catch (e) {
    avisos.push(`Payphone (aprobados de los últimos 3 días): ${e.message}`)
  }

  // 3) Payphone: no lista links; se pregunta uno por uno por los pendientes.
  try {
    const desdeIso = new Date(Date.now() - ESTADO_PAYPHONE_DIAS * 86400000).toISOString()
    const pendientes = cupo > 0 ? await linksPayphonePendientes({ desdeIso, limite: cupo }) : []
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

  return { dlocal, payphone, avisos }
}
