// La ficha del pedido mostraba la fecha del abono cortando el texto de Supabase:
// salía "2026-11-23T22:11:52.967+00:00" entero, o el día UTC (un abono de las
// 20:58 del 22-nov salía como 23). Debe verse en hora de Ecuador.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatFechaCorta } from '../lib/parseFecha.js'

test('abono de la tarde: fecha legible en hora de Ecuador', () => {
  assert.equal(formatFechaCorta('2026-11-23T22:11:52.967+00:00'), '23 Nov · 17:11')
})

test('abono de la noche no salta al día siguiente (UTC)', () => {
  assert.equal(formatFechaCorta('2026-11-23T01:58:13+00:00'), '22 Nov · 20:58')
})
