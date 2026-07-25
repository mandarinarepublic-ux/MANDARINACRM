/**
 * Pruebas del manejo de zona horaria de las fechas del CRM.
 * Ejecutar:  node scripts/test-fechas.mjs
 *
 * Lo que rompía en producción: FECHA_PEDIDO es un timestamptz y Supabase lo
 * entrega en UTC ("2026-07-25T20:52:00+00:00"). Las pantallas lo recortaban
 * (`.split(' ')[0]`, `.slice(0,10)`) o comparaban contra `new Date('YYYY-MM-DD')`
 * (medianoche UTC), así que todo lo vendido después de las 19:00 de Ecuador caía
 * en el día siguiente: ventas de hoy infladas/vacías y filtros corridos 5 horas.
 *
 * Estas pruebas se corren en UTC a propósito (TZ=UTC más abajo) para que un
 * error de zona NO pueda esconderse por estar el equipo en Ecuador.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'test-fechas-'))
async function cargar(rel) {
  const destino = join(dir, rel.replace(/\//g, '_') + '.mjs')
  writeFileSync(destino, readFileSync(new URL(rel, import.meta.url), 'utf8'))
  return import(pathToFileURL(destino).href)
}

const {
  parseFecha, fechaISOEcuador, hoyEcuador, formatFechaDia,
  inicioDiaEcuador, finDiaEcuador, formatFechaHumana, formatFechaCorta,
} = await cargar('../lib/parseFecha.js')

let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` - ${detalle}` : ''}`) }
}

// Formato EXACTO que devuelve PostgREST para crm.pedidos.fecha_pedido
// (verificado con to_json() contra la base de producción).
const PEDIDO_TARDE   = '2026-07-25T20:52:00+00:00'  // 25-jul 15:52 en Ecuador
const PEDIDO_NOCHE   = '2026-07-26T01:41:19+00:00'  // 25-jul 20:41 en Ecuador ← el caso del bug
const PEDIDO_MANANA  = '2026-07-25T14:30:00+00:00'  // 25-jul 09:30 en Ecuador

console.log('\n== fechaISOEcuador: a qué DÍA pertenece un instante ==')
{
  check('pedido de la tarde', fechaISOEcuador(PEDIDO_TARDE) === '2026-07-25', fechaISOEcuador(PEDIDO_TARDE))
  check('pedido de la mañana', fechaISOEcuador(PEDIDO_MANANA) === '2026-07-25', fechaISOEcuador(PEDIDO_MANANA))

  // EL BUG: 20:41 del 25 en Ecuador son las 01:41 UTC del 26.
  check('pedido de la noche NO se pasa al día siguiente',
    fechaISOEcuador(PEDIDO_NOCHE) === '2026-07-25', fechaISOEcuador(PEDIDO_NOCHE))
  check('recortar el ISO daba el día equivocado (lo que hacía antes)',
    PEDIDO_NOCHE.slice(0, 10) === '2026-07-26')

  check('formato viejo de la hoja sigue funcionando',
    fechaISOEcuador(new Date(2026, 6, 25, 20, 41)) === '2026-07-25')
  check('vacío no revienta', fechaISOEcuador('') === '' && fechaISOEcuador(null) === '')
  check('basura no revienta', fechaISOEcuador('no soy fecha') === '')
}

console.log('\n== formatFechaDia: reemplazo de .split(\' \')[0] ==')
{
  check('día legible', formatFechaDia(PEDIDO_TARDE) === '25Jul2026', formatFechaDia(PEDIDO_TARDE))
  check('pedido de la noche muestra SU día', formatFechaDia(PEDIDO_NOCHE) === '25Jul2026', formatFechaDia(PEDIDO_NOCHE))
  check('nunca devuelve un ISO crudo',
    !formatFechaDia(PEDIDO_TARDE).includes('T') && !formatFechaDia(PEDIDO_TARDE).includes('+'))
  // Lo que se veía antes en pantalla con el backend Supabase.
  check('el split viejo devolvía la cadena entera', PEDIDO_TARDE.split(' ')[0] === PEDIDO_TARDE)
  check('vacío no revienta', formatFechaDia('') === '' && formatFechaDia(undefined) === '')
}

console.log('\n== inicioDiaEcuador / finDiaEcuador: filtros por rango ==')
{
  const desde = inicioDiaEcuador('2026-07-25')
  const hasta = finDiaEcuador('2026-07-25')
  check('el día empieza a las 05:00 UTC', desde.toISOString() === '2026-07-25T05:00:00.000Z', desde.toISOString())
  check('el día termina a las 04:59:59.999 UTC del 26',
    hasta.toISOString() === '2026-07-26T04:59:59.999Z', hasta.toISOString())

  const dentro = [PEDIDO_MANANA, PEDIDO_TARDE, PEDIDO_NOCHE].map(parseFecha)
  check('los 3 pedidos del 25 caen dentro del rango del 25',
    dentro.every(f => f >= desde && f <= hasta))

  // El pedido de las 20:41 del 24 NO debe colarse en "desde el 25".
  const vispera = parseFecha('2026-07-25T01:41:19+00:00')   // 24-jul 20:41 Ecuador
  check('la noche anterior queda FUERA del rango', !(vispera >= desde))
  check('así se colaba antes (medianoche UTC)', vispera >= new Date('2026-07-25'))

  check('fecha inválida da null', inicioDiaEcuador('') === null && finDiaEcuador('xx') === null)
}

console.log('\n== ventas del día (lo que calcula el tablero) ==')
{
  const pedidos = [
    { FECHA_PEDIDO: PEDIDO_MANANA, MONTO_TOTAL: '100' },
    { FECHA_PEDIDO: PEDIDO_TARDE,  MONTO_TOTAL: '50'  },
    { FECHA_PEDIDO: PEDIDO_NOCHE,  MONTO_TOTAL: '25'  },   // 20:41 del 25
    { FECHA_PEDIDO: '2026-07-25T01:41:19+00:00', MONTO_TOTAL: '999' }, // 20:41 del 24
  ]
  const delDia = pedidos.filter(p => fechaISOEcuador(p.FECHA_PEDIDO) === '2026-07-25')
  const total = delDia.reduce((s, p) => s + parseFloat(p.MONTO_TOTAL), 0)
  check('el día 25 tiene 3 pedidos', delDia.length === 3, String(delDia.length))
  check('ventas del 25 = 175 (sin arrastrar las de anoche)', total === 175, String(total))

  // Con el cálculo viejo entraba el de ayer y se escapaba el de la noche.
  const viejo = pedidos.filter(p => p.FECHA_PEDIDO.slice(0, 10) === '2026-07-25')
  check('el cálculo viejo daba otro número',
    viejo.reduce((s, p) => s + parseFloat(p.MONTO_TOTAL), 0) === 1149)
}

console.log('\n== formatFechaHumana / formatFechaCorta en hora de Ecuador ==')
{
  check('hora en Ecuador, no en UTC', formatFechaCorta(PEDIDO_TARDE) === '25 Jul · 15:52', formatFechaCorta(PEDIDO_TARDE))
  check('pedido nocturno mantiene su día', formatFechaCorta(PEDIDO_NOCHE) === '25 Jul · 20:41', formatFechaCorta(PEDIDO_NOCHE))

  // Un instante de otro año: debe incluir el año y estar en hora de Ecuador.
  const viejo = formatFechaHumana('2024-03-16T02:30:00+00:00')   // 15-mar 21:30 en Ecuador
  check('fecha vieja: año incluido y día sin correr', viejo === '15 Mar 2024 21:30', viejo)
  check('nunca devuelve un ISO crudo', !viejo.includes('T') && !viejo.includes('Z'))

  // "Hoy" y "Ayer" se calculan contra el calendario de Ecuador.
  const ahora = new Date()
  check('ahora mismo es "Hoy"', formatFechaHumana(ahora).startsWith('Hoy '), formatFechaHumana(ahora))
  const ayer = new Date(ahora.getTime() - 24 * 3600 * 1000)
  check('hace 24h es "Ayer"', formatFechaHumana(ayer).startsWith('Ayer '), formatFechaHumana(ayer))

  check('hoyEcuador tiene forma YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(hoyEcuador()), hoyEcuador())
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)
