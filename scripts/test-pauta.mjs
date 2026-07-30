// scripts/test-pauta.mjs
// Pruebas de la atribución del tablero de pauta.
// Correr:  node scripts/test-pauta.mjs
//
// Se corren en TZ=UTC a propósito, igual que scripts/test-fechas.mjs: un error
// de zona horaria NO puede esconderse por estar el equipo en Ecuador.
process.env.TZ = 'UTC'

import assert from 'node:assert/strict'
import {
  tail9, tiendaDeCuenta, dentroDeVentana, ultimoAnuncioAntesDe,
  roasDe, brechaRoas, recortarFechaPiso,
} from '../lib/pauta/atribucion.js'
import { FECHA_PISO, VENTANA_DIAS } from '../lib/pauta/constantes.js'

let pasadas = 0
function prueba(nombre, fn) {
  try { fn(); pasadas++; console.log(`✓ ${nombre}`) }
  catch (e) { console.error(`✗ ${nombre}\n  ${e.message}`); process.exitCode = 1 }
}

// ── Teléfonos ────────────────────────────────────────────────────────────────
// El CRM guarda 09xxxxxxxx y el inbox 593xxxxxxxxx. El sufijo de 9 los une.
prueba('tail9 normaliza los tres formatos al mismo sufijo', () => {
  assert.equal(tail9('0983745757'), '983745757')
  assert.equal(tail9('593983745757'), '983745757')
  assert.equal(tail9('+593 98 374 5757'), '983745757')
  assert.equal(tail9('983745757'), '983745757')
})

prueba('tail9 no revienta con basura', () => {
  assert.equal(tail9(''), '')
  assert.equal(tail9(null), '')
  assert.equal(tail9('sin numero'), '')
})

prueba('tail9 extrae los 9 dígitos de un número mal capturado (código + cero de troncal)', () => {
  // Caso real en el CRM: 593 (código país) + 0 (cero de troncal) + 9 dígitos.
  assert.equal(tail9('5930991234567'), '991234567')
})

prueba('tail9 con número más corto de 9 dígitos devuelve lo que hay', () => {
  assert.equal(tail9('12345'), '12345')
  assert.equal(tail9('0912345'), '912345')
})

// ── Tienda ───────────────────────────────────────────────────────────────────
prueba('la cuenta del inbox se traduce a la tienda del CRM', () => {
  assert.equal(tiendaDeCuenta('IND'), 'INDSTORE')
  assert.equal(tiendaDeCuenta('MANDI'), 'MANDARINA')
})

prueba('una cuenta desconocida (YAW, undefined) devuelve null', () => {
  // YAW no pautea y queda fuera a propósito.
  assert.equal(tiendaDeCuenta('YAW'), null)
  assert.equal(tiendaDeCuenta(undefined), null)
})

// ── Ventana de atribución ────────────────────────────────────────────────────
prueba('un pedido dentro de los 30 dias cuenta', () => {
  assert.equal(dentroDeVentana('2026-07-01T10:00:00Z', '2026-07-20T10:00:00Z', VENTANA_DIAS), true)
})

prueba('un pedido pasados los 30 dias NO cuenta', () => {
  assert.equal(dentroDeVentana('2026-07-01T10:00:00Z', '2026-08-15T10:00:00Z', 30), false)
})

prueba('un pedido ANTERIOR al primer contacto NO cuenta', () => {
  // Cliente viejo que ya compraba antes de ver el anuncio: no es merito de la pauta.
  assert.equal(dentroDeVentana('2026-07-20T10:00:00Z', '2026-07-01T10:00:00Z', 30), false)
})

prueba('el borde exacto de los 30 dias queda afuera', () => {
  assert.equal(dentroDeVentana('2026-07-01T00:00:00Z', '2026-07-31T00:00:00Z', 30), false)
  assert.equal(dentroDeVentana('2026-07-01T00:00:00Z', '2026-07-30T23:59:00Z', 30), true)
})

prueba('dentroDeVentana con una fecha corrupta devuelve false', () => {
  // NaN en getTime() es indefinido en la ventana.
  assert.equal(dentroDeVentana('2026-07-01T10:00:00Z', 'fecha-corrupta', 30), false)
  assert.equal(dentroDeVentana('fecha-corrupta', '2026-07-20T10:00:00Z', 30), false)
})

