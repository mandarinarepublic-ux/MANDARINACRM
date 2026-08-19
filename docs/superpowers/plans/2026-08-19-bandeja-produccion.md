# Bandeja de PRODUCCIÓN — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea.
> Los pasos usan casillas (`- [ ]`) para llevar el control.

**Objetivo:** que ningún pedido con prendas del área de quien mira pueda desaparecer
de la bandeja de Producción, y que una lectura incompleta se vea en vez de esconderse.

**Arquitectura:** endpoint nuevo `GET /api/produccion` que filtra en Postgres por
estado y por las áreas del usuario de la **cookie firmada**, con el join anidado de
PostgREST sobre una vista única. Baja de 3.541 filas / 966 kB a ~113 filas / ~45 kB
para David. `/api/pedidos` no se toca: las otras ocho pantallas siguen igual.

**Stack:** Next.js 14 (App Router) · Supabase (`@supabase/supabase-js`, schema `crm`)
· pruebas con `node --test` · Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-19-bandeja-produccion-design.md`

## Restricciones globales

- **Español ecuatoriano con TUTEO** en todo texto visible, comentarios y commits.
  Nada de voseo (`vos`, `podés`). Se dice `tú`, `puedes`, `dime`.
- **Rama `main` siempre.** No crear ramas: Preview no sirve porque Supabase solo
  está en Production.
- **NUNCA `git add -A` ni `git add .`** — hay trabajo del usuario sin commitear.
  Agregar siempre archivos **por nombre**.
- Un `lib/` con prueba unitaria se importa con **ruta relativa** (`../lib/x.js`),
  nunca con `@/`: `node --test` no entiende el alias y tumba la suite entera.
- **Supabase es la fuente oficial.** No sincronizar Sheets.
- Todo `registrarEvento` va **con `await`**: en serverless la instancia se congela
  al responder y el evento se pierde.
- Antes de dar por bueno un despliegue: `git status -sb` y confirmar que el alias
  `crm.apps.mandarinaec.com` apunta a ese commit.

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `scripts/verificar-join-anidado.mjs` | **Crear.** Prueba el riesgo abierto antes de construir encima |
| `docs/sql/2026-08-19-prendas-en-taller.sql` | **Crear.** La vista, guardada como las otras migraciones |
| `lib/areas-usuario.js` | **Crear.** Qué prendas le tocan a un usuario. Función pura |
| `lib/bandeja-estado.js` | **Crear.** Completitud y estado de pantalla. Función pura |
| `lib/db/produccion.js` | **Crear.** La consulta. Único sitio que habla con Supabase |
| `app/api/produccion/route.js` | **Crear.** Endpoint: identidad, orquestación, aviso |
| `app/dashboard/produccion/page.js` | **Modificar.** Consume el endpoint nuevo, 4 estados |
| `tests/areas-usuario.test.js` | **Crear.** |
| `tests/bandeja-estado.test.js` | **Crear.** |
| `tests/bandeja-sin-filtro-oculto.test.js` | **Crear.** Prueba de fuente: que el filtro no vuelva |
| `scripts/test-bandeja-produccion.mjs` | **Crear.** Reconciliación contra la base |

---

## Task 1: Verificar el riesgo abierto antes de construir nada

> ## ✅ EJECUTADA el 19-ago-2026 — y el resultado cambió el diseño
>
> **SÍ SE TRUNCA.** Un padre con **1.500** hijos devolvió **1.000**: el tope de
> PostgREST se aplica **a cada recurso anidado por separado**, no solo a la tabla
> raíz. La suposición del spec era falsa.
>
> Medido con tablas desechables (`crm.zz_prueba_padre` / `zz_prueba_hijo`, creadas,
> medidas y **borradas** — verificado: 0 tablas `zz_` en la base). No se usó el
> script `.mjs` porque `SUPABASE_SERVICE_ROLE_KEY` no estaba disponible; se midió
> por HTTP con la clave pública contra tablas de prueba con datos sintéticos.
>
> **No hizo falta la función SQL.** La misma medición encontró la salida:
>
> ```
> zz_prueba_padre?select=id,prendas:zz_prueba_hijo(id),total:zz_prueba_hijo(count)
>   padre 1: llegaron 1000 de 1500  <- TRUNCADO, detectado
>   padre 2: llegaron 10 de 10      ok
> ```
>
> El `count` del recurso anidado **no se trunca** y se puede pedir junto a las
> filas. De ahí salen las correcciones a §4.3 y §4.5 del spec, y los cambios de las
> tareas 5, 6 y 7 de este plan (ya aplicados abajo).
>
> El script `scripts/verificar-join-anidado.mjs` queda igualmente: sirve para
> re-verificarlo contra los datos reales el día que haya credenciales.

El spec asume que el tope de 1000 se aplica a la tabla raíz y no a las prendas
anidadas. **Es una suposición sobre PostgREST, y suponer es exactamente lo que
causó este bug.** Si falla, todo el diseño cambia a función SQL.

**Files:**
- Create: `scripts/verificar-join-anidado.mjs`

**Interfaces:**
- Produces: la respuesta a *"¿el join anidado trunca?"*. Las tareas 5 y 6 dependen de esto.

**Ya verificado el 19-ago-2026** (no hace falta comprobarlo otra vez): las dos claves
foráneas que PostgREST necesita para anidar **existen** —
`detalle_pedido.pedido_id → pedidos.pedido_id` y `pedidos.cliente_id → clientes.cliente_id`.
Lo que sigue sin verificar, y es lo que mide esta tarea, es **si el tope de 1000 se
aplica también a las filas anidadas** y **si la vista se puede anidar** (una vista no
hereda las FK de su tabla base).

- [ ] **Step 1: Escribir el script de verificación**

```js
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

