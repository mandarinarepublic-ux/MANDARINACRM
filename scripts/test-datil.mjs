/**
 * Pruebas del armado del comprobante de Dátil (reemplazo del escenario de Make).
 * Ejecutar:  node scripts/test-datil.mjs
 *
 * Lo crítico: el body debe salir IDÉNTICO al que enviaba Make, incluyendo qué
 * campos van como string y cuáles como número. Un cambio ahí puede hacer que el
 * SRI rechace la factura o la emita mal.
 *
 * Referencia: ejecución real de Make para IND-CAM-5374, total 100.00.
 */
let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` -- ${detalle}` : ''}`) }
}

// Réplica del armado de lib/datil.js (no se importa el módulo real para no
// arrastrar Supabase/Sheets; si el armado cambia allá, esta copia debe cambiar).
function armarComprobante({ montoTotal, cliente, tipoId, fecha }) {
  const total = Number(parseFloat(montoTotal || 0).toFixed(2))
  const sinImp = Number((total / 1.15).toFixed(2))
  const iva = Number((total - sinImp).toFixed(2))
  const cedula = String(cliente?.cedula || '').trim()
  const tipoIdent = String(tipoId || (cedula.length === 13 ? '04' : '05'))
  return {
    ambiente: 2, tipo_emision: 1, fecha_emision: fecha, moneda: 'USD',
    emisor: { ruc: '1716608094001', razon_social: 'MANDARINA REPUBLIC',
      establecimiento: { codigo: '001', punto_emision: '002' } },
    comprador: { identificacion: cedula, tipo_identificacion: tipoIdent,
      razon_social: cliente?.nombre || 'CONSUMIDOR FINAL',
      email: cliente?.email || 'info@mandarinaec.com' },
    items: [{ cantidad: 1, descripcion: 'Prendas de vestir personalizadas',
      precio_unitario: sinImp.toFixed(2), descuento: 0,
      precio_total_sin_impuestos: sinImp.toFixed(2),
      impuestos: [{ codigo: '2', codigo_porcentaje: '4', tarifa: 15, base_imponible: sinImp, valor: iva }] }],
    totales: { total_sin_impuestos: sinImp, descuento: 0, propina: 0,
      impuestos: [{ codigo: '2', codigo_porcentaje: '4', base_imponible: sinImp, valor: iva }],
      importe_total: total },
    pagos: [{ medio: 'transferencia', total }],
  }
}

console.log('\n== El comprobante coincide con la ejecucion real de Make (IND-CAM-5374) ==')
{
  const c = armarComprobante({
    montoTotal: 100.00,
    cliente: { cedula: '0504837667', nombre: 'Daniel Alejandro Burgasi Bonilla', email: 'alejandrobuga12@gmail.com' },
    tipoId: '05', fecha: '2026-07-21',
  })

  check('ambiente 2 (produccion)', c.ambiente === 2)
  check('tipo_emision 1', c.tipo_emision === 1)
  check('emisor RUC correcto', c.emisor.ruc === '1716608094001')
  check('establecimiento 001-002',
    c.emisor.establecimiento.codigo === '001' && c.emisor.establecimiento.punto_emision === '002')
  check('comprador identificacion', c.comprador.identificacion === '0504837667')
  check('comprador tipo 05', c.comprador.tipo_identificacion === '05')

  // Descomposición del IVA que hacía Make: 100 -> 86.96 + 13.04
  check('base sin IVA = 86.96', c.totales.total_sin_impuestos === 86.96, String(c.totales.total_sin_impuestos))
  check('IVA = 13.04', c.totales.impuestos[0].valor === 13.04, String(c.totales.impuestos[0].valor))
  check('importe total = 100', c.totales.importe_total === 100, String(c.totales.importe_total))

  // Tipos: precio_unitario y precio_total_sin_impuestos son STRING en Make.
  check('precio_unitario es string "86.96"',
    c.items[0].precio_unitario === '86.96' && typeof c.items[0].precio_unitario === 'string')
  check('precio_total_sin_impuestos es string',
    typeof c.items[0].precio_total_sin_impuestos === 'string')
  // base_imponible y valor son NÚMERO.
  check('base_imponible del item es numero',
    c.items[0].impuestos[0].base_imponible === 86.96 && typeof c.items[0].impuestos[0].base_imponible === 'number')
  check('importe_total es numero', typeof c.totales.importe_total === 'number')
  check('tarifa 15 numero', c.items[0].impuestos[0].tarifa === 15)
  check('codigo impuesto "2" string', c.items[0].impuestos[0].codigo === '2')
  check('pago transferencia por el total', c.pagos[0].medio === 'transferencia' && c.pagos[0].total === 100)
}

console.log('\n== Casos que Make no cubria bien ==')
{
  // RUC (13 dígitos) -> tipo 04 si no se especifica.
  const ruc = armarComprobante({ montoTotal: 50, cliente: { cedula: '1790012345001' }, fecha: '2026-07-21' })
  check('RUC de 13 digitos infiere tipo 04', ruc.comprador.tipo_identificacion === '04',
    ruc.comprador.tipo_identificacion)

  // Sin nombre -> CONSUMIDOR FINAL, sin email -> el de la tienda.
  const vacio = armarComprobante({ montoTotal: 20, cliente: {}, fecha: '2026-07-21' })
  check('sin nombre usa CONSUMIDOR FINAL', vacio.comprador.razon_social === 'CONSUMIDOR FINAL')
  check('sin email usa el de la tienda', vacio.comprador.email === 'info@mandarinaec.com')

  // Redondeo de un total "feo".
  const feo = armarComprobante({ montoTotal: 33.33, cliente: { cedula: '0102030405' }, fecha: '2026-07-21' })
  const suma = Number((feo.totales.total_sin_impuestos + feo.totales.impuestos[0].valor).toFixed(2))
  check('base + IVA reconstruye el total', suma === 33.33, String(suma))
}

console.log('\n== El interruptor y el respaldo a Make ==')
{
  const emitir = readFileSyncSafe('../app/api/factura/emitir/route.js')
  check('el endpoint usa el modo directo si esta activo', /datilDirectoActivo\(\)/.test(emitir))
  check('mantiene el webhook de Make como respaldo', /hook\.us2\.make\.com/.test(emitir))

  const cliente = readFileSyncSafe('../app/dashboard/nuevo-pedido/page.js')
  check('el cliente ya NO llama a Make directo', !/hook\.us2\.make\.com/.test(cliente))
  check('el cliente llama a nuestro endpoint', /\/api\/factura\/emitir/.test(cliente))

  const datil = readFileSyncSafe('../lib/datil.js')
  check('guarda el id de Datil en el mismo paso', /setFactura\(pedidoId/.test(datil))
  check('ambiente produccion (2)', /ambiente: 2/.test(datil))
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)

import { readFileSync } from 'node:fs'
function readFileSyncSafe(rel) {
  try { return readFileSync(new URL(rel, import.meta.url), 'utf8') } catch { return '' }
}
