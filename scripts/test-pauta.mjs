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

// ── Tienda ───────────────────────────────────────────────────────────────────
prueba('la cuenta del inbox se traduce a la tienda del CRM', () => {
  assert.equal(tiendaDeCuenta('IND'), 'INDSTORE')
  assert.equal(tiendaDeCuenta('MANDI'), 'MANDARINA')
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

// ── Fecha piso ───────────────────────────────────────────────────────────────
prueba('una fecha anterior al piso se recorta al piso', () => {
  assert.equal(recortarFechaPiso('2026-06-01'), FECHA_PISO)
})

prueba('una fecha posterior al piso se respeta', () => {
  assert.equal(recortarFechaPiso('2026-07-20'), '2026-07-20')
})

console.log(`\n${pasadas} pruebas pasadas`)
