// ¿La pauta está entregando?
//
// ☠️ Del 16 al 20-ago-2026 la pauta de MANDARINA pasó de ~$14 diarios con 10-35
// conversaciones a $0,00. Cuatro días. Los anuncios seguían en ACTIVE y el cron
// seguía cargando datos sin quejarse. Se descubrió de casualidad el 21-ago.
//
// La prueba central corre con los números REALES de esos días.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { evaluarSaludPauta, textoAviso, mediana, UMBRAL_CAIDA, BASE_MINIMA } from '../lib/pauta/salud.js'

// Gasto real de crm.pauta_dia, MANDARINA. El corte empieza el 16-ago.
const REAL = [
  { fecha: '2026-08-04', gasto: 20.13, anunciosActivos: 9 },
  { fecha: '2026-08-05', gasto: 23.97, anunciosActivos: 6 },
  { fecha: '2026-08-06', gasto: 13.52, anunciosActivos: 9 },
  { fecha: '2026-08-07', gasto:  7.79, anunciosActivos: 5 },
  { fecha: '2026-08-08', gasto: 17.90, anunciosActivos: 6 },
  { fecha: '2026-08-09', gasto: 19.40, anunciosActivos: 8 },
  { fecha: '2026-08-10', gasto: 15.32, anunciosActivos: 8 },
  { fecha: '2026-08-11', gasto: 16.96, anunciosActivos: 10 },
  { fecha: '2026-08-12', gasto: 13.54, anunciosActivos: 6 },
  { fecha: '2026-08-13', gasto: 12.71, anunciosActivos: 9 },
  { fecha: '2026-08-14', gasto: 14.00, anunciosActivos: 7 },
  { fecha: '2026-08-15', gasto: 12.44, anunciosActivos: 7 },
  { fecha: '2026-08-16', gasto:  0.26, anunciosActivos: 5 },
  { fecha: '2026-08-17', gasto:  0.00, anunciosActivos: 3 },
  { fecha: '2026-08-18', gasto:  0.00, anunciosActivos: 1 },
  { fecha: '2026-08-19', gasto:  0.68, anunciosActivos: 5 },
  // ⚠️ CIFRAS CONSOLIDADAS. El 21-ago estos dos días se leían como $2,46 y nada,
  // y con esa lectura se reportaron "cuatro días de pauta muerta hasta hoy".
  // Falso: ya se había recuperado. La caída fue del 16 al 19.
  { fecha: '2026-08-20', gasto: 21.22, anunciosActivos: 8 },
  { fecha: '2026-08-21', gasto: 25.88, anunciosActivos: 11 },
]

// `hasta` simula el cron corriendo la mañana siguiente a esa fecha: la serie
// llega hasta ahí, y los últimos días son PROVISIONALES.
const hasta = (f) => REAL.slice(0, REAL.findIndex((d) => d.fecha === f) + 1)

// ─── ☠️ El dato provisional (22-ago-2026) ───────────────────────────────────
//
// Meta ajusta el gasto de los últimos ~3 días. Un dato provisional llega BAJO y
// sube después. Me pasó a mí antes que al código: leí que el 20-ago MANDARINA
// había gastado $2,46 y reporté cuatro días de pauta muerta. La cifra real era
// $21,22 — ya se había recuperado.

test('☠️ NO grita una caída con datos que todavía se mueven', () => {
  // Lo que el cron habría visto el 21-ago a las 07:00: el 20-ago con su cifra
  // provisional de $2,46. Sin la guarda, esto es una alarma falsa.
  const comoSeVeiaEl21 = [
    ...hasta('2026-08-19'),
    { fecha: '2026-08-20', gasto: 2.46, anunciosActivos: 6 },   // provisional; real $21,22
  ]
  const s = evaluarSaludPauta(comoSeVeiaEl21)
  assert.ok(!s.debeAvisar || s.diasCaidos >= 2,
    'no puede disparar por un solo día cuya cifra aún no está firme')
})