const limpio = (v) => String(v || '').replace(/^﻿/, '').trim()
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!limpio(process.env[k])) { console.error(`Falta ${k} en .env.local`); process.exit(1) }
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
```

- [ ] **Step 2: Correrlo**

```bash
node scripts/verificar-join-anidado.mjs
```

Esperado: el punto 2 dice `✓ las anidadas NO se truncan`.

**Si el punto 2 dice `✕ SE TRUNCAN`: PARA.** El diseño necesita una función SQL en
lugar del join anidado. Avísale a Rodrigo antes de seguir; las tareas 5 y 6 cambian.

El punto 3 va a fallar todavía (la vista no existe): es lo esperado. Se vuelve a
correr después de la Task 2.

- [ ] **Step 3: Anotar el resultado en el spec**

Añade al final de la §6 del spec, con el número real:

```markdown
### Verificado el 19-ago-2026
`node scripts/verificar-join-anidado.mjs` → las prendas anidadas NO se truncan:
llegaron N de N. El diseño con join anidado se mantiene.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verificar-join-anidado.mjs docs/superpowers/specs/2026-08-19-bandeja-produccion-design.md
git commit -m "chore(produccion): verificar que el join anidado no trunca antes de construir encima"
```

---

## Task 2: La vista `crm.prendas_en_taller`

Una sola definición de "prenda que cuenta". Hoy ese criterio vive en tres sitios y
uno de ellos (`SUBESTADO !== 'ELIMINADO'`) es código muerto en Supabase.

**Files:**
- Create: `docs/sql/2026-08-19-prendas-en-taller.sql`

**Interfaces:**
- Produces: la vista `crm.prendas_en_taller`, que consume `lib/db/produccion.js` (Task 5).

- [ ] **Step 1: Escribir la migración**

```sql
-- docs/sql/2026-08-19-prendas-en-taller.sql
--
-- Una sola definición de "prenda que le toca al taller".
--
-- Hoy ese criterio está escrito en TRES sitios que pueden divergir:
--   1. `eliminado = false`            → el repositorio (el único que funciona)
--   2. `SUBESTADO !== 'ELIMINADO'`    → las pantallas. En Supabase NUNCA se cumple:
--                                        softDeleteItem pone `eliminado = true` y
--                                        no toca el subestado. Es código muerto.
--   3. `SUBESTADO !== 'ENTREGADO_TIENDA'` → las pantallas
--
-- Esa duplicación produjo un falso positivo en el diseño: un conteo que incluía
-- prendas eliminadas habría marcado "faltan prendas" en pedidos completos, para
-- siempre. Con la vista, la lista y el conteo leen el mismo criterio.

create or replace view crm.prendas_en_taller as
  select *
    from crm.detalle_pedido
   where eliminado = false
     and subestado is distinct from 'ELIMINADO'
     and subestado is distinct from 'ENTREGADO_TIENDA';

comment on view crm.prendas_en_taller is
  'Prendas que el taller debe fabricar. Único criterio de "prenda que cuenta": '
  'excluye eliminadas (columna y subestado) y las de ENTREGA EN TIENDA, que nacen '
  'entregadas y nunca pasan por fábrica. Ver docs/superpowers/specs/2026-08-19-bandeja-produccion-design.md';
```

- [ ] **Step 2: Aplicarla**

Con el MCP de Supabase (`apply_migration`, nombre `prendas_en_taller`) o desde el
editor SQL del panel. **`apply_migration` la registra sola** en
`supabase_migrations.schema_migrations`; no la registres a mano.

- [ ] **Step 3: Verificar que devuelve lo esperado**

```sql
select
  (select count(*) from crm.detalle_pedido)        as todas,
  (select count(*) from crm.prendas_en_taller)     as en_taller,
  (select count(*) from crm.detalle_pedido
    where eliminado or subestado in ('ELIMINADO','ENTREGADO_TIENDA')) as excluidas;
```

Esperado el 19-ago-2026: `todas = 1261`, `en_taller = 1228`, `excluidas = 33`.
Si `todas <> en_taller + excluidas`, la vista está mal.

- [ ] **Step 4: Volver a correr la verificación del join**

```bash
node scripts/verificar-join-anidado.mjs
```

Ahora el punto 3 debe decir `✓ la vista se anida bien`.

**Si dice que no se puede anidar la vista: PARA y avisa.** La alternativa es anidar
`detalle_pedido` repitiendo el filtro en la consulta — lo que reintroduce la
duplicación que esta tarea elimina, así que es una decisión de Rodrigo, no tuya.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/2026-08-19-prendas-en-taller.sql
git commit -m "feat(produccion): vista prendas_en_taller, una sola definicion de prenda que cuenta"
```

---

## Task 3: `lib/areas-usuario.js` — qué prendas le tocan a cada quien

**Files:**
- Create: `lib/areas-usuario.js`
- Test: `tests/areas-usuario.test.js`

**Interfaces:**
- Produces:
  - `AREAS_BASE: string[]`
  - `areasDeUsuario(rol: string, areas: string[]): string[] | null` — `null` = ve todas
  - `prendaEsDelUsuario(areaPrenda: string, areasUsuario: string[]|null): boolean`
  - Las consumen `lib/db/produccion.js` (Task 5) y `app/api/produccion/route.js` (Task 6).

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
// tests/areas-usuario.test.js
//
// Quién ve qué prenda. Esto vivía dentro del componente de Producción, así que no
// se podía probar: la única forma de saber si David veía sus camisetas era abrir
// la pantalla con su cuenta.
import test from 'node:test'
import assert from 'node:assert'
import { areasDeUsuario, prendaEsDelUsuario } from '../lib/areas-usuario.js'

test('ADMIN y CORTE ven todas las areas', () => {
  assert.equal(areasDeUsuario('ADMIN', []), null)
  assert.equal(areasDeUsuario('CORTE', []), null)
})

test('TODAS como area es un comodin', () => {
  assert.equal(areasDeUsuario('DISEÑO', ['TODAS']), null)
})

