// scripts/test-bandeja-produccion.mjs
//
// DOS comprobaciones sobre la bandeja de Producción, contra la base real. SOLO LEE.
//
//   1. RECONCILIACIÓN: lo que devuelve la consulta de /api/produccion tiene que
//      coincidir, pedido a pedido, con una consulta de referencia hecha por OTRO
//      camino (sin la vista y sin el anidado). Es la prueba que NO existía y que
//      habría cazado los 21 pedidos invisibles el 4-ago-2026.
//
//   2. CONTROL NEGATIVO: se fuerza una lectura truncada y se comprueba que se
//      detecta. Del propio repo (app/api/eventos/route.js): "una alarma que nunca
//      se prueba es una alarma que no tienes".
//
// USO: node scripts/test-bandeja-produccion.mjs
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (en .env.local)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { areasDeUsuario, prendaEsDelUsuario } from '../lib/areas-usuario.js'
import { esCompleta } from '../lib/bandeja-estado.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const v = m[2].replace(/^["']|["']$/g, '')
    if (process.env[m[1]] === undefined && v !== '') process.env[m[1]] = v
  }
}

const limpio = (v) => String(v || '').replace(/^﻿/, '').trim()
const faltan = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !limpio(process.env[k]))
if (faltan.length) {
  console.error(`\n✕ Faltan variables en .env.local: ${faltan.join(', ')}`)
  console.error('  Ojo: `vercel env pull` las trae VACÍAS. Hay que copiarlas a mano desde Vercel.\n')
  process.exit(1)
}

const sb = createClient(limpio(process.env.SUPABASE_URL), limpio(process.env.SUPABASE_SERVICE_ROLE_KEY), {
  db: { schema: 'crm' },
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (i, init) => fetch(i, { ...init, cache: 'no-store' }) },
})

let fallos = 0
const ok = (cond, msg) => { console.log(`   ${cond ? '✓' : '✕'} ${msg}`); if (!cond) fallos++ }

// Se prueba con las áreas de David, que es quien no vio el 5599.
const QUIEN = 'David (DISEÑO · SUBLIMACION + ESTAMPADO)'
const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])

// ── 1. Reconciliación ─────────────────────────────────────────────────────────
console.log(`\n── 1. Reconciliación — ${QUIEN} ──`)

// (a) El camino de /api/produccion: vista + join anidado + count del anidado.
const { data: filas, count, error: e1 } = await sb
  .from('pedidos')
  .select('pedido_id, prendas:prendas_en_taller(item_id,area), total_prendas:prendas_en_taller(count)',
          { count: 'exact' })
  .eq('estado_pedido', 'EN_FABRICA')
if (e1) { console.error('   ✕ la consulta de la bandeja fallo:', e1.message); process.exit(1) }

const bandeja = new Map()
let truncados = 0
for (const p of filas || []) {
  const llegaron = (p.prendas || []).length
  const total = p.total_prendas?.[0]?.count ?? null
  if (!esCompleta({ recibidas: llegaron, total })) truncados++
  const mias = (p.prendas || []).filter((d) => prendaEsDelUsuario(d.area, suyas))
  if (mias.length) bandeja.set(p.pedido_id, mias.length)
}

// (b) El camino de referencia: detalle_pedido en PLANO, sin la vista y sin anidar.
//     Si los dos coinciden, es que ni la vista ni el anidado se comen nada.
const { data: crudas, error: e2 } = await sb
  .from('detalle_pedido')
  .select('pedido_id, area, subestado, pedidos!inner(estado_pedido)')
  .eq('eliminado', false)
  .eq('pedidos.estado_pedido', 'EN_FABRICA')
if (e2) { console.error('   ✕ la consulta de referencia fallo:', e2.message); process.exit(1) }

const referencia = new Map()
for (const d of crudas || []) {
  if (d.subestado === 'ELIMINADO' || d.subestado === 'ENTREGADO_TIENDA') continue
  if (!prendaEsDelUsuario(d.area, suyas)) continue
  referencia.set(d.pedido_id, (referencia.get(d.pedido_id) || 0) + 1)
}

ok(bandeja.size === referencia.size,
   `mismos pedidos: bandeja ${bandeja.size} · referencia ${referencia.size}`)

const descuadres = [...referencia].filter(([id, n]) => bandeja.get(id) !== n)
ok(descuadres.length === 0,
   `mismas prendas por pedido${descuadres.length
     ? ` — descuadran: ${descuadres.slice(0, 5).map(([i, n]) => `${i} (ref ${n}, bandeja ${bandeja.get(i) ?? 0})`).join(', ')}`
     : ''}`)

ok(esCompleta({ recibidas: (filas || []).length, total: count }),
   `los pedidos llegaron completos: ${(filas || []).length} de ${count}`)

ok(truncados === 0, `ningun pedido llego sin todas sus prendas (truncados: ${truncados})`)

// ── 2. Control negativo ───────────────────────────────────────────────────────
console.log('\n── 2. Control negativo (lectura limitada a 5 a propósito) ──')

const { data: cortada, count: totalReal } = await sb
  .from('pedidos').select('pedido_id', { count: 'exact' })
  .eq('estado_pedido', 'EN_FABRICA').limit(5)

ok(totalReal > 5, `hay ${totalReal} pedidos, suficientes para que la prueba signifique algo`)
ok(!esCompleta({ recibidas: (cortada || []).length, total: totalReal }),
   `una lectura de ${(cortada || []).length} sobre ${totalReal} se detecta como INCOMPLETA`)

// Y el caso contrario: que no grite cuando todo está bien.
ok(esCompleta({ recibidas: totalReal, total: totalReal }),
   'una lectura completa NO se marca como incompleta (sin falsos positivos)')

console.log(fallos === 0 ? '\n✓ TODO BIEN\n' : `\n✕ ${fallos} FALLO(S)\n`)
process.exit(fallos === 0 ? 0 : 1)
