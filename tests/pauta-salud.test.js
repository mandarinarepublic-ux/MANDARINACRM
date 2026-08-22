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
  { fecha: '2026-08-19', gasto:  0.66, anunciosActivos: 5 },
  { fecha: '2026-08-20', gasto:  2.46, anunciosActivos: 6 },
]

const hasta = (f) => REAL.slice(0, REAL.findIndex((d) => d.fecha === f) + 1)

test('☠️ habría avisado el 16-ago, el primer día de la caída', () => {
  const s = evaluarSaludPauta(hasta('2026-08-16'))
  assert.strictEqual(s.caida, true, '$0,26 contra ~$15 normales es una caída')
  assert.strictEqual(s.diasCaidos, 1)
  assert.strictEqual(s.debeAvisar, true, 'el primer día SIEMPRE avisa')
})

test('los cuatro días de silencio quedan contados', () => {
  const s = evaluarSaludPauta(REAL)
  assert.strictEqual(s.diasCaidos, 5, 'del 16 al 20 inclusive')
  assert.ok(s.base > 12 && s.base < 18, `la base normal ronda los $14, no ${s.base}`)
})

test('☠️ insiste, NO se calla después del primer aviso', () => {
  // El push del inbox tenía un enfriamiento DE FLANCO: UN aviso por cliente en
  // toda su vida. Por eso parecía funcionar mientras no funcionaba. Una pauta
  // muerta hace cuatro días tiene que seguir molestando.
  const avisos = REAL
    .filter((d) => d.fecha >= '2026-08-16')
    .map((d) => evaluarSaludPauta(hasta(d.fecha)))
    .filter((s) => s.debeAvisar).length
  assert.ok(avisos >= 2, `en 5 días caídos solo habría avisado ${avisos} vez/veces`)
})

test('pero no manda el mismo aviso todos los días', () => {
  const avisos = REAL
    .filter((d) => d.fecha >= '2026-08-16')
    .map((d) => evaluarSaludPauta(hasta(d.fecha)))
    .filter((s) => s.debeAvisar).length
  assert.ok(avisos < 5, 'avisar los 5 días entrena a ignorarlo')
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
  const s = evaluarSaludPauta([...hasta('2026-08-15'), { fecha: '2026-08-16', gasto: 0, anunciosActivos: 0 }])
  const txt = textoAviso('MANDARINA', s, '16-ago')
  assert.ok(/si los apagaste tú/i.test(txt), 'apagar la pauta a propósito es válido')
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