test('la cifra provisional NO entra en el veredicto', () => {
  // Mismos días, cambiando SOLO el valor provisional del último: el resultado
  // tiene que ser idéntico, porque ese día no se usa para decidir.
  const base = hasta('2026-08-19')
  const conBajo  = evaluarSaludPauta([...base, { fecha: '2026-08-20', gasto: 0.10, anunciosActivos: 6 }])
  const conAlto  = evaluarSaludPauta([...base, { fecha: '2026-08-20', gasto: 21.22, anunciosActivos: 6 }])
  assert.strictEqual(conBajo.diasCaidos, conAlto.diasCaidos,
    'el último dato no puede cambiar el diagnóstico: todavía no es firme')
})

test('una falsa alarma es peor que avisar tarde', () => {
  // Se prefiere perder dos días de aviso antes que gritar en falso: el push del
  // inbox murió por avisos que la gente aprendió a ignorar.
  const s = evaluarSaludPauta([
    ...hasta('2026-08-15'),
    { fecha: '2026-08-16', gasto: 0.00, anunciosActivos: 5 },   // provisional
  ])
  assert.strictEqual(s.debeAvisar, false, 'un solo día provisional en cero no basta')
})

// El cron de la mañana del día D ve la serie hasta D-1.
const cronDelDia = (d) => evaluarSaludPauta(hasta(d))

test('☠️ la caída del 16-ago sí se caza — con dos días de margen', () => {
  // El cron del 18 evalúa hasta el 16 (los dos posteriores aún se mueven) y ahí
  // ya ve el $0,26 contra ~$15 normales. Dos días de retraso a cambio de no
  // gritar en falso; antes de esto no había ningún aviso, nunca.
  const s = cronDelDia('2026-08-18')
  assert.strictEqual(s.caida, true, '$0,26 contra ~$15 normales es una caída')
  assert.strictEqual(s.diasCaidos, 1)
  assert.strictEqual(s.debeAvisar, true)
})

test('los días de silencio quedan contados', () => {
  // Serie completa: los firmes llegan al 19, y del 16 al 19 son cuatro.
  const s = evaluarSaludPauta(REAL)
  assert.strictEqual(s.diasCaidos, 4, 'del 16 al 19 inclusive')
  assert.ok(s.base > 10 && s.base < 18, `la base normal ronda los $14, no ${s.base}`)
})

test('☠️ insiste, NO se calla después del primer aviso', () => {
  // El push del inbox tenía un enfriamiento DE FLANCO: UN aviso por cliente en
  // toda su vida. Por eso parecía funcionar mientras no funcionaba. Una pauta
  // muerta hace días tiene que seguir molestando.
  const dias = ['2026-08-18','2026-08-19','2026-08-20','2026-08-21']
  const avisos = dias.map(cronDelDia).filter((s) => s.caida && s.debeAvisar).length
  assert.ok(avisos >= 2, `en 4 mañanas con la pauta caída solo avisó ${avisos} vez/veces`)
})

test('pero no manda el mismo aviso todos los días', () => {
  const dias = ['2026-08-18','2026-08-19','2026-08-20','2026-08-21']
  const avisos = dias.map(cronDelDia).filter((s) => s.caida && s.debeAvisar).length
  assert.ok(avisos < dias.length, 'avisar todas las mañanas entrena a ignorarlo')
})

test('☠️ el aviso dice que los anuncios están ACTIVE y no gastan', () => {
  // Es lo que separa "los apagué yo" de "está roto". El 17-ago había 3 en ACTIVE
  // con cero dólares.
  const s = evaluarSaludPauta(hasta('2026-08-17'))
  const txt = textoAviso('MANDARINA', s, '17-ago')
  assert.ok(/ACTIVE/.test(txt), 'sin esto el aviso no distingue apagado de roto')
  assert.ok(/presupuesto|pago|rechazo/i.test(txt), 'y dice dónde mirar')
})

