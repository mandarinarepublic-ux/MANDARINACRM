/**
 * Pruebas de la lógica pura del módulo de impresión.
 * Ejecutar:  node scripts/test-impresion.mjs
 *
 * Cubre lo que rompía en producción: fechas ilegibles/corridas y paginación que
 * perdía ítems fuera del papel.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Los módulos de lib/ son ESM pero con extensión .js, y Node los trataría como
// CommonJS. Se copian a .mjs en un temporal para importarlos tal cual, sin tocar
// el código bajo prueba.
const dir = mkdtempSync(join(tmpdir(), 'test-impresion-'))
async function cargar(rel) {
  const destino = join(dir, rel.replace(/\//g, '_') + '.mjs')
  writeFileSync(destino, readFileSync(new URL(rel, import.meta.url), 'utf8'))
  return import(pathToFileURL(destino).href)
}

const { parseFecha, formatFechaHumana, diasHastaFecha, parseFechaCalendario, diasHastaEntrega } =
  await cargar('../lib/parseFecha.js')
const { paginarItems, pesoItem, itemDesborda, paginarItemsCliente, pesoItemCliente,
        distribuirFilasCliente, pesoFilaCliente } = await cargar('../lib/paginarItems.js')

let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` - ${detalle}` : ''}`) }
}

const iso = (d) => d.toISOString()
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

console.log('\n== parseFecha ==')
{
  // El bug que corría la entrega un día: "2026-07-25" NO debe caer el 24.
  const d = parseFecha('2026-07-25')
  check('fecha sin hora se lee en día local', fmt(d) === '2026-07-25', `dio ${fmt(d)}`)

  // Formato de la hoja
  const s = parseFecha('21Jul2026 14:33:00')
  check('formato Sheets', fmt(s) === '2026-07-21' && s.getHours() === 14, `dio ${s}`)

  // ISO de Postgres con T y con espacio deben dar el MISMO instante
  const a = parseFecha('2026-07-21T19:33:12.000Z')
  const b = parseFecha('2026-07-21 19:33:12+00')
  check('ISO con T y con espacio coinciden', a && b && a.getTime() === b.getTime(),
    `${a && iso(a)} vs ${b && iso(b)}`)

  check('vacío devuelve null', parseFecha('') === null && parseFecha(null) === null)
  check('basura devuelve null', parseFecha('no soy fecha') === null)
  check('acepta Date', parseFecha(new Date(2026, 0, 5)).getFullYear() === 2026)
}

console.log('\n== formatFechaHumana ==')
{
  const ahora = new Date()
  check('hoy', formatFechaHumana(ahora).startsWith('Hoy '), formatFechaHumana(ahora))

  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1)
  check('ayer', formatFechaHumana(ayer).startsWith('Ayer '), formatFechaHumana(ayer))

  const viejo = new Date(2020, 2, 15, 9, 5)
  check('otro año incluye el año', formatFechaHumana(viejo) === '15 Mar 2020 09:05', formatFechaHumana(viejo))

  // Lo que veía el usuario antes: el ISO crudo. Ahora nunca debe salir.
  const salida = formatFechaHumana('2026-07-21T19:33:12.000Z')
  check('nunca devuelve un ISO crudo', !salida.includes('T') && !salida.includes('Z'), salida)
  check('vacío no revienta', formatFechaHumana('') === '' && formatFechaHumana(null) === '')
  check('basura no revienta', formatFechaHumana('xxx') === '')
}

console.log('\n== diasHastaFecha ==')
{
  const hoy = new Date()
  const en3 = new Date(hoy); en3.setDate(en3.getDate() + 3)
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1)

  check('hoy = 0', diasHastaFecha(fmt(hoy)) === 0, String(diasHastaFecha(fmt(hoy))))
  check('en 3 días = 3', diasHastaFecha(fmt(en3)) === 3, String(diasHastaFecha(fmt(en3))))
  check('ayer = -1', diasHastaFecha(fmt(ayer)) === -1, String(diasHastaFecha(fmt(ayer))))
  check('sin fecha = null', diasHastaFecha('') === null && diasHastaFecha(undefined) === null)

  // No debe depender de la hora a la que se abra la pantalla.
  check('mismo resultado con fecha+hora', diasHastaFecha(`${fmt(en3)}T23:59:00`) === 3)
}

console.log('\n== parseFechaCalendario / diasHastaEntrega ==')
{
  // Formato REAL de crm.pedidos.fecha_entrega_prometida en producción:
  // timestamptz a medianoche UTC. Leído como instante caía el día anterior.
  const e = parseFechaCalendario('2026-07-28 00:00:00+00')
  check('medianoche UTC NO se corre al día anterior', fmt(e) === '2026-07-28', `dio ${fmt(e)}`)

  const iso = parseFechaCalendario('2026-07-28T00:00:00.000Z')
  check('mismo caso en ISO con Z', fmt(iso) === '2026-07-28', `dio ${fmt(iso)}`)

  const pelada = parseFechaCalendario('2026-07-28')
  check('fecha pelada', fmt(pelada) === '2026-07-28', `dio ${fmt(pelada)}`)

  const hoja = parseFechaCalendario('28Jul2026')
  check('formato de la hoja', hoja && fmt(hoja) === '2026-07-28', `dio ${hoja && fmt(hoja)}`)

  check('vacío = null', parseFechaCalendario('') === null && parseFechaCalendario(null) === null)

  // El caso concreto del CRM: MAN-AND-5370 entrega 2026-07-28.
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const en5 = new Date(hoy); en5.setDate(en5.getDate() + 5)
  const comoLoGuardaSupabase = `${fmt(en5)} 00:00:00+00`
  check('entrega en 5 días da 5, no 4', diasHastaEntrega(comoLoGuardaSupabase) === 5,
    String(diasHastaEntrega(comoLoGuardaSupabase)))

  const en2 = new Date(hoy); en2.setDate(en2.getDate() + 2)
  check('URGENTE (<=2) no se adelanta un día',
    diasHastaEntrega(`${fmt(en2)} 00:00:00+00`) === 2,
    String(diasHastaEntrega(`${fmt(en2)} 00:00:00+00`)))

  const en3 = new Date(hoy); en3.setDate(en3.getDate() + 3)
  check('a 3 días NO se marca urgente', diasHastaEntrega(`${fmt(en3)} 00:00:00+00`) > 2)
}

console.log('\n== paginarItems ==')
{
  const simple = (n) => Array.from({ length: n }, (_, i) => ({ PRODUCTO_NOMBRE: `P${i}` }))

  const p3 = paginarItems(simple(3))
  check('3 ítems simples = 1 hoja', p3.length === 1, `dio ${p3.length}`)

  const p4 = paginarItems(simple(4))
  check('4 ítems simples = 2 hojas', p4.length === 2, `dio ${p4.length}`)

  const p0 = paginarItems([])
  check('sin ítems = 1 hoja vacía', p0.length === 1 && p0[0].items.length === 0)
  check('null = 1 hoja vacía', paginarItems(null).length === 1)

  // El caso que se perdía: ítem con instrucciones larguísimas.
  const pesado = { PRODUCTO_NOMBRE: 'Bordado', DETALLE_PERSONALIZADO: 'x'.repeat(900) }
  check('ítem enorme pesa más que uno normal', pesoItem(pesado) > pesoItem({ PRODUCTO_NOMBRE: 'A' }))

  const mixto = paginarItems([pesado, ...simple(2)])
  check('ítem enorme no comparte hoja con otros 2', mixto.length >= 2, `dio ${mixto.length}`)

  // Dos bloques de texto cortos deben pesar MÁS que uno solo del mismo largo
  // total: son dos recuadros con su propio título y márgenes.
  const unBloque  = { DETALLE_PERSONALIZADO: 'z'.repeat(200) }
  const dosBloques = { DETALLE_PERSONALIZADO: 'z'.repeat(100), NOTAS_AREA: 'z'.repeat(100) }
  check('dos bloques pesan más que uno del mismo largo', pesoItem(dosBloques) > pesoItem(unBloque),
    `${pesoItem(dosBloques)} vs ${pesoItem(unBloque)}`)

  check('ítem normal pesa 1 exacto', pesoItem({ PRODUCTO_NOMBRE: 'A' }) === 1)
  check('3 ítems con nota corta siguen cabiendo juntos',
    paginarItems(Array.from({ length: 3 }, () => ({ NOTAS_AREA: 'ok' }))).length === 1)

  // El texto que ni solo cabe se detecta, para poder avisar en vez de callarlo.
  check('detecta ítem que desborda una hoja entera',
    itemDesborda({ DETALLE_PERSONALIZADO: 'x'.repeat(3000) }))
  check('un ítem normal no desborda', !itemDesborda({ PRODUCTO_NOMBRE: 'A' }))

  // Invariantes duras sobre muchas combinaciones.
  let perdidos = 0, offsetsMal = 0, vacias = 0
  for (let n = 1; n <= 25; n++) {
    for (const largo of [0, 200, 500, 900]) {
      const items = Array.from({ length: n }, (_, i) => ({
        PRODUCTO_NOMBRE: `P${i}`,
        DETALLE_PERSONALIZADO: 'y'.repeat(i % 2 ? largo : 0),
        FOTO_PECHO_URL: i % 3 === 0 ? 'u' : '',
        FOTO_ESPALDA_URL: i % 3 === 0 ? 'u' : '',
        FOTO_MANGA_D_URL: i % 3 === 0 ? 'u' : '',
      }))
      const pags = paginarItems(items)
      const planos = pags.flatMap(p => p.items)
      if (planos.length !== n) perdidos++
      if (planos.some((it, i) => it !== items[i])) perdidos++
      let esperado = 0
      for (const p of pags) {
        if (p.offset !== esperado) offsetsMal++
        if (p.items.length === 0) vacias++
        esperado += p.items.length
      }
    }
  }
  check('nunca pierde ni reordena ítems', perdidos === 0, `${perdidos} casos`)
  check('offsets siempre consecutivos', offsetsMal === 0, `${offsetsMal} casos`)
  check('nunca genera hojas vacías de más', vacias === 0, `${vacias} casos`)
}

console.log('\n== paginarItemsCliente (hoja del cliente) ==')
{
  const simple = (n) => Array.from({ length: n }, (_, i) => ({ PRODUCTO_NOMBRE: `P${i}`, CANTIDAD: 1 }))

  // ---- Disposición pedida: franja ancha cuando queda impar ----
  const forma = (n) => distribuirFilasCliente(simple(n)).map(f => f.length).join('+')
  check('1 prenda -> 1 franja ancha', forma(1) === '1', forma(1))
  check('2 prendas -> dos franjas anchas', forma(2) === '1+1', forma(2))
  check('3 prendas -> dos arriba + una franja abajo', forma(3) === '2+1', forma(3))
  check('4 prendas -> cuadrícula 2x2', forma(4) === '2+2', forma(4))
  check('5 prendas -> 2+2+1', forma(5) === '2+2+1', forma(5))
  check('8 prendas -> cuatro filas de dos', forma(8) === '2+2+2+2', forma(8))

  // Una prenda con instrucciones largas se lleva la fila entera.
  const larga = { PRODUCTO_NOMBRE: 'Bordado', CANTIDAD: 1, DETALLE_PERSONALIZADO: 'x'.repeat(400) }
  const conLarga = distribuirFilasCliente([simple(1)[0], larga, ...simple(2)]).map(f => f.length).join('+')
  check('la prenda con instrucciones largas va sola en su fila', conLarga === '1+1+2', conLarga)

  // ---- Reparto entre hojas: 4 en la principal, 8 en cada adicional ----
  check('4 prendas caben en una sola hoja', paginarItemsCliente(simple(4)).length === 1,
    `dio ${paginarItemsCliente(simple(4)).length}`)
  const p5 = paginarItemsCliente(simple(5))
  check('5 prendas -> 4 + 1 en hoja extra',
    p5.length === 2 && p5[0].items.length === 4 && p5[1].items.length === 1,
    `dio ${p5.map(p => p.items.length).join('+')}`)
  const p12 = paginarItemsCliente(simple(12))
  check('12 prendas -> 4 + 8', p12.length === 2 && p12[0].items.length === 4 && p12[1].items.length === 8,
    `dio ${p12.map(p => p.items.length).join('+')}`)
  const p13 = paginarItemsCliente(simple(13))
  check('13 prendas -> 4 + 8 + 1', p13.map(p => p.items.length).join('+') === '4+8+1',
    p13.map(p => p.items.length).join('+'))

  // Nunca debe superarse el tope de prendas ni el de espacio: es lo que recortaba.
  let excedidas = 0
  for (let n = 1; n <= 40; n++) {
    for (const largo of [0, 100, 500]) {
      const items = Array.from({ length: n }, (_, i) => ({
        PRODUCTO_NOMBRE: `P${i}`, CANTIDAD: 1,
        DETALLE_PERSONALIZADO: i % 3 === 0 ? 'k'.repeat(largo) : '',
      }))
      paginarItemsCliente(items).forEach((pag, i) => {
        const maxItems = i === 0 ? 4 : 8
        const maxPeso  = i === 0 ? 4 : 8
        const peso = pag.filas.reduce((s, f) => s + pesoFilaCliente(f), 0)
        if (pag.items.length > maxItems) excedidas++
        if (pag.filas.length > 1 && peso > maxPeso + 1e-9) excedidas++
      })
    }
  }
  check('ninguna hoja supera prendas ni espacio', excedidas === 0, `${excedidas} hojas`)

  check('sin prendas = 1 hoja', paginarItemsCliente([]).length === 1)
  check('null = 1 hoja', paginarItemsCliente(null).length === 1)

  // Las instrucciones ocupan espacio: menos prendas por hoja.
  const conTexto = Array.from({ length: 4 }, () => ({ DETALLE_PERSONALIZADO: 'i'.repeat(600) }))
  check('instrucciones largas obligan a partir', paginarItemsCliente(conTexto).length > 1,
    `dio ${paginarItemsCliente(conTexto).length}`)
  check('una prenda con instrucciones pesa más que una sin ellas',
    pesoItemCliente({ DETALLE_PERSONALIZADO: 'x'.repeat(400) }) > pesoItemCliente({}))

  // Mismas invariantes duras que la hoja de confección.
  let perdidos = 0, offsetsMal = 0, vacias = 0
  for (let n = 1; n <= 30; n++) {
    for (const largo of [0, 300, 900]) {
      const items = Array.from({ length: n }, (_, i) => ({
        PRODUCTO_NOMBRE: `P${i}`, CANTIDAD: 1,
        DETALLE_PERSONALIZADO: i % 2 ? 'k'.repeat(largo) : '',
      }))
      const pags = paginarItemsCliente(items)
      const planos = pags.flatMap(p => p.items)
      if (planos.length !== n || planos.some((it, i) => it !== items[i])) perdidos++
      let esperado = 0
      for (const p of pags) {
        if (p.offset !== esperado) offsetsMal++
        if (p.items.length === 0) vacias++
        esperado += p.items.length
      }
    }
  }
  check('nunca pierde ni reordena prendas', perdidos === 0, `${perdidos} casos`)
  check('offsets consecutivos (numeración #N corrida)', offsetsMal === 0, `${offsetsMal} casos`)
  check('sin hojas vacías de más', vacias === 0, `${vacias} casos`)
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)

