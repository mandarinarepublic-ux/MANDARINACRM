// lib/datil.js
// Emisión de factura electrónica en Dátil, DIRECTO desde el CRM.
//
// Reemplaza el escenario de Make "VersionCORE": el CRM mandaba los datos a un
// webhook, Make armaba el comprobante y hacía POST a Dátil, y devolvía el id por
// /api/factura-callback. Este módulo hace lo mismo sin intermediario.
//
// El body se replica EXACTAMENTE del escenario de Make (mismos tipos string/número,
// mismo item genérico "Prendas de vestir personalizadas", IVA 15%, forma de pago
// transferencia), para no cambiar nada de cómo se emite ante el SRI.
//
// MEJORA sobre Make: el id de Dátil se guarda en el MISMO paso que la emisión, con
// el pedido_id ya en mano. En Make el emparejamiento pedido↔factura iba por un
// callback aparte que a veces se perdía; acá no puede perderse.

import { setFactura } from './db/facturas'

const DATIL_URL = 'https://link.datil.co/invoices/issue'

// Datos fiscales del emisor. Son los del escenario de Make; una sola razón social
// factura para las dos tiendas. Se dejan como env con default para no hardcodear
// datos tributarios, pero sin obligar a configurarlos.
const EMISOR = {
  ruc:           process.env.DATIL_EMISOR_RUC || '1716608094001',
  razon_social:  process.env.DATIL_EMISOR_RAZON || 'MANDARINA REPUBLIC',
  establecimiento: {
    codigo:       process.env.DATIL_ESTAB_CODIGO || '001',
    punto_emision: process.env.DATIL_PUNTO_EMISION || '002',
  },
}

/** ¿Está lista la emisión directa? Si no, el llamador usa Make. */
export function datilDirectoActivo() {
  return process.env.DATIL_DIRECTO === '1' && Boolean(process.env.DATIL_API_KEY)
}

/** Fecha de emisión YYYY-MM-DD en hora de Ecuador. */
function fechaEmisionEcuador() {
  const ahora = new Date()
  // Ecuador es UTC-5 todo el año.
  const ec = new Date(ahora.getTime() - 5 * 60 * 60 * 1000)
  return ec.toISOString().slice(0, 10)
}

/**
 * Emite la factura en Dátil y guarda su id en el pedido.
 * No lanza: devuelve {ok, datilId?, rideUrl?, error?}.
 */
export async function emitirFacturaDatil({ pedidoId, cliente, montoTotal, tipoId }) {
  const key = process.env.DATIL_API_KEY
  if (!key) return { ok: false, error: 'DATIL_API_KEY no configurada' }

  const total = Number(parseFloat(montoTotal || 0).toFixed(2))
  if (!(total > 0)) return { ok: false, error: 'El total debe ser mayor a 0' }

  // Base sin IVA e impuesto, calculados igual que en el escenario de Make.
  const sinImp = Number((total / 1.15).toFixed(2))
  const iva = Number((total - sinImp).toFixed(2))

  const cedula = String(cliente?.cedula || '').trim()
  const tipoIdent = String(tipoId || (cedula.length === 13 ? '04' : '05'))

  // Estructura idéntica al POST que hacía Make. OJO con los tipos: precio_unitario
  // y precio_total_sin_impuestos van como STRING; el resto de montos, como número.
  const comprobante = {
    ambiente: 2,           // 2 = producción
    tipo_emision: 1,
    fecha_emision: fechaEmisionEcuador(),
    moneda: 'USD',
    emisor: EMISOR,
    comprador: {
      identificacion: cedula,
      tipo_identificacion: tipoIdent,
      razon_social: cliente?.nombre || 'CONSUMIDOR FINAL',
      email: cliente?.email || 'info@mandarinaec.com',
    },
    items: [
      {
        cantidad: 1,
        descripcion: 'Prendas de vestir personalizadas',
        precio_unitario: sinImp.toFixed(2),
        descuento: 0,
        precio_total_sin_impuestos: sinImp.toFixed(2),
        impuestos: [
          { codigo: '2', codigo_porcentaje: '4', tarifa: 15, base_imponible: sinImp, valor: iva },
        ],
      },
    ],
    totales: {
      total_sin_impuestos: sinImp,
      descuento: 0,
      propina: 0,
      impuestos: [
        { codigo: '2', codigo_porcentaje: '4', base_imponible: sinImp, valor: iva },
      ],
      importe_total: total,
    },
    pagos: [{ medio: 'transferencia', total }],
  }

  let doc
  try {
    const headers = { 'X-Key': key, 'Content-Type': 'application/json' }
    if (process.env.DATIL_API_PASSWORD) headers['X-Password'] = process.env.DATIL_API_PASSWORD

    const res = await fetch(DATIL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(comprobante),
    })
    const texto = await res.text()
    try { doc = JSON.parse(texto) } catch { doc = null }

    if (!res.ok) {
      // Dátil devuelve el detalle del rechazo (RUC inválido, comprador mal, etc.).
      const detalle = doc?.message || doc?.error || texto.slice(0, 300) || `HTTP ${res.status}`
      console.error(`DATIL emitir ${pedidoId}: ${detalle}`)
      return { ok: false, error: detalle }
    }
  } catch (e) {
    console.error(`DATIL emitir ${pedidoId}: ${e.message}`)
    return { ok: false, error: e.message }
  }

  // La respuesta trae el id del comprobante (Make usaba data.id; según el endpoint
  // puede venir en la raíz). Se prueban ambos.
  const datilId = doc?.id || doc?.data?.id
  if (!datilId) {
    console.error(`DATIL emitir ${pedidoId}: respuesta sin id`, JSON.stringify(doc).slice(0, 300))
    return { ok: false, error: 'Dátil no devolvió el id de la factura' }
  }
  const rideUrl = `https://link.datil.co/invoices/${datilId}/ride`

  // Guardar en el pedido (dual-write Sheets+Supabase) en el mismo paso: acá el
  // pedido_id está garantizado, a diferencia del callback de Make.
  try {
    await setFactura(pedidoId, { datilId, rideUrl })
  } catch (e) {
    // La factura YA se emitió en el SRI; solo falló guardarla. No es un fallo de
    // emisión, pero hay que registrarlo para reconciliar después.
    console.error(`DATIL: factura ${datilId} emitida pero NO guardada en ${pedidoId}: ${e.message}`)
    return { ok: true, datilId, rideUrl, warning: 'emitida pero no guardada en el pedido' }
  }

  return { ok: true, datilId, rideUrl, numero: doc?.numero }
}