test('si no hay anuncios activos, el aviso NO acusa', () => {
  // Apagar la pauta a propósito es válido: el texto no puede sonar a avería.
  // Hacen falta los dos días provisionales POR DETRÁS del día que se evalúa,
  // porque son los que la guarda descarta.
  const s = evaluarSaludPauta([
    ...hasta('2026-08-15'),
    { fecha: '2026-08-16', gasto: 0, anunciosActivos: 0 },   // el día que se juzga
    { fecha: '2026-08-17', gasto: 0, anunciosActivos: 0 },   // provisional
    { fecha: '2026-08-18', gasto: 0, anunciosActivos: 0 },   // provisional
  ])
  assert.strictEqual(s.caida, true)
  assert.strictEqual(s.activos, 0)
  const txt = textoAviso('MANDARINA', s, '16-ago')
  assert.ok(/si los apagaste tú/i.test(txt))
  assert.ok(!/ACTIVE/.test(txt), 'no puede acusar de avería lo que puede ser una decisión')
})

// ─── Lo que NO debe avisar ──────────────────────────────────────────────────

test('un día normal no avisa', () => {
  const s = evaluarSaludPauta(hasta('2026-08-15'))
  assert.strictEqual(s.caida, false)
  assert.strictEqual(s.debeAvisar, false)
})

test('☠️ una cuenta apagada a propósito NO avisa todos los días', () => {
  // Un aviso que siempre está encendido no es un aviso.
  const dormida = Array.from({ length: 15 }, (_, i) => ({
    fecha: `2026-08-${String(i + 1).padStart(2, '0')}`, gasto: 0, anunciosActivos: 0,
  }))
  const s = evaluarSaludPauta(dormida)
  assert.strictEqual(s.debeAvisar, false)
  assert.ok(s.base < BASE_MINIMA)
})

test('una cuenta nueva sin historia no avisa', () => {
  const s = evaluarSaludPauta([{ fecha: '2026-08-20', gasto: 0, anunciosActivos: 2 }])
  assert.strictEqual(s.hayDatos, false)
  assert.strictEqual(s.debeAvisar, false)
})

test('un día flojo no es una caída', () => {
  // La pauta varía sola. $7,79 el 7-ago fue medio día normal y no debía avisar.
  const s = evaluarSaludPauta(hasta('2026-08-07'))
  assert.strictEqual(s.caida, false, `$7,79 sobre una base de ~$17 no es una caída`)
})

// ─── La recuperación ────────────────────────────────────────────────────────

test('avisa también cuando VUELVE, para no dejarte con la duda', () => {
  const s = evaluarSaludPauta([...REAL, { fecha: '2026-08-21', gasto: 13.10, anunciosActivos: 7 }])
  assert.strictEqual(s.recuperada, true)
  assert.strictEqual(s.debeAvisar, true)
  assert.ok(/volvió a entregar/.test(textoAviso('MANDARINA', s, '21-ago')))
})

// ─── La mediana ─────────────────────────────────────────────────────────────

test('☠️ la base es MEDIANA, no promedio', () => {
  // Con cuatro ceros dentro de la ventana, el promedio se desploma y la caída
  // se vuelve "lo normal": el aviso se apagaría solo justo cuando más hace falta.
  assert.strictEqual(mediana([10, 10, 10, 0, 0, 0, 0]), 0)   // ordenada: 0,0,0,0,10,10,10
  assert.strictEqual(mediana([10, 12, 14]), 12)
  assert.strictEqual(mediana([10, 20]), 15)
  assert.strictEqual(mediana([]), 0)
})

test('el umbral es una fracción de lo normal, no un número fijo', () => {
  // Un umbral fijo ("menos de $5") sirve para una cuenta y no para otra.
  assert.ok(UMBRAL_CAIDA > 0 && UMBRAL_CAIDA < 1)
})

// ─── El enganche ────────────────────────────────────────────────────────────

test('el cron avisa DESPUÉS de guardar el gasto', () => {
  // Primero se guarda lo que importa; el aviso no puede tumbar la carga.
  const src = readFileSync(new URL('../app/api/cron/pauta/route.js', import.meta.url), 'utf8')
  assert.ok(/await avisarSiCayo\(/.test(src), 'el cron tiene que revisar la salud')
  // La LLAMADA, no el import — que va arriba del todo y haría pasar la prueba sola.
  const iUpsert = src.indexOf("from('pauta_dia').upsert")
  const iAviso = src.indexOf('await avisarSiCayo(')
  assert.ok(iUpsert > 0 && iAviso > iUpsert, 'el chequeo va después de escribir el gasto')
})