test('David: rol DISEÑO con SUBLIMACION y ESTAMPADO', () => {
  assert.deepEqual(areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO']), ['SUBLIMACION', 'ESTAMPADO'])
})

test('Christian Garzon: rol DISEÑO con BORDADO', () => {
  assert.deepEqual(areasDeUsuario('DISEÑO', ['BORDADO']), ['BORDADO'])
})

test('DISEÑO sin areas NO ve nada (es a proposito)', () => {
  // Un usuario de DISEÑO al que le quitaron todas las areas veia las prendas de
  // TODAS, lo contrario de lo que quiso el admin.
  assert.deepEqual(areasDeUsuario('DISEÑO', []), [])
})

test('un rol de area sin areas asignadas cae en su propio rol', () => {
  assert.deepEqual(areasDeUsuario('SUBLIMACION', []), ['SUBLIMACION'])
  assert.deepEqual(areasDeUsuario('BORDADO', []), ['BORDADO'])
})

test('un rol que no pinta en produccion no ve nada', () => {
  // CAMBIO DELIBERADO: itemEsDeUsuario terminaba en `return true`, asi que un
  // VENDEDOR que escribiera la URL a mano veia TODAS las prendas. Ahora no ve nada.
  assert.deepEqual(areasDeUsuario('VENDEDOR', []), [])
  assert.deepEqual(areasDeUsuario('DESPACHO', []), [])
})

test('David ve una prenda de area combinada si una de las suyas esta dentro', () => {
  const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])
  assert.equal(prendaEsDelUsuario('ESTAMPADO', suyas), true)
  assert.equal(prendaEsDelUsuario('ESTAMPADO + BORDADO', suyas), true)
  assert.equal(prendaEsDelUsuario('SUBLIMACION + BORDADO', suyas), true)
  assert.equal(prendaEsDelUsuario('BORDADO', suyas), false)
})

test('las areas que no son de taller no son de nadie', () => {
  const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])
  assert.equal(prendaEsDelUsuario('PRODUCTO SIN DISEÑO', suyas), false)
  assert.equal(prendaEsDelUsuario('ENTREGA EN TIENDA', suyas), false)
})

test('con areas null (ADMIN) toda prenda cuenta, menos la vacia', () => {
  assert.equal(prendaEsDelUsuario('BORDADO', null), true)
  assert.equal(prendaEsDelUsuario('PRODUCTO SIN DISEÑO', null), true)
  assert.equal(prendaEsDelUsuario('', null), false)
})

