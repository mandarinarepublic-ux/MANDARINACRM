// Sincronización automática del reporte de pagos (19-nov-2026).
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('cron de pagos: agendado en vercel.json y abierto en el middleware', () => {
  const crons = JSON.parse(src('vercel.json')).crons.map((c) => c.path)
  assert.ok(crons.includes('/api/cron/pagos'))
  assert.match(src('middleware.js'), /'\/api\/cron\/pagos'/)
})

test('cron de pagos: exige CRON_SECRET (sin él en producción, 401) y usa la misma sincronización que la pantalla', () => {
  const cron = src('app/api/cron/pagos/route.js')
  assert.match(cron, /CRON_SECRET/)
  assert.match(cron, /VERCEL_ENV !== 'production'/)
  assert.match(cron, /status: 401/)
  assert.match(cron, /sincronizarPasarelas/)
  assert.match(src('app/api/reporte-pagos/route.js'), /sincronizarPasarelas\(\{ desde, hasta \}\)/)
})

test('sincronización: sigue limitando la consulta por lotes de Payphone (5 por día)', () => {
  const lib = src('lib/sincronizarPagos.js')
  assert.match(lib, /HORAS_ENTRE_LOTES = 5/)
  assert.match(lib, /ultimaSync\('payphone_lotes'\)/)
})