// ── Último anuncio (regla R1) ────────────────────────────────────────────────
prueba('con varios anuncios gana el ULTIMO antes del pedido', () => {
  const refs = [
    { adId: 'A', fecha: '2026-07-14T10:00:00Z' },
    { adId: 'B', fecha: '2026-07-18T10:00:00Z' },
    { adId: 'C', fecha: '2026-07-25T10:00:00Z' },
  ]
  assert.equal(ultimoAnuncioAntesDe(refs, '2026-07-20T00:00:00Z'), 'B')
})

prueba('sin pedido gana el anuncio mas reciente', () => {
  const refs = [
    { adId: 'A', fecha: '2026-07-14T10:00:00Z' },
    { adId: 'B', fecha: '2026-07-18T10:00:00Z' },
  ]
  assert.equal(ultimoAnuncioAntesDe(refs, null), 'B')
})

prueba('sin anuncios devuelve null, no undefined', () => {
  assert.equal(ultimoAnuncioAntesDe([], null), null)
})

prueba('con dos anuncios de la misma fecha gana el primero del array (sort estable)', () => {
  // Empate: mismo timestamp, diferente adId. El sort es estable: gana A porque
  // viene primero en el array original (aunque el sort pone a B antes).
  const refs = [
    { adId: 'A', fecha: '2026-07-18T10:00:00Z' },
    { adId: 'B', fecha: '2026-07-18T10:00:00Z' },
  ]
  assert.equal(ultimoAnuncioAntesDe(refs, '2026-07-20T00:00:00Z'), 'A')
})

// ── ROAS ─────────────────────────────────────────────────────────────────────
prueba('roasDe calcula venta sobre gasto', () => {
  assert.equal(roasDe(300, 100), 3)
})

prueba('roasDe con gasto cero devuelve null, NUNCA Infinity', () => {
  // Un anuncio sin gasto conocido daria ROAS infinito y la pantalla mentiria.
  assert.equal(roasDe(300, 0), null)
  assert.equal(roasDe(300, null), null)
})

prueba('brechaRoas devuelve null si falta cualquiera de los dos', () => {
  assert.equal(brechaRoas(null, 1.4), null)
  assert.equal(brechaRoas(5.9, null), null)
})

prueba('brechaRoas mide cuanto se aleja el CRM de Meta', () => {
  // Meta dice 4x, el CRM verifica 1x -> el CRM ve 75% menos.
  assert.equal(brechaRoas(4, 1), -0.75)
})

prueba('brechaRoas con roasMeta cero o negativo devuelve null', () => {
  // ROAS de Meta cero o negativo es inválido para calcular brecha.
  assert.equal(brechaRoas(0, 1.4), null)
  assert.equal(brechaRoas(-2, 1.4), null)
})

// ── Fecha piso ───────────────────────────────────────────────────────────────
prueba('una fecha anterior al piso se recorta al piso', () => {
  assert.equal(recortarFechaPiso('2026-06-01'), FECHA_PISO)
})

prueba('una fecha posterior al piso se respeta', () => {
  assert.equal(recortarFechaPiso('2026-07-20'), '2026-07-20')
})

prueba('la fecha piso es el 13-jul-2026 y no otra', () => {
  // Ancla el literal: si alguien cambia por error esa constante, la prueba falla.
  assert.equal(FECHA_PISO, '2026-07-13')
})

prueba('recortarFechaPiso con string vacío, null o undefined retorna el piso', () => {
  // Rama !desde
  assert.equal(recortarFechaPiso(''), FECHA_PISO)
  assert.equal(recortarFechaPiso(null), FECHA_PISO)
  assert.equal(recortarFechaPiso(undefined), FECHA_PISO)
})

prueba('recortarFechaPiso con la fecha exacta del piso se respeta', () => {
  assert.equal(recortarFechaPiso(FECHA_PISO), FECHA_PISO)
  assert.equal(recortarFechaPiso('2026-07-13'), '2026-07-13')
})

console.log(`\n${pasadas} pruebas pasadas`)
