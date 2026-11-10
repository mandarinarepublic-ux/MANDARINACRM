// Producción: combo del ESTADO DEL PEDIDO al lado del PDF (solo ADMIN).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/produccion/page.js', import.meta.url), 'utf8')

test('el combo cambia ESTADO_PEDIDO (no las prendas) y va antes del PDF', () => {
  assert.ok(/ESTADO_PEDIDO: nuevo/.test(src))
  const i = src.indexOf('<ComboEstadoPedido'), j = src.indexOf('title="Ver hoja de confección PDF"')
  assert.ok(i > -1 && i < j)
})

test('☠️ solo ADMIN, igual que en el detalle del pedido', () => {
  assert.ok(/if \(user\?\.rol !== 'ADMIN'\) return null/.test(src))
})

test('deja rastro de quién lo cambió', () => {
  const k = src.indexOf('ESTADO_PEDIDO: nuevo')
  assert.ok(src.slice(k, k + 80).includes('_usuarioId'))
})