test('basura no revienta', () => {
  assert.equal(prendaEsDelUsuario(null, ['BORDADO']), false)
  assert.equal(prendaEsDelUsuario(undefined, null), false)
  assert.deepEqual(areasDeUsuario(null, null), [])
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test tests/areas-usuario.test.js
```

Esperado: FALLA con `Cannot find module '../lib/areas-usuario.js'`.

- [ ] **Step 3: Escribir la implementación mínima**

```js
// lib/areas-usuario.js
//
// Qué prendas le tocan a cada persona del taller.
//
// Esto vivía dentro de app/dashboard/produccion/page.js, donde no se podía probar
// ni reutilizar — y donde el servidor no podía verlo, así que el filtro se hacía
// en el navegador sobre datos que ya se habían enviado enteros.
//
// ⚠️ El área NO sale del rol: sale de `usuarios.areas`. En producción no hay ni un
// usuario con rol SUBLIMACION/ESTAMPADO/BORDADO; el taller entra con rol DISEÑO y
// sus áreas asignadas (David: SUBLIMACION+ESTAMPADO · Christian Garzón: BORDADO).

/** Las tres áreas que se reparten entre la gente del taller. */
export const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/**
 * Áreas cuyas prendas le tocan a este usuario.
 * @returns {string[]|null} null = las ve TODAS · [] = no ve ninguna
 */
export function areasDeUsuario(rol, areas) {
  const r = norm(rol)
  if (r === 'ADMIN' || r === 'CORTE') return null

  const propias = (Array.isArray(areas) ? areas : []).map(norm).filter(Boolean)
  if (propias.length === 1 && propias[0] === 'TODAS') return null
  if (propias.length > 0) return propias.filter((a) => AREAS_BASE.includes(a))

  // Sin áreas asignadas, el rol decide.
  if (AREAS_BASE.includes(r)) return [r]

  // DISEÑO sin áreas no ve nada, y cualquier otro rol tampoco. Antes esto
  // terminaba en `return true`: un VENDEDOR que escribiera la URL a mano veía
  // TODAS las prendas del taller.
  return []
}

/** ¿Esta prenda es de alguna de sus áreas? `ESTAMPADO + BORDADO` cuenta para los dos. */
export function prendaEsDelUsuario(areaPrenda, areasUsuario) {
  const a = norm(areaPrenda)
  if (!a) return false
  if (areasUsuario === null) return true
  return areasUsuario.some((suya) => a.includes(suya))
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
node --test tests/areas-usuario.test.js
```

Esperado: PASS, 11 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/areas-usuario.js tests/areas-usuario.test.js
git commit -m "feat(produccion): sacar el filtro de areas a lib/ para poder probarlo"
```

---

## Task 4: `lib/bandeja-estado.js` — completitud y estado de pantalla

**Files:**
- Create: `lib/bandeja-estado.js`
- Test: `tests/bandeja-estado.test.js`

**Interfaces:**
- Produces:
  - `esCompleta({ recibidas, total }): boolean`
  - `estadoBandeja({ ok, completo, pedidos }): 'ERROR'|'INCOMPLETO'|'VACIO'|'LISTA'`
  - Los consumen `app/api/produccion/route.js` (Task 6) y la pantalla (Task 7).

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
// tests/bandeja-estado.test.js
//
// La bandeja pintaba "✅ ¡Todo al día!" tanto cuando no había trabajo como cuando
// la carga fallaba o venía a medias. Por eso 21 pedidos invisibles pasaron 14 días
// sin que nadie lo reportara: no había nada que reportar, la pantalla decía que
// todo estaba bien.
import test from 'node:test'
import assert from 'node:assert'
import { esCompleta, estadoBandeja } from '../lib/bandeja-estado.js'

test('si llegaron todas, la lectura es completa', () => {
  assert.equal(esCompleta({ recibidas: 63, total: 63 }), true)
})

test('si faltan filas, NO es completa', () => {
  assert.equal(esCompleta({ recibidas: 1000, total: 1261 }), false)
})

test('ante la duda, incompleta', () => {
  // Sin total no se puede AFIRMAR que la lista esté completa. Falla hacia el
  // aviso, nunca hacia el silencio.
  assert.equal(esCompleta({ recibidas: 63, total: null }), false)
  assert.equal(esCompleta({ recibidas: 63, total: undefined }), false)
  assert.equal(esCompleta({}), false)
})

test('recibir MAS de lo esperado tampoco es normal, pero no oculta nada', () => {
  assert.equal(esCompleta({ recibidas: 64, total: 63 }), true)
})

// ── LA invariante ─────────────────────────────────────────────────────────────
test('NUNCA dice VACIO si la carga fallo', () => {
  assert.equal(estadoBandeja({ ok: false, completo: true, pedidos: [] }), 'ERROR')
  assert.equal(estadoBandeja({ ok: false, completo: false, pedidos: [] }), 'ERROR')
})

test('NUNCA dice VACIO si la lectura vino incompleta', () => {
  assert.equal(estadoBandeja({ ok: true, completo: false, pedidos: [] }), 'INCOMPLETO')
})

test('INCOMPLETO manda aunque hayan llegado pedidos', () => {
  assert.equal(estadoBandeja({ ok: true, completo: false, pedidos: [{}, {}] }), 'INCOMPLETO')
})

test('VACIO solo con carga buena, completa y sin pedidos', () => {
  assert.equal(estadoBandeja({ ok: true, completo: true, pedidos: [] }), 'VACIO')
})

test('con pedidos y todo bien, LISTA', () => {
  assert.equal(estadoBandeja({ ok: true, completo: true, pedidos: [{}] }), 'LISTA')
})

test('sin argumentos no revienta y no miente', () => {
  assert.equal(estadoBandeja({}), 'ERROR')
  assert.equal(estadoBandeja(), 'ERROR')
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test tests/bandeja-estado.test.js
```

Esperado: FALLA con `Cannot find module '../lib/bandeja-estado.js'`.

- [ ] **Step 3: Escribir la implementación mínima**

```js
// lib/bandeja-estado.js
//
// Distinguir "no hay trabajo" de "no pude cargar" y de "cargué a medias".
//
// La bandeja de Producción tenía DOS estados (cargando / vacío) y "vacío"
// significaba cinco cosas distintas. Un 401, un 500, una respuesta truncada y un
// día sin pedidos se veían todos como "✅ ¡Todo al día!".

/**
 * ¿La lectura trajo todo lo que había?
 * Sin `total` devuelve false: no se puede afirmar que una lista está completa sin
 * la evidencia de que lo está.
 */
export function esCompleta({ recibidas, total } = {}) {
  if (typeof total !== 'number' || !Number.isFinite(total)) return false
  if (typeof recibidas !== 'number' || !Number.isFinite(recibidas)) return false
  return recibidas >= total
}

/**
 * En qué estado está la bandeja.
 * INVARIANTE: nunca devuelve 'VACIO' si `ok` o `completo` son falsos.
 */
export function estadoBandeja({ ok, completo, pedidos } = {}) {
  if (ok !== true) return 'ERROR'
  if (completo !== true) return 'INCOMPLETO'
  return (Array.isArray(pedidos) && pedidos.length > 0) ? 'LISTA' : 'VACIO'
}
```

- [ ] **Step 4: Correr y ver que pasa**

```bash
node --test tests/bandeja-estado.test.js
```

Esperado: PASS, 10 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/bandeja-estado.js tests/bandeja-estado.test.js
git commit -m "feat(produccion): la bandeja ya no puede decir 'todo al dia' sin estar segura"
```

---

## Task 5: `lib/db/produccion.js` — la consulta

**Files:**
- Create: `lib/db/produccion.js`

**Interfaces:**
- Consumes: `areasDeUsuario`, `prendaEsDelUsuario` (Task 3) · `esCompleta` (Task 4)
  · la vista `crm.prendas_en_taller` (Task 2)
- Produces: `listBandejaProduccion(usuario): Promise<{ pedidos, meta }>`
  con `meta = { pedidos: number, prendas: number, completo: boolean }`.
  Lo consume `app/api/produccion/route.js` (Task 6).

- [ ] **Step 1: Escribir el repositorio**

```js
// lib/db/produccion.js
//
// La bandeja de PRODUCCIÓN. Una sola consulta, con el join hecho por Postgres.
//
// POR QUÉ EXISTE: `listPedidos` trae las cinco tablas enteras (3.541 filas,
// 966 kB) para que la pantalla descarte el 95 % en el navegador. Peor: la lectura
// de `detalle_pedido` no paginaba y PostgREST corta en 1000 SIN avisar, así que
// desde el 4-ago-2026 había pedidos que llegaban sin prendas y la pantalla los
// escondía con `.filter(items.length > 0)`. 21 pedidos invisibles, 14 días.
//
// Acá se pide solo lo que la bandeja pinta: los EN_FABRICA con las prendas del
// área de quien pregunta. Para David son 41 pedidos y 72 prendas.

import { getSupabase } from '../supabase'
import { areasDeUsuario, prendaEsDelUsuario } from '../areas-usuario.js'
import { esCompleta } from '../bandeja-estado.js'

// Solo las columnas que usan la pantalla y la hoja de confección. Verificado campo
// por campo: pagos, guías y la ficha del cliente NO se usan.
const COLS_PRENDA = [
  'item_id', 'pedido_id', 'area', 'subestado', 'subestado_corte',
  'producto_nombre', 'color', 'talla', 'cantidad',
  'detalle_personalizado', 'notas_area',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url',
  'archivo_diseno',
].join(',')

const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'fecha_pedido', 'fecha_entrega_prometida',
  'direccion_pedido', 'cliente_id',
].join(',')

/** Fila de Supabase → el shape MAYÚSCULAS que ya consume la pantalla. */
function aPrenda(d) {
  return {
    ITEM_ID: d.item_id,
    PEDIDO_ID: d.pedido_id,
    AREA: d.area ?? '',
    SUBESTADO: d.subestado ?? '',
    SUBESTADO_CORTE: d.subestado_corte ?? '',
    PRODUCTO_NOMBRE: d.producto_nombre ?? '',
    COLOR: d.color ?? '',
    TALLA: d.talla ?? '',
    CANTIDAD: d.cantidad != null ? String(d.cantidad) : '',
    DETALLE_PERSONALIZADO: d.detalle_personalizado ?? '',
    NOTAS_AREA: d.notas_area ?? '',
    FOTO_PECHO_URL: d.foto_pecho_url ?? '',
    FOTO_ESPALDA_URL: d.foto_espalda_url ?? '',
    FOTO_MANGA_D_URL: d.foto_manga_d_url ?? '',
    FOTO_MANGA_I_URL: d.foto_manga_i_url ?? '',
    // La hoja de confección lee la clave con Ñ (el header real de Sheets).
    'ARCHIVO_DISEÑO_URL': d.archivo_diseno ?? '',
    ARCHIVO_DISENO: d.archivo_diseno ?? '',
  }
}

/**
 * Los pedidos EN_FABRICA con las prendas que le tocan a `usuario`.
 * @param {{ROL:string, AREAS:string|string[]}} usuario  tal como lo devuelve getUsuarioById
 */
export async function listBandejaProduccion(usuario) {
  const areasCsv = usuario?.AREAS
  const areas = Array.isArray(areasCsv)
    ? areasCsv
    : String(areasCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const suyas = areasDeUsuario(usuario?.ROL, areas)

  // Sin áreas no ve nada. Se corta acá: no tiene sentido consultar.
  if (Array.isArray(suyas) && suyas.length === 0) {
    return { pedidos: [], meta: { pedidos: 0, prendas: 0, completo: true } }
  }

  const sb = getSupabase()

  // DOS niveles de completitud, los dos del MISMO recurso:
  //   · `count: 'exact'`              → ¿llegaron todos los PEDIDOS?
  //   · `total:prendas_en_taller(count)` → ¿llegaron todas las PRENDAS de cada uno?
  //
  // El segundo hace falta porque PostgREST trunca CADA recurso anidado por
  // separado: verificado el 19-ago-2026 con tablas desechables, un padre con 1500
  // hijos devolvió 1000. El count global cuenta pedidos, no prendas, así que sin
  // esto un pedido con más de 1000 prendas perdería prendas EN SILENCIO.
  const { data, error, count } = await sb
    .from('pedidos')
    .select(
      `${COLS_PEDIDO},` +
      `prendas:prendas_en_taller(${COLS_PRENDA}),` +
      `total_prendas:prendas_en_taller(count),` +
      `clientes(nombre,cedula,celular)`,
      { count: 'exact' })
    .eq('estado_pedido', 'EN_FABRICA')
  if (error) throw error

  const filas = data || []
  const completo = esCompleta({ recibidas: filas.length, total: count })

  const pedidos = []
  let prendas = 0
  for (const p of filas) {
    // ⚠️ La comparación va ANTES de filtrar por área, y es a propósito.
    //
    // `total_prendas` cuenta TODAS las prendas del pedido, no solo las tuyas. Si
    // se comparara contra `mias`, el 5599 (2 de sublimación + 1 de bordado) le
    // diría a David "llegaron 2 de 3" y le pintaría el botón para siempre — el
    // falso positivo que detectó Rodrigo el 19-ago.
    //
    // Comparando antes: si llegaron todas las del pedido, las de su área también.
    const llegaron = (p.prendas || []).length
    const totalPrendas = p.total_prendas?.[0]?.count ?? null
    const completoPedido = esCompleta({ recibidas: llegaron, total: totalPrendas })

    const mias = (p.prendas || []).filter((d) => prendaEsDelUsuario(d.area, suyas))
    // Un pedido sin prendas de su área NO es suyo: se excluye acá, en el servidor.
    // ⚠️ Esto NO es el `.filter(items.length > 0)` que se quita de la pantalla.
    // Aquel escondía pedidos cuyas prendas no habían LLEGADO; este excluye pedidos
    // cuyas prendas son de OTRA área. Ver §4.1 del spec.
    if (mias.length === 0) continue
    prendas += mias.length
    pedidos.push({
      PEDIDO_ID: p.pedido_id,
      TIENDA_ID: p.tienda_id ?? '',
      FECHA_PEDIDO: p.fecha_pedido ?? '',
      FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
      DIRECCION_PEDIDO: p.direccion_pedido ?? '',
      DIRECCION_TEXTO: p.direccion_pedido ?? '',
      CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
      CLIENTE_CEDULA: p.clientes?.cedula ?? '',
      CLIENTE_CELULAR: p.clientes?.celular ?? '',
      ESTADO_PEDIDO: 'EN_FABRICA',
      // Para el botón: si no cuadran, a este pedido le faltan prendas.
      PRENDAS_LLEGARON: llegaron,
      PRENDAS_TOTAL: totalPrendas,
      COMPLETO: completoPedido,
      items: mias.map(aPrenda),
    })
  }

  const incompletos = pedidos.filter((p) => !p.COMPLETO).length
  return {
    pedidos,
    meta: { pedidos: pedidos.length, prendas, completo, pedidosIncompletos: incompletos },
  }
}
```

- [ ] **Step 2: Comprobar que compila**

```bash
npx next build
```

Esperado: build limpio. (Si falla por el import relativo de `areas-usuario.js`,
recuerda que en `lib/db/` la ruta es `../areas-usuario.js`.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/produccion.js
git commit -m "feat(produccion): consulta acotada, el join lo hace Postgres"
```

---

## Task 6: `GET /api/produccion` — identidad y aviso

**Files:**
- Create: `app/api/produccion/route.js`

**Interfaces:**
- Consumes: `listBandejaProduccion` (Task 5) · `sesionActual` y `getUsuarioById`
  (ya existen en `lib/auth.js` y `lib/db/usuarios.js`) · `registrarEvento` (`lib/eventos.js`)
- Produces: `GET /api/produccion` → `{ pedidos, meta }`. Lo consume la pantalla (Task 7).

- [ ] **Step 1: Escribir la ruta**

```js
// app/api/produccion/route.js
export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { listBandejaProduccion } from '@/lib/db/produccion'
import { registrarEvento } from '@/lib/eventos'
import { getSupabase } from '@/lib/supabase'

// La bandeja de PRODUCCIÓN.
//
// NO recibe parámetros. Nada de `?rol=ADMIN` ni `?area=`: la identidad sale de la
// COOKIE FIRMADA y el usuario se relee de la base. Antes la pantalla mandaba
// `?rol=ADMIN` y el servidor obedecía, así que cualquiera con sesión podía pedir
// todos los pedidos con nombres, cédulas y montos.

/**
 * Avisa que la lectura vino incompleta. Como mucho UN aviso por hora y fuente:
 * si cada carga de cada operario mandara un Telegram serían cien al día y
 * dejarían de leerse. Y nunca "por flanco": eso da un aviso en toda la vida.
 */
async function avisarSiHaceFalta(meta) {
  // Dos motivos: faltan pedidos enteros, o a algún pedido le faltan prendas.
  if (meta.completo && !meta.pedidosIncompletos) return
  try {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data } = await getSupabase()
      .from('eventos_sistema')
      .select('id')
      .eq('fuente', 'supabase')
      .eq('nivel', 'error')
      .gte('fecha', haceUnaHora)
      .ilike('mensaje', 'La bandeja de PRODUCCION%')
      .limit(1)
    if (data && data.length > 0) return   // ya se avisó en esta hora
  } catch (e) {
    console.error('avisarSiHaceFalta: no se pudo comprobar el enfriamiento:', e?.message || e)
    // Si no se puede comprobar, se avisa igual: mejor un aviso de más que ninguno.
  }

  // CON await: en serverless la instancia se congela al responder y el evento se
  // pierde justo cuando había algo que registrar.
  const motivo = !meta.completo
    ? `llegaron ${meta.pedidos} pedido(s) y la base dice que hay mas`
    : `${meta.pedidosIncompletos} pedido(s) llegaron sin todas sus prendas`
  await registrarEvento({
    fuente: 'supabase',
    nivel: 'error',
    mensaje: `La bandeja de PRODUCCION se leyo INCOMPLETA: ${motivo}. Lo que falte no se esta viendo en el taller.`,
  })
}

export async function GET() {
  try {
    const sesion = await sesionActual()
    if (!sesion?.id) {
      return Response.json({ error: 'No autenticado' }, { status: 401 })
    }
    const usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })

    const { pedidos, meta } = await listBandejaProduccion(usuario)
    await avisarSiHaceFalta(meta)

    return Response.json({ pedidos, meta })
  } catch (e) {
    console.error('GET /api/produccion:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `La bandeja de PRODUCCION fallo al cargar: ${e.message}`,
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Comprobar el control negativo — sin sesión no entra**

```bash
npx next build && npx next start &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/produccion
```

Esperado: **401**. Si devuelve 200 sin cookie, la ruta está abierta: **PARA**.

- [ ] **Step 3: Commit**

```bash
git add app/api/produccion/route.js
git commit -m "feat(produccion): endpoint propio, la identidad sale de la cookie y no de la url"
```

---

## Task 7: La pantalla — cuatro estados y fuera el filtro que escondía

**Files:**
- Modify: `app/dashboard/produccion/page.js`
- Test: `tests/bandeja-sin-filtro-oculto.test.js`

**Interfaces:**
- Consumes: `GET /api/produccion` (Task 6) · `estadoBandeja` (Task 4)

- [ ] **Step 1: Escribir la prueba de fuente que falla**

```js
// tests/bandeja-sin-filtro-oculto.test.js
//
// Prueba de FUENTE, no de render: montar el componente pediría todo el bundler de
// Next. Lo que vigila es barato y concreto — que nadie reponga el filtro que
// escondía los pedidos ni vuelva a pedir la lista completa con `?rol=ADMIN`.
//
// Ese filtro (`.filter(p => p.itemsFiltrados.length > 0)`) borraba por igual dos
// casos opuestos: "este pedido no tiene prendas PARA TI" (correcto) y "a este
// pedido no le LLEGARON las prendas" (el bug). 21 pedidos invisibles, 14 días.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/dashboard/produccion/page.js', import.meta.url), 'utf8')

test('la bandeja pide su endpoint propio, no la lista completa', () => {
  assert.ok(src.includes("'/api/produccion'"), 'debe llamar a /api/produccion')
  assert.ok(!src.includes('/api/pedidos?rol=ADMIN'),
    'no debe volver a pedir la lista completa mandando el rol por la url')
})

test('no vuelve el filtro que escondia pedidos sin prendas', () => {
  assert.ok(!/itemsFiltrados\.length\s*>\s*0/.test(src),
    'el filtro por cantidad de prendas lo hace el servidor; en la pantalla escondia fallos')
})

test('mira res.ok antes de creerle a la respuesta', () => {
  assert.ok(/res\.ok/.test(src), 'sin mirar res.ok, un 401 o un 500 acaban en "todo al dia"')
})

test('usa estadoBandeja para decidir que pinta', () => {
  assert.ok(src.includes('estadoBandeja'), 'la decision vive en lib/bandeja-estado.js, probada aparte')
})

test('no quedan reintentos silenciosos', () => {
  assert.ok(!/intentos\s*<\s*3/.test(src),
    'los 3 reintentos convertian un fallo en una espera y despues en "todo al dia"')
})

test('se refresca al volver a la pestaña', () => {
  assert.ok(/visibilitychange/.test(src), 'decision de Rodrigo: refresco al volver a la pestaña')
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test tests/bandeja-sin-filtro-oculto.test.js
```

Esperado: FALLA en varias — la pantalla todavía es la vieja.

- [ ] **Step 3: Cambiar la carga**

En `app/dashboard/produccion/page.js`, reemplaza `loadItems` entero por:

```js
  const [estado, setEstado] = useState('CARGANDO')   // CARGANDO|ERROR|INCOMPLETO|VACIO|LISTA
  const [errorTexto, setErrorTexto] = useState('')
  const [meta, setMeta] = useState({ pedidos: 0, prendas: 0, completo: true })

  const loadItems = useCallback(async () => {
    setEstado('CARGANDO'); setErrorTexto('')
    try {
      // El servidor ya filtra por estado y por las áreas de quien pregunta: acá
      // NO se vuelve a filtrar por EN_FABRICA, ni por área, ni por prendas.
      const res = await fetch('/api/produccion', { cache: 'no-store' })
      if (!res.ok) {
        const detalle = await res.json().catch(() => ({}))
        setErrorTexto(detalle.error || `HTTP ${res.status}`)
        setPedidos([]); setEstado('ERROR'); return
      }
      const data = await res.json()
      const lista = (data.pedidos || [])
        .sort((a, b) => {
          const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
          const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
          if (fb - fa !== 0) return fb - fa
          return (b.PEDIDO_ID || '').localeCompare(a.PEDIDO_ID || '')
        })
        .map(p => ({ ...p, itemsFiltrados: p.items || [] }))
      setPedidos(lista)
      setMeta(data.meta || { completo: false })
      setEstado(estadoBandeja({ ok: true, completo: data.meta?.completo, pedidos: lista }))
    } catch (e) {
      setErrorTexto(e?.message || 'Error de conexion')
      setPedidos([]); setEstado('ERROR')
    }
  }, [])
```

Y añade el import:

```js
import { estadoBandeja } from '@/lib/bandeja-estado'
```

⚠️ **Borra** la función `itemEsDeUsuario` y su uso: ese filtro ahora lo hace el
servidor. **Borra** el `.filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')`. **Borra**
los reintentos (`intentos < 3`).

- [ ] **Step 4: Cambiar el render de los estados**

Reemplaza el bloque `{loading ? ... : filtered.length === 0 ? ... : ...}` por:

```jsx
          {estado === 'CARGANDO' ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : estado === 'ERROR' ? (
            <div className="card p-8 text-center border-red-500/40">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="font-medium text-white">No se pudo cargar la bandeja</div>
              <div className="text-sm text-gray-500 mt-1">{errorTexto}</div>
              <div className="text-xs text-gray-600 mt-2">
                No es que no haya trabajo: es que no pudimos leerlo. Avisa si sigue pasando.
              </div>
              <button onClick={() => loadItems()} className="btn-primary text-sm px-4 py-2 mt-4">
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {estado === 'INCOMPLETO' && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 mb-4 flex items-center gap-3">
                  <span className="text-xl">🚨</span>
                  <div className="flex-1">
                    <div className="text-red-400 font-semibold text-sm">
                      Esta lista está incompleta
                    </div>
                    <div className="text-xs text-gray-400">
                      Faltan pedidos por cargar. No te fíes de lo que ves.
                    </div>
                  </div>
                  <button onClick={() => loadItems()} className="btn-secondary text-xs px-3 py-2">
                    ⟳ Recargar
                  </button>
                </div>
              )}
              {filtered.length === 0 && estado === 'VACIO' ? (
                <div className="card p-8 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <div className="font-medium text-white">¡Todo al día!</div>
                  <div className="text-sm text-gray-500 mt-1">No hay ítems pendientes en tu área</div>
                </div>
              ) : (
                <>
                  {/* aquí queda EXACTAMENTE el bloque de la lista que ya existe:
                      contador, expandir/contraer, `paginados.map(...)` y el botón
                      "Cargar más". No se toca nada de eso. */}
                </>
              )}
            </>
          )}
```

⚠️ El "¡Todo al día!" ahora exige `estado === 'VACIO'`. Si los filtros de pantalla
dejan la lista en cero pero sí había pedidos, se ve la lista vacía de los filtros,
no el mensaje de que no hay trabajo.

- [ ] **Step 5: Añadir el botón de recuperación por pedido**

Dentro del `paginados.map(pedido => ...)`, justo después del `<Link>` del
`PEDIDO_ID`, añade:

```jsx
                          {pedido.COMPLETO === false && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                const r = await fetch(`/api/pedidos/${pedido.PEDIDO_ID}`)
                                if (!r.ok) return
                                const d = await r.json()
                                const todas = d.pedido?.items || []
                                setPedidos(prev => prev.map(x => x.PEDIDO_ID === pedido.PEDIDO_ID
                                  ? { ...x, itemsFiltrados: todas, PRENDAS_LLEGARON: todas.length, COMPLETO: true }
                                  : x))
                              }}
                              className="badge bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30">
                              ⟳ Cargar las {Math.max(0, (pedido.PRENDAS_TOTAL ?? 0) - (pedido.PRENDAS_LLEGARON ?? 0))} prendas que faltan
                            </button>
                          )}
```

⚠️ La condición es `COMPLETO === false`, **nunca** `itemsFiltrados.length === 0`.
Un pedido puede tener cero prendas *de tu área* estando perfectamente completo — de
los 63 en fábrica, 22 no tienen ninguna de David. Confundir las dos cosas pinta el
botón en 22 pedidos que no tienen nada roto.

`/api/pedidos/{id}` trae **un solo pedido**, así que sus prendas no pueden
truncarse: el tope se aplica por recurso anidado y ahí hay un pedido con sus 3
prendas, no 654 con 1261.

- [ ] **Step 6: Correr las pruebas**

```bash
node --test tests/bandeja-sin-filtro-oculto.test.js
```

Esperado: pasan todas menos la del `visibilitychange` (es la Task 8).

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/produccion/page.js tests/bandeja-sin-filtro-oculto.test.js
git commit -m "feat(produccion): cuatro estados en la bandeja; se acabo el 'todo al dia' cuando falla"
```

---

## Task 8: Refresco al volver a la pestaña

**Files:**
- Modify: `app/dashboard/produccion/page.js`

- [ ] **Step 1: Añadir el efecto**

Junto a los demás `useEffect` de `ProduccionPage`:

```js
  // Refresco al volver a la pestaña (decisión de Rodrigo, 19-ago-2026).
  //
  // La bandeja cargaba UNA sola vez al abrirse: quien la dejaba abierta toda la
  // mañana no veía nada de lo que iba entrando. El taller mira el móvil a ratos,
  // así que el momento en que importa refrescar es justo cuando vuelve.
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible') loadItems()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [loadItems])
```

- [ ] **Step 2: Correr las pruebas**

```bash
node --test tests/bandeja-sin-filtro-oculto.test.js
```

Esperado: PASS, las 6.

- [ ] **Step 3: Correr la suite completa**

```bash
npm test
```

Esperado: **151 pruebas** (124 anteriores + 11 + 10 + 6), 0 fallos.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/produccion/page.js
git commit -m "feat(produccion): refrescar la bandeja al volver a la pestaña"
```

---

## Task 9: Reconciliación y control negativo

La prueba que habría cazado esto el 4-ago, y la que comprueba que la alarma suena.

**Files:**
- Create: `scripts/test-bandeja-produccion.mjs`

- [ ] **Step 1: Escribir el script**

```js
// scripts/test-bandeja-produccion.mjs
//
// DOS comprobaciones sobre la bandeja de Producción, contra la base real. Solo lee.
//
//   1. RECONCILIACIÓN: lo que devuelve la consulta tiene que coincidir, pedido a
//      pedido, con una consulta SQL de referencia escrita aparte. Es la prueba que
//      NO existía y que habría cazado los 21 pedidos invisibles el 4-ago-2026.
//
//   2. CONTROL NEGATIVO: se fuerza una lectura truncada y se comprueba que
//      `completo` se pone en false. Del propio repo: "una alarma que nunca se
//      prueba es una alarma que no tienes".
//
// USO: node scripts/test-bandeja-produccion.mjs
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
const sb = createClient(limpio(process.env.SUPABASE_URL), limpio(process.env.SUPABASE_SERVICE_ROLE_KEY), {
  db: { schema: 'crm' },
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (i, init) => fetch(i, { ...init, cache: 'no-store' }) },
})

let fallos = 0
const ok = (cond, msg) => { console.log(`   ${cond ? '✓' : '✕'} ${msg}`); if (!cond) fallos++ }

// ── 1. Reconciliación, con las áreas de David ────────────────────────────────
console.log('\n── 1. Reconciliación (David: SUBLIMACION + ESTAMPADO) ──')
const suyas = areasDeUsuario('DISEÑO', ['SUBLIMACION', 'ESTAMPADO'])

const { data: filas, count } = await sb
  .from('pedidos')
  .select('pedido_id, prendas_en_taller(item_id, area)', { count: 'exact' })
  .eq('estado_pedido', 'EN_FABRICA')

const dePantalla = new Map()
for (const p of filas || []) {
  const mias = (p.prendas_en_taller || []).filter((d) => prendaEsDelUsuario(d.area, suyas))
  if (mias.length) dePantalla.set(p.pedido_id, mias.length)
}

// La referencia se construye por OTRO camino a propósito: leyendo detalle_pedido
// en plano (sin la vista y sin el anidado). Si las dos coinciden, es que el join
// anidado y la vista no se están comiendo nada.
const { data: crudas } = await sb
  .from('detalle_pedido')
  .select('pedido_id, area, subestado, eliminado, pedidos!inner(estado_pedido)')
  .eq('eliminado', false)
  .eq('pedidos.estado_pedido', 'EN_FABRICA')

const deSql = new Map()
for (const d of crudas || []) {
  if (d.subestado === 'ELIMINADO' || d.subestado === 'ENTREGADO_TIENDA') continue
  if (!prendaEsDelUsuario(d.area, suyas)) continue
  deSql.set(d.pedido_id, (deSql.get(d.pedido_id) || 0) + 1)
}

ok(dePantalla.size === deSql.size,
   `mismos pedidos: bandeja ${dePantalla.size} · SQL ${deSql.size}`)
const descuadres = [...deSql].filter(([id, n]) => dePantalla.get(id) !== n)
ok(descuadres.length === 0,
   `mismas prendas por pedido${descuadres.length ? ` — descuadran: ${descuadres.slice(0,5).map(([i,n]) => `${i} (SQL ${n}, bandeja ${dePantalla.get(i) ?? 0})`).join(', ')}` : ''}`)
ok(esCompleta({ recibidas: (filas || []).length, total: count }),
   `la lectura vino completa: ${(filas || []).length} de ${count}`)

// ── 2. Control negativo: forzar el truncamiento ──────────────────────────────
console.log('\n── 2. Control negativo (lectura limitada a 5 a propósito) ──')
const { data: cortada, count: totalReal } = await sb
  .from('pedidos').select('pedido_id', { count: 'exact' })
  .eq('estado_pedido', 'EN_FABRICA').limit(5)

const detectado = !esCompleta({ recibidas: (cortada || []).length, total: totalReal })
ok(detectado, `una lectura de 5 sobre ${totalReal} se detecta como INCOMPLETA`)
ok(totalReal > 5, 'hay suficientes pedidos para que la prueba signifique algo')

console.log(fallos === 0 ? '\n✓ TODO BIEN\n' : `\n✕ ${fallos} FALLO(S)\n`)
process.exit(fallos === 0 ? 0 : 1)
```

- [ ] **Step 2: Correrlo**

```bash
node scripts/test-bandeja-produccion.mjs
```

Esperado: `✓ TODO BIEN`. Si el punto 2 no detecta la lectura corta, la alarma no
funciona: **PARA**, no sirve de nada desplegar una alarma muda.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-bandeja-produccion.mjs
git commit -m "test(produccion): reconciliacion contra SQL y control negativo de la alarma"
```

---

## Task 10: Verificación por la puerta real

Nada de esto vale si no se comprueba donde duele: con la cuenta de David, en el
dominio real. Un despliegue verde no prueba que tu código esté arriba.

- [ ] **Step 1: Confirmar que lo que hay en `main` es lo que se subió**

```bash
git status -sb
git log --oneline -8
git push origin main
```

- [ ] **Step 2: Confirmar que el dominio sirve ESE commit**

```bash
vercel ls --prod
```

Comprueba que el despliegue `● Ready` corresponde al SHA que acabas de subir **y**
que el alias `crm.apps.mandarinaec.com` apunta a él. Un redespliegue de código
viejo también se ve `● Ready`: ya pasó con el botón de factura, que estuvo 9 días
construido y sin subir.

- [ ] **Step 3: Abrir la bandeja con la cuenta de David**

Entra a `https://crm.apps.mandarinaec.com/dashboard/produccion` **con el usuario de
David**, no con un ADMIN. Verificar con el rol equivocado no prueba nada.

Comprobar:
- Aparece `MAN-AND-5599` con sus 2 camisetas de sublimación (Goku y Vegeta).
- El número de pedidos coincide con `node scripts/test-bandeja-produccion.mjs`.
- No hay franja roja.
- Cambiar de pestaña y volver refresca la lista.

- [ ] **Step 4: Anotar el resultado en el plan**

Añade al final de este archivo:

```markdown
## Verificado en producción

- **Fecha:** …
- **Commit desplegado:** …
- **Con la cuenta de:** David
- **Pedidos que vio:** N (SQL decía N)
- **5599 visible:** sí / no
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-19-bandeja-produccion.md
git commit -m "docs(produccion): verificado en produccion con la cuenta del taller"
```

---

## Qué NO entra en este plan

Queda para después, con el mismo patrón por familias (§3 del spec):

- Colas de trabajo: **Corte, Impresión, Despacho**.
- Archivo: **Historial** (paginación + búsqueda en la base). ⚠️ Urgente por su
  cuenta: `crm.pedidos` va por 658 de 1000 y al cruzarlo dejará de encontrar
  pedidos viejos al buscarlos.
- Agregados: **Tablero, Inicio, Calendario**.
- El **peaje de corte** del tablero (columna Producción en cero).
- La fuga de `/api/clientes?all=1` y el `?rol=ADMIN` de `/api/pedidos`.
