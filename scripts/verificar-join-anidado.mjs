// scripts/verificar-join-anidado.mjs
//
// ¿El tope de 1000 de PostgREST se aplica a la tabla RAÍZ o también a las filas
// anidadas? De esto depende todo el diseño de /api/produccion.
//
// NO se asume: se mide. Suponer cómo se comporta PostgREST es lo que dejó 21
// pedidos invisibles durante 14 días.
//
// USO: node scripts/verificar-join-anidado.mjs
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (en .env.local)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

// El BOM invisible que PowerShell le mete a las variables falla SOLO en producción.
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

console.log('\n── 1. ¿Cuántas prendas hay en total? ──')
const { count: totalPrendas } = await sb
  .from('detalle_pedido').select('*', { count: 'exact', head: true }).eq('eliminado', false)
console.log(`   ${totalPrendas} prendas vivas`)

console.log('\n── 2. Join anidado SIN filtro de estado (el caso extremo) ──')
const { data: todos, error: e1 } = await sb
  .from('pedidos').select('pedido_id, detalle_pedido(item_id)')
if (e1) { console.error('   ✕ error:', e1.message); process.exit(1) }
const anidadas = todos.reduce((s, p) => s + (p.detalle_pedido?.length || 0), 0)
console.log(`   pedidos (filas raíz): ${todos.length}`)
console.log(`   prendas anidadas:     ${anidadas}`)
console.log(anidadas >= totalPrendas
  ? '   ✓ las anidadas NO se truncan: llegaron todas'
  : `   ✕ SE TRUNCAN: faltan ${totalPrendas - anidadas}. El diseño necesita función SQL.`)

console.log('\n── 3. ¿La vista se puede anidar? (falla si aún no existe) ──')
const { data: conVista, error: e2 } = await sb
  .from('pedidos').select('pedido_id, prendas_en_taller(item_id)').limit(3)
console.log(e2
  ? `   ✕ no se puede anidar la vista: ${e2.message}\n     → alternativa: anidar detalle_pedido y repetir el filtro, o función SQL`
  : `   ✓ la vista se anida bien (${conVista.length} pedidos de muestra)`)

console.log('\n── 4. Filas raíz con el filtro de estado ──')
const { count: enFabrica } = await sb
  .from('pedidos').select('*', { count: 'exact', head: true }).eq('estado_pedido', 'EN_FABRICA')
console.log(`   ${enFabrica} pedidos EN_FABRICA · margen hasta 1000: ${1000 - enFabrica}\n`)
