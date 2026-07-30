# Tablero de pauta — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea.
> Los pasos usan casillas (`- [ ]`) para llevar el control.

**Objetivo:** un tablero solo-ADMIN en `/dashboard/pauta` que cruce el gasto de
Meta, los mensajes del inbox y las ventas del CRM hasta el nivel de cada arte,
separado por INDSTORE y MANDARINA REPUBLIC.

**Arquitectura:** híbrida. El gasto se baja de la Marketing API una vez al día a
`crm.pauta_dia` (más un refresco de los últimos 3 días). El embudo se calcula en
vivo con una función SQL que cruza `inbox.mensajes` con `crm.pedidos`. La API
aplica `requireAdmin`; la pantalla solo pinta.

**Stack:** Next.js 14 (App Router), Supabase (`@supabase/supabase-js`), Meta
Graph API v21.0, Tailwind. Sin framework de pruebas: scripts `.mjs` con node.

**Diseño:** `docs/superpowers/specs/2026-07-30-tablero-pauta-design.md`

## Restricciones globales

- **Español ecuatoriano con TUTEO** en todo texto visible, comentarios y commits.
  Nada de voseo (`vos`, `podés`, `cargás`). Se dice `tú`, `puedes`, `cargas`.
- **Rama `main` siempre.** No crear ramas.
- **NUNCA `git add -A` ni `git add .` en este repo** — hay trabajo del usuario sin
  commitear. Agregar siempre archivos por nombre.
- **Fecha piso de datos de pauta: `2026-07-13`.** Antes de esa fecha no se
  capturaba `referral`. Nunca mostrar ceros ahí; mostrar el aviso.
- **Ventana de atribución: 30 días.** Umbrales del embudo: respondió ≥ 2 mensajes
  entrantes, conversó ≥ 3.
- **Cuando falte el dato, decirlo.** `⚠ sin gasto` nunca `$0`; `—` nunca `0,00x`.
- Todo `lib/pauta/*` y `lib/metaAds.js` es **server-only**: llevan el guard
  `if (typeof window !== 'undefined') throw`.
- Fechas con los helpers de `lib/parseFecha.js` (`hoyEcuador`, `fechaISOEcuador`,
  `inicioDiaEcuador`, `finDiaEcuador`). Nunca recortar un ISO a mano.
- Supabase: proyecto `piingkecjgoisnxccvaa` (mandarina-DATA).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/pauta/constantes.js` | Umbrales, fecha piso, ventana, mapeo cuenta↔tienda |
| `lib/pauta/atribucion.js` | Lógica pura y testeable. No sabe de HTTP ni de base |
| `lib/pauta/meta.js` | Lee la Marketing API. No sabe de atribución |
| `lib/pauta/consultas.js` | Lee Supabase (`crm.pauta_dia` + la función del embudo) |
| `lib/pauta/tablero.js` | Une gasto + embudo y arma la respuesta de la API |
| `app/api/cron/pauta/route.js` | Cron diario |
| `app/api/pauta/route.js` | Sirve el tablero, con `requireAdmin` |
| `app/dashboard/pauta/page.js` | La pantalla |
| `app/dashboard/pauta/Tabla.jsx` | Tabla desplegable + ficha del arte |
| `scripts/pauta-descubrir-cuentas.mjs` | Herramienta única para la Tarea 1 |
| `scripts/test-pauta.mjs` | Pruebas de `atribucion.js` |
| `scripts/sql/2026-07-30-pauta.sql` | Migración |

---

## Tarea 1: Descubrir de qué cuenta publicitaria sale cada anuncio

**Por qué es la primera:** el anuncio `120249663261930600` ("Status ad") trajo 368
conversaciones a IND desde el 13-jul y **no aparece** en la cuenta `1500806130455765`
(IndStore). Hay 16 cuentas publicitarias con nombres repetidos. Sin este mapeo, el
mejor anuncio del negocio saldría con gasto $0 y ROAS infinito.

**Archivos:**
- Crear: `docs/superpowers/specs/2026-07-30-mapeo-cuentas-pauta.md` (el resultado)

**Interfaces:**
- Produce: el contenido de la semilla de `crm.pauta_cuentas` que consume la Tarea 2.

**Cómo, decidido el 30-jul:** con las herramientas MCP de Meta y de Supabase que
ya están conectadas a la sesión, **no** con un script local. En este repo no
existe `META_ADS_TOKEN` (ni ningún token de Meta), así que un script no podría
correr. Se descartó crear `scripts/pauta-descubrir-cuentas.mjs` por eso: sería
una herramienta imposible de ejecutar.

Carga las herramientas con:

```
ToolSearch("select:mcp__claude_ai_META__ads_get_ad_accounts,mcp__claude_ai_META__ads_get_ad_entities,mcp__claude_ai_Supabase__execute_sql")
```

- [ ] **Paso 1: Sacar del inbox la lista de anuncios que hay que ubicar**

Proyecto Supabase `piingkecjgoisnxccvaa`:

```sql
select m.referral->>'source_id' as ad_id,
       m.cuenta,
       count(*) as chats,
       max(m.referral->>'headline') as titular
from inbox.mensajes m
where coalesce(m.referral->>'source_id','') <> ''
  and m.fecha >= '2026-07-13'
group by 1,2 order by 3 desc;
```

Son ~34 anuncios. El más importante es `120249663261930600` con 368 chats.

- [ ] **Paso 2: Listar las cuentas publicitarias**

`ads_get_ad_accounts`. Hay 16. Quédate solo con las que tienen
`account_status: ACTIVE` **y** `is_queryable: true` — dos están DISABLED y la
API las rechaza. Anota cuáles quedan fuera: si un anuncio vive en una cuenta
desactivada, su gasto es inalcanzable y hay que decirlo, no omitirlo.

- [ ] **Paso 3: Buscar cada anuncio en cada cuenta**

Para cada cuenta consultable, `ads_get_ad_entities` con:

```
level: "ad"
fields: ["id","name","amount_spent","impressions","campaign_id"]
time_range: {"since":"2026-07-13","until":"<hoy>"}
sort: "impressions_descending"
limit: 200
```

Cruza los `id` devueltos contra la lista del Paso 1.

**Dos trampas ya comprobadas:**

1. El filtro `filtering` con operador `IN` sobre `ad.id` **devuelve vacío**
   aunque el anuncio exista. No lo uses: trae la lista y cruza en tu cabeza.
2. Los Insights solo devuelven anuncios **con entrega en la ventana**. Si un
   anuncio no aparece, repite con `date_preset: "maximum"` antes de darlo por
   perdido.

- [ ] **Paso 4: Escribir el resultado**

Crear `docs/superpowers/specs/2026-07-30-mapeo-cuentas-pauta.md` con una tabla:

```markdown
| ad_account_id | nombre | tienda_id | moneda | anuncios del inbox |
|---|---|---|---|---|
| 1500806130455765 | IndStore | INDSTORE | USD | 12 |
| 360623391212876 | MandarinaLaBMKT | MANDARINA | USD | 13 |
```

Y una sección **"Anuncios sin cuenta"** con los que salieron `NO ENCONTRADO`, si
los hay. Esos son los que el tablero va a marcar `⚠ sin gasto`.

**Si un anuncio con muchos chats no aparece en ninguna cuenta**, no inventar el
mapeo: dejarlo documentado como sin resolver y avisar al usuario. El tablero está
diseñado para mostrar ese caso, no para taparlo.

- [ ] **Paso 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-30-mapeo-cuentas-pauta.md
git commit -m "docs(pauta): mapeo de cuentas publicitarias a tiendas"
```

---

## Tarea 2: Migración — tablas, función del embudo y semilla

**Archivos:**
- Crear: `scripts/sql/2026-07-30-pauta.sql`

**Interfaces:**
- Produce: tablas `crm.pauta_cuentas`, `crm.pauta_dia`; función
  `crm.pauta_embudo(p_desde date, p_hasta date, p_tienda text, p_ventana_dias int,
  p_min_respondio int, p_min_converso int)`; bucket `pauta-artes`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- scripts/sql/2026-07-30-pauta.sql
-- Tablero de pauta: gasto diario por anuncio + función del embudo.
-- Ver docs/superpowers/specs/2026-07-30-tablero-pauta-design.md

-- Qué cuenta publicitaria paga para qué tienda. Es tabla y no código fijo
-- porque hay 16 cuentas con nombres repetidos y esto cambia.
create table if not exists crm.pauta_cuentas (
  ad_account_id text primary key,
  nombre        text,
  tienda_id     text not null check (tienda_id in ('INDSTORE','MANDARINA')),
  moneda        text default 'USD',
  activa        boolean not null default true,
  notas         text
);

-- Foto diaria del gasto por anuncio.
-- Los nombres van desnormalizados A PROPÓSITO: renombrar una campaña en Meta
-- reescribe también el reporte de julio. Así julio dice lo que decía en julio.
create table if not exists crm.pauta_dia (
  fecha               date not null,
  ad_id               text not null,
  ad_account_id       text,
  tienda_id           text,
  campaign_id         text,
  campaign_nombre     text,
  adset_id            text,
  adset_nombre        text,
  ad_nombre           text,
  estado              text,
  gasto               numeric(12,2) default 0,
  impresiones         bigint default 0,
  clics               bigint default 0,
  conversaciones_meta bigint default 0,
  valor_meta          numeric(12,2),
  roas_meta           numeric(10,4),
  creative_id         text,
  arte_url            text,
  arte_tipo           text,
  arte_texto          text,
  arte_titular        text,
  actualizado_at      timestamptz not null default now(),
  primary key (fecha, ad_id)
);

create index if not exists pauta_dia_tienda_fecha on crm.pauta_dia (tienda_id, fecha desc);
create index if not exists pauta_dia_campaign     on crm.pauta_dia (campaign_id);

-- El embudo, calculado en vivo. Cruza inbox.mensajes con crm.pedidos.
--
-- OJO con el LEFT JOIN a pedidos: una persona con 2 pedidos aparece 2 veces, así
-- que los escalones cuentan `distinct t9`. Contar `*` inflaría "llegaron".
create or replace function crm.pauta_embudo(
  p_desde          date,
  p_hasta          date,
  p_tienda         text,
  p_ventana_dias   int default 30,
  p_min_respondio  int default 2,
  p_min_converso   int default 3
)
returns table (
  ad_id        text,
  tienda_id    text,
  llegaron     int,
  respondieron int,
  conversaron  int,
  pedidos      int,
  pagados      int,
  venta        numeric
)
language sql
stable
as $$
  with personas as (
    select
      right(regexp_replace(m.telefono, '\D', '', 'g'), 9) as t9,
      case when m.cuenta = 'IND' then 'INDSTORE' else 'MANDARINA' end as tienda_id,
      min(m.fecha) as primer_msg,
      count(*) filter (where m.direccion = 'ENTRANTE') as msgs_cliente,
      -- El ÚLTIMO anuncio que la trajo (regla R1 del diseño).
      (array_agg(m.referral->>'source_id' order by m.fecha desc)
         filter (where coalesce(m.referral->>'source_id','') <> ''))[1] as ad_id
    from inbox.mensajes m
    group by 1, 2
  ),
  elegibles as (
    select *
    from personas
    where ad_id is not null
      -- Fecha piso: antes del 13-jul-2026 no se capturaba referral.
      and primer_msg >= greatest(p_desde::timestamptz, timestamptz '2026-07-13 00:00:00-05')
      and primer_msg <  (p_hasta + 1)::timestamptz
      and tienda_id = p_tienda
  ),
  ped as (
    select right(regexp_replace(coalesce(c.celular,''), '\D', '', 'g'), 9) as t9,
           p.pedido_id, p.monto_total, p.fecha_pedido, p.estado_pago
    from crm.pedidos p
    join crm.clientes c on c.cliente_id = p.cliente_id
  )
  select
    e.ad_id,
    e.tienda_id,
    count(distinct e.t9)::int,
    count(distinct e.t9) filter (where e.msgs_cliente >= p_min_respondio)::int,
    count(distinct e.t9) filter (where e.msgs_cliente >= p_min_converso)::int,
    count(distinct ped.pedido_id)::int,
    count(distinct ped.pedido_id) filter (where ped.estado_pago ilike '%PAGADO%')::int,
    coalesce(sum(ped.monto_total), 0)
  from elegibles e
  left join ped
    on ped.t9 = e.t9
   and ped.fecha_pedido >= e.primer_msg
   and ped.fecha_pedido <  e.primer_msg + (p_ventana_dias || ' days')::interval
  group by 1, 2;
$$;
```

- [ ] **Paso 2: Aplicar la migración**

Aplicarla en Supabase (proyecto `piingkecjgoisnxccvaa`).

- [ ] **Paso 3: Verificar que la función devuelve lo medido en el diseño**

```sql
select sum(llegaron) llegaron, sum(respondieron) resp,
       sum(conversaron) conv, sum(pedidos) ped, sum(pagados) pag
from crm.pauta_embudo('2026-07-13','2026-07-30','INDSTORE');
```

Esperado, según §3.3 del diseño: `llegaron 876 · resp 511 · conv 270 · ped 9 · pag 8`.

Y para MANDARINA: `llegaron 291 · resp 198 · conv 119 · ped 3 · pag 3`.

**Si "llegaron" sale mayor a 876, el `distinct` está mal** y se está contando una
vez por pedido.

- [ ] **Paso 4: Sembrar `crm.pauta_cuentas`**

Con la tabla producida en la Tarea 1. Ejemplo (usar los valores REALES):

```sql
insert into crm.pauta_cuentas (ad_account_id, nombre, tienda_id, moneda) values
  ('1500806130455765', 'IndStore',        'INDSTORE',  'USD'),
  ('360623391212876',  'MandarinaLaBMKT', 'MANDARINA', 'USD')
on conflict (ad_account_id) do update
  set nombre = excluded.nombre, tienda_id = excluded.tienda_id;
```

- [ ] **Paso 5: Crear el bucket de artes**

Bucket `pauta-artes` en Supabase Storage, **público de lectura** (son creatividades
de anuncios, no datos de clientes), igual que `inbox-media`.

- [ ] **Paso 6: Registrar la migración y commit**

```sql
insert into public.schema_migrations (name) values ('crm_2026_07_30_pauta')
on conflict do nothing;
```

```bash
git add scripts/sql/2026-07-30-pauta.sql
git commit -m "feat(pauta): tablas de gasto y funcion SQL del embudo"
```

---

## Tarea 3: Lógica de atribución (pura y testeada)

**Archivos:**
- Crear: `lib/pauta/constantes.js`
- Crear: `lib/pauta/atribucion.js`
- Test: `scripts/test-pauta.mjs`

**Interfaces:**
- Produce:
  - `FECHA_PISO` (string `'2026-07-13'`), `VENTANA_DIAS` (30),
    `MIN_RESPONDIO` (2), `MIN_CONVERSO` (3), `TIENDAS` (array)
  - `tail9(telefono: string): string`
  - `tiendaDeCuenta(cuenta: string): string`
  - `dentroDeVentana(primerContacto: string|Date, fechaPedido: string|Date, dias: number): boolean`
  - `ultimoAnuncioAntesDe(referrals: {adId,fecha}[], fechaPedido: string|Date|null): string|null`
  - `roasDe(venta: number, gasto: number): number|null`
  - `brechaRoas(roasMeta: number|null, roasCrm: number|null): number|null`
  - `recortarFechaPiso(desde: string): string`

- [ ] **Paso 1: Escribir la prueba que falla**

```js
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
  assert.equal(dentroDeVentana('2026-07-01T10:00:00Z', '2026-07-20T10:00:00Z', 30), true)
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
```

- [ ] **Paso 2: Correrla para verificar que falla**

```bash
node scripts/test-pauta.mjs
```

Esperado: FALLA con `Cannot find module '../lib/pauta/atribucion.js'`.

- [ ] **Paso 3: Escribir las constantes**

```js
// lib/pauta/constantes.js
// Los números que gobiernan el tablero, en un solo lugar para poder moverlos
// sin tocar la lógica.

/**
 * Antes del 13-jul-2026 el webhook NO guardaba `referral`, así que no hay
 * historia de pauta anterior. El tablero no muestra ceros ahí: muestra el aviso.
 */
export const FECHA_PISO = '2026-07-13'

/** Días desde el primer contacto en los que un pedido todavía cuenta como de ese anuncio. */
export const VENTANA_DIAS = 30

/** Mensajes ENTRANTES para considerar que la persona respondió / conversó. */
export const MIN_RESPONDIO = 2
export const MIN_CONVERSO = 3

/** Las dos tiendas que pautean. YAW no pautea y queda fuera a propósito. */
export const TIENDAS = [
  { id: 'INDSTORE',  nombre: 'IND STORE',          cuentaInbox: 'IND' },
  { id: 'MANDARINA', nombre: 'Mandarina Republic', cuentaInbox: 'MANDI' },
]
```

- [ ] **Paso 4: Escribir la implementación**

```js
// lib/pauta/atribucion.js
// Lógica pura del tablero de pauta: no sabe de HTTP ni de base de datos, así
// que se prueba entera sin levantar nada (scripts/test-pauta.mjs).

import { FECHA_PISO, TIENDAS } from './constantes.js'

/**
 * Teléfono → últimos 9 dígitos. El CRM guarda 09xxxxxxxx y el inbox
 * 593xxxxxxxxx; el sufijo de 9 emparejan ambos. Mismo criterio que
 * lib/inbox-supabase.js, que ya lo usa para el chat dentro del pedido.
 */
export function tail9(telefono) {
  return String(telefono || '').replace(/\D/g, '').replace(/^593/, '').replace(/^0+/, '').slice(-9)
}

/** Cuenta del inbox ('IND'|'MANDI') → tienda del CRM ('INDSTORE'|'MANDARINA'). */
export function tiendaDeCuenta(cuenta) {
  return TIENDAS.find((t) => t.cuentaInbox === cuenta)?.id || null
}

/**
 * ¿El pedido cae dentro de la ventana de atribución?
 * Un pedido ANTERIOR al primer contacto no cuenta: ese cliente ya compraba
 * antes de ver el anuncio y no es mérito de la pauta.
 */
export function dentroDeVentana(primerContacto, fechaPedido, dias) {
  const inicio = new Date(primerContacto).getTime()
  const pedido = new Date(fechaPedido).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(pedido)) return false
  if (pedido < inicio) return false
  return pedido - inicio < dias * 24 * 60 * 60 * 1000
}

/**
 * Regla R1: de qué anuncio es la persona. Si llegó por varios, gana el ÚLTIMO
 * anterior al pedido — mismo criterio que Meta, para que las dos columnas de
 * ROAS sean comparables. Sin pedido, gana el más reciente.
 */
export function ultimoAnuncioAntesDe(referrals, fechaPedido) {
  if (!Array.isArray(referrals) || referrals.length === 0) return null
  const tope = fechaPedido ? new Date(fechaPedido).getTime() : Infinity
  const candidatos = referrals
    .filter((r) => r?.adId && new Date(r.fecha).getTime() <= tope)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  return candidatos[0]?.adId ?? null
}

/**
 * ROAS = venta ÷ gasto. Devuelve null si no hay gasto conocido.
 * NUNCA Infinity: un anuncio sin gasto mapeado daría ROAS infinito y la
 * pantalla mentiría justo donde más caro sale creerle.
 */
export function roasDe(venta, gasto) {
  const g = Number(gasto)
  if (!Number.isFinite(g) || g <= 0) return null
  return Number(venta || 0) / g
}

/**
 * Cuánto se aleja lo verificable de lo que promete Meta, como fracción.
 * -0,75 = el CRM solo ve el 25% de lo que Meta atribuye.
 */
export function brechaRoas(roasMeta, roasCrm) {
  if (roasMeta == null || roasCrm == null) return null
  if (!Number.isFinite(roasMeta) || roasMeta <= 0) return null
  return (roasCrm - roasMeta) / roasMeta
}

/** Ninguna consulta puede pedir datos de pauta anteriores al piso. */
export function recortarFechaPiso(desde) {
  return !desde || desde < FECHA_PISO ? FECHA_PISO : desde
}
```

- [ ] **Paso 5: Correr las pruebas**

```bash
node scripts/test-pauta.mjs
```

Esperado: todas pasan, `15 pruebas pasadas`.

- [ ] **Paso 6: Commit**

```bash
git add lib/pauta/constantes.js lib/pauta/atribucion.js scripts/test-pauta.mjs
git commit -m "feat(pauta): logica de atribucion con pruebas"
```

---

## Tarea 4: Lectura de la Marketing API

**Archivos:**
- Crear: `lib/pauta/meta.js`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: `traerGastoDiario({ adAccountId, desde, hasta }): Promise<Fila[]>` donde
  `Fila = { fecha, adId, adNombre, adsetId, adsetNombre, campaignId, campaignNombre,
  estado, gasto, impresiones, clics, conversaciones, valorMeta, roasMeta, creativeId }`

- [ ] **Paso 1: Escribir el módulo**

```js
// lib/pauta/meta.js
// Lectura de la Marketing API de Meta (Insights a nivel de anuncio).
//
// Es el hermano de lib/metaCapi.js: aquel ESCRIBE eventos de compra, este LEE
// el gasto. Se mantienen separados porque usan tokens y permisos distintos:
// CAPI necesita permisos de dataset, esto necesita `ads_read`.

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/meta.js es server-only: nunca lo importes en el navegador.')
}

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * El token, limpio. Si se carga a Vercel desde PowerShell le queda un BOM
 * invisible al inicio y Meta responde 400 sin explicar por qué. Mismo tratamiento
 * que middleware.js le da a CRM_API_TOKEN.
 */
function token() {
  const t = String(process.env.META_ADS_TOKEN || '').replace(/[^\x21-\x7E]/g, '')
  if (!t) throw new Error('Falta META_ADS_TOKEN')
  return t
}

/** Meta devuelve las acciones como lista de {action_type, value}. Esto busca una. */
function accion(lista, tipo) {
  const found = (lista || []).find((a) => a.action_type === tipo)
  return found ? Number(found.value) : 0
}

/**
 * Gasto e Insights por anuncio y por día.
 *
 * `time_increment: 1` hace que Meta devuelva UNA fila por día por anuncio, que es
 * exactamente la llave de crm.pauta_dia.
 */
export async function traerGastoDiario({ adAccountId, desde, hasta }) {
  const url = new URL(`${GRAPH}/act_${adAccountId}/insights`)
  url.searchParams.set('access_token', token())
  url.searchParams.set('level', 'ad')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since: desde, until: hasta }))
  url.searchParams.set('limit', '500')
  url.searchParams.set('fields', [
    'date_start', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
    'campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks',
    'actions', 'action_values', 'purchase_roas',
  ].join(','))

  const filas = []
  let siguiente = url.toString()

  while (siguiente) {
    const r = await fetch(siguiente)
    const j = await r.json()
    if (j.error) throw new Error(`Insights de act_${adAccountId}: ${j.error.message}`)

    for (const d of j.data || []) {
      filas.push({
        fecha: d.date_start,
        adId: d.ad_id,
        adNombre: d.ad_name || '',
        adsetId: d.adset_id || '',
        adsetNombre: d.adset_name || '',
        campaignId: d.campaign_id || '',
        campaignNombre: d.campaign_name || '',
        gasto: Number(d.spend || 0),
        impresiones: Number(d.impressions || 0),
        clics: Number(d.clicks || 0),
        // Las conversaciones de WhatsApp iniciadas: el "lead" según Meta.
        conversaciones: accion(d.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        valorMeta: accion(d.action_values, 'omni_purchase') || null,
        roasMeta: d.purchase_roas?.[0]?.value ? Number(d.purchase_roas[0].value) : null,
      })
    }
    siguiente = j.paging?.next || null
  }

  return filas
}

/**
 * Estado y creatividad de un anuncio. Va aparte de los Insights porque son
 * atributos, no métricas, y no cambian por día.
 */
export async function traerDetalleAnuncios(adAccountId, adIds) {
  if (!adIds?.length) return new Map()
  const url = new URL(`${GRAPH}/act_${adAccountId}/ads`)
  url.searchParams.set('access_token', token())
  url.searchParams.set('limit', '500')
  url.searchParams.set('fields', 'id,name,effective_status,creative{id,thumbnail_url}')

  const porId = new Map()
  let siguiente = url.toString()
  while (siguiente) {
    const r = await fetch(siguiente)
    const j = await r.json()
    if (j.error) throw new Error(`Anuncios de act_${adAccountId}: ${j.error.message}`)
    for (const a of j.data || []) {
      if (!adIds.includes(a.id)) continue
      porId.set(a.id, {
        estado: a.effective_status || '',
        creativeId: a.creative?.id || '',
        thumbnailUrl: a.creative?.thumbnail_url || '',
      })
    }
    siguiente = j.paging?.next || null
  }
  return porId
}
```

- [ ] **Paso 2: Probarlo contra la API real**

```bash
node -e "
import('./lib/pauta/meta.js').then(async (m) => {
  const filas = await m.traerGastoDiario({
    adAccountId: '1500806130455765', desde: '2026-07-20', hasta: '2026-07-25',
  })
  console.log(filas.length, 'filas')
  console.log(filas.slice(0, 3))
})"
```

Esperado: filas con `fecha`, `adId` y `gasto`. Una fila por anuncio por día.

- [ ] **Paso 3: Commit**

```bash
git add lib/pauta/meta.js
git commit -m "feat(pauta): lectura del gasto desde la Marketing API"
```

---

## Tarea 5: Cron diario que baja el gasto

**Archivos:**
- Crear: `app/api/cron/pauta/route.js`
- Modificar: `middleware.js` (agregar la ruta a `RUTAS_PUBLICAS`)
- Modificar: `vercel.json` (agregar el cron)

**Interfaces:**
- Consume: `traerGastoDiario`, `traerDetalleAnuncios` de `lib/pauta/meta.js`;
  la tabla `crm.pauta_cuentas`.
- Produce: filas en `crm.pauta_dia`.

- [ ] **Paso 1: Escribir la ruta del cron**

```js
// app/api/cron/pauta/route.js
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getSupabase } from '@/lib/supabase'
import { registrarEvento } from '@/lib/eventos'
import { traerGastoDiario, traerDetalleAnuncios } from '@/lib/pauta/meta'
import { hoyEcuador } from '@/lib/parseFecha'

// Baja el gasto de Meta a crm.pauta_dia.
//
// Refresca los últimos DIAS_REFRESCO días, no solo ayer: Meta sigue ajustando
// las cifras recientes durante ~3 días. Bajar solo el último día dejaría los
// anteriores congelados con datos provisionales.
const DIAS_REFRESCO = 3

// Mismo patrón que /api/shopify/sync: el cron de Vercel manda
// Authorization: Bearer $CRON_SECRET. Sin CRON_SECRET se permite (dev).
function autorizado(req) {
  const secreto = String(process.env.CRON_SECRET || '').replace(/[^\x21-\x7E]/g, '')
  if (!secreto) return true
  const cabecera = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  return cabecera === `Bearer ${secreto}` || url.searchParams.get('secret') === secreto
}

function haceDias(n) {
  const d = new Date(`${hoyEcuador()}T00:00:00-05:00`)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

async function correr() {
  const sb = getSupabase()
  const { data: cuentas, error } = await sb
    .from('pauta_cuentas').select('*').eq('activa', true)
  if (error) throw new Error(`No se pudo leer pauta_cuentas: ${error.message}`)
  if (!cuentas?.length) throw new Error('crm.pauta_cuentas está vacía: corre primero la Tarea 1')

  const desde = haceDias(DIAS_REFRESCO)
  const hasta = hoyEcuador()
  const resumen = { desde, hasta, cuentas: [], filas: 0, errores: [] }

  for (const c of cuentas) {
    try {
      const filas = await traerGastoDiario({ adAccountId: c.ad_account_id, desde, hasta })
      const adIds = [...new Set(filas.map((f) => f.adId))]
      const detalle = await traerDetalleAnuncios(c.ad_account_id, adIds)

      const registros = filas.map((f) => ({
        fecha: f.fecha,
        ad_id: f.adId,
        ad_account_id: c.ad_account_id,
        tienda_id: c.tienda_id,
        campaign_id: f.campaignId,
        campaign_nombre: f.campaignNombre,
        adset_id: f.adsetId,
        adset_nombre: f.adsetNombre,
        ad_nombre: f.adNombre,
        estado: detalle.get(f.adId)?.estado || '',
        gasto: f.gasto,
        impresiones: f.impresiones,
        clics: f.clics,
        conversaciones_meta: f.conversaciones,
        valor_meta: f.valorMeta,
        roas_meta: f.roasMeta,
        creative_id: detalle.get(f.adId)?.creativeId || '',
        actualizado_at: new Date().toISOString(),
      }))

      if (registros.length) {
        // upsert por (fecha, ad_id): volver a correr el cron el mismo día
        // corrige las cifras en vez de duplicarlas.
        const { error: e2 } = await sb
          .from('pauta_dia').upsert(registros, { onConflict: 'fecha,ad_id' })
        if (e2) throw new Error(e2.message)
      }

      resumen.cuentas.push({ cuenta: c.nombre, tienda: c.tienda_id, filas: registros.length })
      resumen.filas += registros.length
    } catch (e) {
      // Una cuenta que falla no debe dejar sin actualizar a las demás.
      resumen.errores.push({ cuenta: c.nombre, error: e.message })
      await registrarEvento({
        fuente: 'meta',
        nivel: 'error',
        mensaje: `Cron de pauta: falló la cuenta ${c.nombre}`,
        detalle: { adAccountId: c.ad_account_id, error: e.message },
      })
    }
  }

  return resumen
}

export async function GET(req) {
  if (!autorizado(req)) return Response.json({ error: 'no autorizado' }, { status: 401 })
  try {
    return Response.json(await correr())
  } catch (e) {
    await registrarEvento({ fuente: 'meta', nivel: 'error', mensaje: `Cron de pauta: ${e.message}` })
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
}
```

- [ ] **Paso 2: Dejar pasar la ruta por el middleware**

En `middleware.js`, dentro de `RUTAS_PUBLICAS`, después de `/api/shopify/sync`:

```js
  '/api/cron/pauta',       // el cron de Vercel; valida su propio CRON_SECRET
```

- [ ] **Paso 3: Programar el cron**

En `vercel.json`, dentro de `crons`:

```json
    { "path": "/api/cron/pauta", "schedule": "0 12 * * *" }
```

A las 12:00 UTC = 07:00 de Ecuador, ya con el día anterior cerrado en Meta.

- [ ] **Paso 4: Probar localmente**

```bash
npm run dev
curl "http://localhost:3000/api/cron/pauta"
```

Esperado: JSON con `filas > 0` y `errores: []`.

Verificar en Supabase:

```sql
select tienda_id, count(*) filas, sum(gasto) gasto, max(fecha) ultimo
from crm.pauta_dia group by 1;
```

- [ ] **Paso 5: Commit**

```bash
git add app/api/cron/pauta/route.js middleware.js vercel.json
git commit -m "feat(pauta): cron diario que baja el gasto de Meta"
```

---

## Tarea 6: Consultas y armado del tablero

**Archivos:**
- Crear: `lib/pauta/consultas.js`
- Crear: `lib/pauta/tablero.js`

**Interfaces:**
- Consume: `crm.pauta_embudo` (Tarea 2), `crm.pauta_dia` (Tarea 5),
  `roasDe`/`brechaRoas`/`recortarFechaPiso` de `lib/pauta/atribucion.js`.
- Produce: `armarTablero({ tienda, desde, hasta }): Promise<Tablero>` con la forma:

```js
{
  tienda, desde, hasta, recortadoAlPiso: boolean,
  totales: { gasto, ventaTienda, mer, ventaAtribuida, roasMeta, roasCrm },
  cubetas: { pauta, sinPauta, sinChat },
  embudo:  { impresiones, clics, llegaron, respondieron, conversaron, pedidos, pagados },
  campanas: [{ campaignId, nombre, gasto, …, conjuntos: [{ adsetId, nombre, …, artes: [...] }] }],
  ultimoDato: 'YYYY-MM-DD' | null,
}
```

- [ ] **Paso 1: Escribir las consultas**

```js
// lib/pauta/consultas.js
// Lecturas de Supabase para el tablero. Solo lee; no decide nada.

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/consultas.js es server-only.')
}

import { getSupabase } from '@/lib/supabase'
import { VENTANA_DIAS, MIN_RESPONDIO, MIN_CONVERSO } from './constantes.js'

/** El embudo por anuncio, calculado en vivo por la función SQL. */
export async function embudoPorAnuncio({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase().rpc('pauta_embudo', {
    p_desde: desde,
    p_hasta: hasta,
    p_tienda: tienda,
    p_ventana_dias: VENTANA_DIAS,
    p_min_respondio: MIN_RESPONDIO,
    p_min_converso: MIN_CONVERSO,
  })
  if (error) throw new Error(`pauta_embudo: ${error.message}`)
  return data || []
}

/** El gasto del período, una fila por anuncio (ya sumado por día). */
export async function gastoPorAnuncio({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase()
    .from('pauta_dia').select('*')
    .eq('tienda_id', tienda).gte('fecha', desde).lte('fecha', hasta)
  if (error) throw new Error(`pauta_dia: ${error.message}`)

  const porAd = new Map()
  for (const f of data || []) {
    const a = porAd.get(f.ad_id) || {
      adId: f.ad_id, adNombre: f.ad_nombre, estado: f.estado,
      campaignId: f.campaign_id, campaignNombre: f.campaign_nombre,
      adsetId: f.adset_id, adsetNombre: f.adset_nombre,
      arteUrl: f.arte_url, arteTipo: f.arte_tipo,
      arteTexto: f.arte_texto, arteTitular: f.arte_titular,
      gasto: 0, impresiones: 0, clics: 0, conversacionesMeta: 0, valorMeta: 0,
    }
    a.gasto += Number(f.gasto || 0)
    a.impresiones += Number(f.impresiones || 0)
    a.clics += Number(f.clics || 0)
    a.conversacionesMeta += Number(f.conversaciones_meta || 0)
    a.valorMeta += Number(f.valor_meta || 0)
    // El nombre y el estado más recientes ganan.
    a.adNombre = f.ad_nombre || a.adNombre
    a.estado = f.estado || a.estado
    porAd.set(f.ad_id, a)
  }
  return [...porAd.values()]
}

/** Venta TOTAL de la tienda en el período — el denominador del MER. */
export async function ventaTotalTienda({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase()
    .from('pedidos').select('monto_total')
    .eq('tienda_id', tienda)
    .gte('fecha_pedido', `${desde}T00:00:00-05:00`)
    .lte('fecha_pedido', `${hasta}T23:59:59-05:00`)
  if (error) throw new Error(`pedidos: ${error.message}`)
  return (data || []).reduce((s, p) => s + Number(p.monto_total || 0), 0)
}

/** Las tres cubetas del diseño (R4). */
export async function contarCubetas({ tienda, desde, hasta }) {
  const { data, error } = await getSupabase().rpc('pauta_cubetas', {
    p_desde: desde, p_hasta: hasta, p_tienda: tienda,
  })
  if (error) throw new Error(`pauta_cubetas: ${error.message}`)
  return data?.[0] || { pauta: 0, sin_pauta: 0, sin_chat: 0 }
}

/** Fecha del dato de gasto más reciente, para avisar si el cron no corrió. */
export async function ultimoDatoDeGasto(tienda) {
  const { data } = await getSupabase()
    .from('pauta_dia').select('fecha')
    .eq('tienda_id', tienda).order('fecha', { ascending: false }).limit(1)
  return data?.[0]?.fecha || null
}
```

- [ ] **Paso 2: Agregar la función SQL de cubetas**

Falta `pauta_cubetas`, que usa `contarCubetas`. Agregarla a
`scripts/sql/2026-07-30-pauta.sql` y aplicarla:

```sql
-- Las tres cubetas del diseño (R4): de pauta, sin pauta, y pedidos sin chat.
-- Van separadas a propósito: los pedidos sin conversación (mostrador, web,
-- teléfono) NO son fracaso de la pauta y no deben restarle.
create or replace function crm.pauta_cubetas(p_desde date, p_hasta date, p_tienda text)
returns table (pauta int, sin_pauta int, sin_chat int)
language sql stable as $$
  with personas as (
    select right(regexp_replace(m.telefono,'\D','','g'),9) as t9,
           case when m.cuenta='IND' then 'INDSTORE' else 'MANDARINA' end as tienda_id,
           min(m.fecha) as primer_msg,
           bool_or(coalesce(m.referral->>'source_id','') <> '') as de_pauta
    from inbox.mensajes m group by 1,2
  ),
  nuevos as (
    select * from personas
    where tienda_id = p_tienda
      and primer_msg >= greatest(p_desde::timestamptz, timestamptz '2026-07-13 00:00:00-05')
      and primer_msg <  (p_hasta + 1)::timestamptz
  ),
  con_chat as (select distinct t9 from personas where tienda_id = p_tienda),
  ped as (
    select right(regexp_replace(coalesce(c.celular,''),'\D','','g'),9) as t9, p.pedido_id
    from crm.pedidos p join crm.clientes c on c.cliente_id = p.cliente_id
    where p.tienda_id = p_tienda
      and p.fecha_pedido >= (p_desde::text || 'T00:00:00-05')::timestamptz
      and p.fecha_pedido <  ((p_hasta + 1)::text || 'T00:00:00-05')::timestamptz
  )
  select
    (select count(*) from nuevos where de_pauta)::int,
    (select count(*) from nuevos where not de_pauta)::int,
    (select count(*) from ped where t9 not in (select t9 from con_chat))::int;
$$;
```

- [ ] **Paso 3: Escribir el armado del tablero**

```js
// lib/pauta/tablero.js
// Une el gasto (Meta) con el embudo (nuestro) y arma la respuesta de la API.
// Acá viven las decisiones de "qué se muestra cuando falta un dato".

if (typeof window !== 'undefined') {
  throw new Error('lib/pauta/tablero.js es server-only.')
}

import { roasDe, brechaRoas, recortarFechaPiso } from './atribucion.js'
import {
  embudoPorAnuncio, gastoPorAnuncio, ventaTotalTienda,
  contarCubetas, ultimoDatoDeGasto,
} from './consultas.js'

export async function armarTablero({ tienda, desde, hasta }) {
  const desdeReal = recortarFechaPiso(desde)

  const [embudo, gasto, ventaTienda, cubetas, ultimoDato] = await Promise.all([
    embudoPorAnuncio({ tienda, desde: desdeReal, hasta }),
    gastoPorAnuncio({ tienda, desde: desdeReal, hasta }),
    ventaTotalTienda({ tienda, desde: desdeReal, hasta }),
    contarCubetas({ tienda, desde: desdeReal, hasta }),
    ultimoDatoDeGasto(tienda),
  ])

  const embudoPorAd = new Map(embudo.map((e) => [e.ad_id, e]))
  const gastoPorAd = new Map(gasto.map((g) => [g.adId, g]))

  // La unión de los dos lados: un anuncio puede tener gasto sin chats (no
  // convirtió) o chats sin gasto (su cuenta no está mapeada — ver §3.7).
  const todosLosAds = new Set([...embudoPorAd.keys(), ...gastoPorAd.keys()])

  const artes = [...todosLosAds].map((adId) => {
    const e = embudoPorAd.get(adId)
    const g = gastoPorAd.get(adId)
    const venta = Number(e?.venta || 0)
    const gastoAd = g ? Number(g.gasto) : null
    const roasMeta = g?.valorMeta && gastoAd ? roasDe(g.valorMeta, gastoAd) : null
    const roasCrm = roasDe(venta, gastoAd)

    return {
      adId,
      nombre: g?.adNombre || `Anuncio ${adId}`,
      estado: g?.estado || '',
      campaignId: g?.campaignId || 'SIN_CAMPANA',
      campaignNombre: g?.campaignNombre || 'Sin campaña identificada',
      adsetId: g?.adsetId || 'SIN_CONJUNTO',
      adsetNombre: g?.adsetNombre || 'Sin conjunto identificado',
      arteUrl: g?.arteUrl || null,
      arteTipo: g?.arteTipo || null,
      arteTexto: g?.arteTexto || null,
      arteTitular: g?.arteTitular || null,
      // gasto null = "⚠ sin gasto". La pantalla NUNCA debe pintar $0 acá.
      gasto: gastoAd,
      impresiones: g?.impresiones || 0,
      clics: g?.clics || 0,
      conversacionesMeta: g?.conversacionesMeta || 0,
      llegaron: e?.llegaron || 0,
      respondieron: e?.respondieron || 0,
      conversaron: e?.conversaron || 0,
      pedidos: e?.pedidos || 0,
      pagados: e?.pagados || 0,
      venta,
      roasMeta,
      roasCrm,
      brecha: brechaRoas(roasMeta, roasCrm),
      costoPorConversacion: gastoAd && e?.llegaron ? gastoAd / e.llegaron : null,
    }
  })

  const campanas = agrupar(artes)
  const gastoTotal = artes.reduce((s, a) => s + (a.gasto || 0), 0)
  const ventaAtribuida = artes.reduce((s, a) => s + a.venta, 0)

  return {
    tienda,
    desde: desdeReal,
    hasta,
    recortadoAlPiso: desdeReal !== desde,
    ultimoDato,
    totales: {
      gasto: gastoTotal,
      ventaTienda,
      mer: roasDe(ventaTienda, gastoTotal),
      ventaAtribuida,
      roasCrm: roasDe(ventaAtribuida, gastoTotal),
    },
    cubetas: {
      pauta: cubetas.pauta, sinPauta: cubetas.sin_pauta, sinChat: cubetas.sin_chat,
    },
    embudo: {
      impresiones: artes.reduce((s, a) => s + a.impresiones, 0),
      clics: artes.reduce((s, a) => s + a.clics, 0),
      llegaron: artes.reduce((s, a) => s + a.llegaron, 0),
      respondieron: artes.reduce((s, a) => s + a.respondieron, 0),
      conversaron: artes.reduce((s, a) => s + a.conversaron, 0),
      pedidos: artes.reduce((s, a) => s + a.pedidos, 0),
      pagados: artes.reduce((s, a) => s + a.pagados, 0),
    },
    campanas,
  }
}

/** Artes → conjuntos → campañas, sumando hacia arriba y ordenando por gasto. */
function agrupar(artes) {
  const camps = new Map()
  for (const a of artes) {
    if (!camps.has(a.campaignId)) {
      camps.set(a.campaignId, {
        campaignId: a.campaignId, nombre: a.campaignNombre, conjuntos: new Map(),
      })
    }
    const c = camps.get(a.campaignId)
    if (!c.conjuntos.has(a.adsetId)) {
      c.conjuntos.set(a.adsetId, { adsetId: a.adsetId, nombre: a.adsetNombre, artes: [] })
    }
    c.conjuntos.get(a.adsetId).artes.push(a)
  }

  const sumar = (items) => ({
    gasto: items.some((i) => i.gasto != null)
      ? items.reduce((s, i) => s + (i.gasto || 0), 0) : null,
    llegaron: items.reduce((s, i) => s + i.llegaron, 0),
    respondieron: items.reduce((s, i) => s + i.respondieron, 0),
    conversaron: items.reduce((s, i) => s + i.conversaron, 0),
    pedidos: items.reduce((s, i) => s + i.pedidos, 0),
    venta: items.reduce((s, i) => s + i.venta, 0),
  })

  return [...camps.values()]
    .map((c) => {
      const conjuntos = [...c.conjuntos.values()]
        .map((cj) => ({ ...cj, ...sumar(cj.artes), artes: ordenar(cj.artes) }))
        .sort((a, b) => (b.gasto || 0) - (a.gasto || 0))
      return { ...c, ...sumar(conjuntos), conjuntos }
    })
    .sort((a, b) => (b.gasto || 0) - (a.gasto || 0))
}

/** Por gasto; los sin gasto conocido al final pero ordenados por chats. */
function ordenar(artes) {
  return artes.sort((a, b) => (b.gasto || 0) - (a.gasto || 0) || b.llegaron - a.llegaron)
}
```

- [ ] **Paso 4: Verificar contra los números del diseño**

```bash
node -e "
import('./lib/pauta/tablero.js').then(async (m) => {
  const t = await m.armarTablero({ tienda: 'INDSTORE', desde: '2026-07-13', hasta: '2026-07-30' })
  console.log('embudo', t.embudo)
  console.log('cubetas', t.cubetas)
  console.log('campanas', t.campanas.length)
})"
```

Esperado: `llegaron 876 · respondieron 511 · conversaron 270 · pedidos 9 · pagados 8`
(§3.3 del diseño). Si no coincide, **parar y revisar** antes de seguir.

- [ ] **Paso 5: Commit**

```bash
git add lib/pauta/consultas.js lib/pauta/tablero.js scripts/sql/2026-07-30-pauta.sql
git commit -m "feat(pauta): consultas del embudo y armado del tablero"
```

---

## Tarea 7: La API, solo para ADMIN

**Archivos:**
- Crear: `app/api/pauta/route.js`

**Interfaces:**
- Consume: `armarTablero` de `lib/pauta/tablero.js`, `requireAdmin` de `lib/auth.js`.
- Produce: `GET /api/pauta?tienda=INDSTORE&desde=2026-07-13&hasta=2026-07-30`

- [ ] **Paso 1: Escribir la ruta**

```js
// app/api/pauta/route.js
export const dynamic = 'force-dynamic'

import { requireAdmin } from '@/lib/auth'
import { armarTablero } from '@/lib/pauta/tablero'
import { TIENDAS, FECHA_PISO } from '@/lib/pauta/constantes'
import { hoyEcuador } from '@/lib/parseFecha'

// El tablero de pauta. SOLO ADMIN: acá se ve el gasto y el margen del negocio.
//
// La frontera de seguridad es esta ruta, no la pantalla. requireAdmin relee el
// usuario de la base con el id de la cookie firmada: nunca cree lo que diga el
// navegador sobre su propio rol.
export async function GET(req) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const tienda = searchParams.get('tienda') || TIENDAS[0].id
  const desde = searchParams.get('desde') || FECHA_PISO
  const hasta = searchParams.get('hasta') || hoyEcuador()

  if (!TIENDAS.some((t) => t.id === tienda)) {
    return Response.json({ error: `Tienda desconocida: ${tienda}` }, { status: 400 })
  }

  try {
    return Response.json(await armarTablero({ tienda, desde, hasta }))
  } catch (e) {
    console.error('/api/pauta:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Paso 2: Probar que un NO admin no entra**

```bash
npm run dev
# Sin cookie de sesión:
curl -i "http://localhost:3000/api/pauta?tienda=INDSTORE"
```

Esperado: `401`. El middleware corta antes incluso de llegar a `requireAdmin`.

Después, entrando con un usuario **VENDEDOR** en el navegador y visitando
`/api/pauta?tienda=INDSTORE`: esperado `403 Solo un ADMIN puede hacer esto`.

Con un usuario **ADMIN**: esperado `200` con el JSON del tablero.

- [ ] **Paso 3: Commit**

```bash
git add app/api/pauta/route.js
git commit -m "feat(pauta): API del tablero protegida con requireAdmin"
```

---

## Tarea 8: La pantalla — cabecera y embudo

**Archivos:**
- Crear: `app/dashboard/pauta/page.js`
- Modificar: el menú del dashboard (buscar dónde se listan las secciones en
  `app/dashboard/layout.js` o `app/dashboard/page.js`) para agregar el enlace
  solo si `canAccess(user, 'reportes')`.

**Interfaces:**
- Consume: `GET /api/pauta`.

- [ ] **Paso 1: Escribir la pantalla**

```jsx
// app/dashboard/pauta/page.js
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Tabla from './Tabla'

const TIENDAS = [
  { id: 'INDSTORE', nombre: 'IND STORE' },
  { id: 'MANDARINA', nombre: 'Mandarina Republic' },
]
const FECHA_PISO = '2026-07-13'

const money = (n) => n == null ? '—' : `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const veces = (n) => n == null ? '—' : `${Number(n).toLocaleString('es-EC', { maximumFractionDigits: 1 })}x`
const num = (n) => Number(n || 0).toLocaleString('es-EC')

export default function PautaPage() {
  const router = useRouter()
  const [tienda, setTienda] = useState('INDSTORE')
  const [desde, setDesde] = useState(FECHA_PISO)
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const guardado = localStorage.getItem('mp_user')
    if (!guardado) { router.push('/'); return }
    if (JSON.parse(guardado).rol !== 'ADMIN') { router.push('/dashboard'); return }
  }, [router])

  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    fetch(`/api/pauta?tienda=${tienda}&desde=${desde}&hasta=${hasta}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'No se pudo cargar')
        return j
      })
      .then((j) => { if (vivo) setDatos(j) })
      .catch((e) => { if (vivo) setError(e.message) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [tienda, desde, hasta])

  const e = datos?.embudo
  const pasos = e ? [
    { nombre: 'Impresiones', valor: e.impresiones, base: null },
    { nombre: 'Clics', valor: e.clics, base: e.impresiones },
    { nombre: 'Llegaron al chat', valor: e.llegaron, base: e.clics },
    { nombre: 'Respondieron', valor: e.respondieron, base: e.llegaron },
    { nombre: 'Conversaron', valor: e.conversaron, base: e.respondieron },
    { nombre: 'Pedido', valor: e.pedidos, base: e.conversaron },
    { nombre: 'Pagado', valor: e.pagados, base: e.pedidos },
  ] : []

  // El escalón que más gente pierde, para marcarlo.
  const peor = pasos
    .filter((p) => p.base > 0 && p.nombre !== 'Clics')
    .sort((a, b) => (a.valor / a.base) - (b.valor / b.base))[0]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Pauta</h1>
        <div className="flex gap-2">
          {TIENDAS.map((t) => (
            <button key={t.id} onClick={() => setTienda(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tienda === t.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {t.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <label className="flex items-center gap-2">Desde
          <input type="date" value={desde} min={FECHA_PISO} onChange={(ev) => setDesde(ev.target.value)}
            className="border rounded px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">Hasta
          <input type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)}
            className="border rounded px-2 py-1" />
        </label>
      </div>

      {datos?.recortadoAlPiso && (
        <p className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">
          Antes del {FECHA_PISO} no se guardaba de qué anuncio venía cada chat, así
          que no hay datos de pauta. El rango arranca en esa fecha.
        </p>
      )}

      {error && <p className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</p>}
      {cargando && <p className="text-gray-500">Cargando…</p>}

      {datos && !cargando && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Tarjeta titulo="Gasto" valor={money(datos.totales.gasto)} />
            <Tarjeta titulo="Venta total de la tienda" valor={money(datos.totales.ventaTienda)} />
            <Tarjeta titulo="MER (venta ÷ gasto)" valor={veces(datos.totales.mer)} destacado />
          </div>

          <p className="text-sm text-gray-600 mb-6">
            De pauta <b>{num(datos.cubetas.pauta)}</b> · Sin pauta <b>{num(datos.cubetas.sinPauta)}</b> ·
            Sin chat <b>{num(datos.cubetas.sinChat)}</b> pedidos
            {datos.ultimoDato && <span className="ml-2 text-gray-400">· gasto al {datos.ultimoDato}</span>}
          </p>

          <div className="border rounded-xl p-4 mb-8">
            <h2 className="font-semibold mb-3">Embudo</h2>
            {pasos.map((p) => (
              <div key={p.nombre} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-40 text-gray-600">{p.nombre}</span>
                <span className="w-24 text-right font-medium tabular-nums">{num(p.valor)}</span>
                <span className="w-16 text-right text-gray-500 tabular-nums">
                  {p.base > 0 ? `${Math.round((p.valor / p.base) * 100)}%` : ''}
                </span>
                {peor && p.nombre === peor.nombre && (
                  <span className="text-amber-600 text-xs">⚠ aquí sangra</span>
                )}
              </div>
            ))}
          </div>

          <Tabla campanas={datos.campanas} />
        </>
      )}
    </div>
  )
}

function Tarjeta({ titulo, valor, destacado }) {
  return (
    <div className={`border rounded-xl p-4 ${destacado ? 'bg-gray-900 text-white' : ''}`}>
      <p className={`text-xs mb-1 ${destacado ? 'text-gray-300' : 'text-gray-500'}`}>{titulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  )
}
```

- [ ] **Paso 2: Agregar el enlace en el menú**

El menú es un array en `app/dashboard/layout.js` (líneas 12–26). Cada entrada
lleva los roles que la ven. Agregar la entrada **junto a las otras de solo
ADMIN**, después de la de Errores (línea 25):

```js
  { href:'/dashboard/pauta',        label:'Pauta',        icon:'📣', roles:['ADMIN'] },
```

El array `roles` es lo que gobierna quién ve el enlace — no hay `canAccess` en
este layout. Recuerda que esconder el enlace **no es la seguridad**: esa vive en
`requireAdmin` dentro de `/api/pauta` (Tarea 7).

- [ ] **Paso 3: Verificar en el navegador**

```bash
npm run dev
```

Entrar como ADMIN a `/dashboard/pauta`. Esperado: el embudo de INDSTORE muestra
`876 / 511 / 270 / 9 / 8` y el escalón "Pedido" marcado con ⚠.

Entrar como VENDEDOR: no debe verse el enlace, y entrar a mano a la URL debe
rebotar a `/dashboard`.

- [ ] **Paso 4: Commit**

```bash
git add app/dashboard/pauta/page.js app/dashboard/page.js
git commit -m "feat(pauta): pantalla con cabecera y embudo por tienda"
```

---

## Tarea 9: La tabla desplegable y la ficha del arte

**Archivos:**
- Crear: `app/dashboard/pauta/Tabla.jsx`
- Modificar: `app/api/cron/pauta/route.js` (archivar el arte)

**Interfaces:**
- Consume: `campanas` de `armarTablero`.

- [ ] **Paso 1: Escribir la tabla**

```jsx
// app/dashboard/pauta/Tabla.jsx
'use client'
import { useState } from 'react'

const money = (n) => n == null ? null : `$${Number(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const veces = (n) => n == null ? '—' : `${Number(n).toLocaleString('es-EC', { maximumFractionDigits: 2 })}x`
const num = (n) => Number(n || 0).toLocaleString('es-EC')
const pct = (n) => n == null ? '' : `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`

/** Gasto: null significa "no sabemos", NO cero. Se dice, no se disfraza. */
function Gasto({ valor }) {
  if (valor == null) return <span className="text-amber-600 text-xs">⚠ sin gasto</span>
  return <span className="tabular-nums">{money(valor)}</span>
}

export default function Tabla({ campanas }) {
  const [abiertas, setAbiertas] = useState(new Set())
  const [arte, setArte] = useState(null)

  const alternar = (id) => setAbiertas((prev) => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })

  if (!campanas?.length) return <p className="text-gray-500">No hay campañas en este rango.</p>

  return (
    <>
      <div className="border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Campaña / Conjunto / Arte</th>
              <th className="text-right px-3 py-2">Gasto</th>
              <th className="text-right px-3 py-2">Conv</th>
              <th className="text-right px-3 py-2">Resp</th>
              <th className="text-right px-3 py-2">Ped</th>
              <th className="text-right px-3 py-2">Venta</th>
              <th className="text-right px-3 py-2">Meta</th>
              <th className="text-right px-3 py-2">CRM</th>
              <th className="text-right px-3 py-2">Brecha</th>
            </tr>
          </thead>
          <tbody>
            {campanas.map((c) => (
              <FilasCampana key={c.campaignId} c={c} abiertas={abiertas}
                alternar={alternar} onArte={setArte} />
            ))}
          </tbody>
        </table>
      </div>
      {arte && <FichaArte arte={arte} onCerrar={() => setArte(null)} />}
    </>
  )
}

function FilasCampana({ c, abiertas, alternar, onArte }) {
  const abierta = abiertas.has(c.campaignId)
  return (
    <>
      <tr className="border-t bg-gray-50/50 font-medium cursor-pointer hover:bg-gray-100"
          onClick={() => alternar(c.campaignId)}>
        <td className="px-3 py-2">{abierta ? '▼' : '▶'} {c.nombre}</td>
        <td className="px-3 py-2 text-right"><Gasto valor={c.gasto} /></td>
        <td className="px-3 py-2 text-right tabular-nums">{num(c.llegaron)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(c.respondieron)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(c.pedidos)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(c.venta)}</td>
        <td colSpan={3} />
      </tr>
      {abierta && c.conjuntos.map((cj) => (
        <FilasConjunto key={cj.adsetId} cj={cj} abiertas={abiertas}
          alternar={alternar} onArte={onArte} />
      ))}
    </>
  )
}

function FilasConjunto({ cj, abiertas, alternar, onArte }) {
  const abierto = abiertas.has(cj.adsetId)
  return (
    <>
      <tr className="border-t text-gray-700 cursor-pointer hover:bg-gray-50"
          onClick={() => alternar(cj.adsetId)}>
        <td className="px-3 py-2 pl-8">{abierto ? '▼' : '▶'} {cj.nombre}</td>
        <td className="px-3 py-2 text-right"><Gasto valor={cj.gasto} /></td>
        <td className="px-3 py-2 text-right tabular-nums">{num(cj.llegaron)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(cj.respondieron)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{num(cj.pedidos)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(cj.venta)}</td>
        <td colSpan={3} />
      </tr>
      {abierto && cj.artes.map((a) => (
        <tr key={a.adId} className="border-t hover:bg-blue-50 cursor-pointer"
            onClick={() => onArte(a)}>
          <td className="px-3 py-2 pl-14">🖼 {a.nombre}</td>
          <td className="px-3 py-2 text-right"><Gasto valor={a.gasto} /></td>
          <td className="px-3 py-2 text-right tabular-nums">{num(a.llegaron)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{num(a.respondieron)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{num(a.pedidos)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{money(a.venta)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{veces(a.roasMeta)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{veces(a.roasCrm)}</td>
          <td className={`px-3 py-2 text-right tabular-nums ${
            a.brecha != null && a.brecha < -0.5 ? 'text-amber-600' : 'text-gray-500'}`}>
            {pct(a.brecha)}
          </td>
        </tr>
      ))}
    </>
  )
}

function FichaArte({ arte, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
         onClick={onCerrar}>
      <div className="bg-white rounded-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-semibold">{arte.nombre}</h3>
          <button onClick={onCerrar} className="text-gray-400 text-xl leading-none">×</button>
        </div>

        {arte.arteUrl
          ? <img src={arte.arteUrl} alt="" className="w-full rounded-lg mb-3" />
          : <div className="w-full aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-400 text-sm">
              Sin imagen archivada
            </div>}

        <p className="text-xs text-gray-500 mb-2">
          {arte.arteTipo || '—'} · {arte.estado || 'estado desconocido'}
        </p>

        {arte.arteTexto && (
          <p className="text-sm whitespace-pre-line bg-gray-50 rounded-lg p-3 mb-3">
            {arte.arteTexto}
          </p>
        )}

        <div className="text-sm space-y-1 text-gray-700">
          <p>
            Gasto {arte.gasto == null ? '⚠ sin gasto' : money(arte.gasto)} ·
            {' '}{num(arte.llegaron)} conversaciones
            {arte.costoPorConversacion != null && ` · ${money(arte.costoPorConversacion)} por conversación`}
          </p>
          <p className="text-gray-600">
            {num(arte.llegaron)} llegaron → {num(arte.respondieron)} respondieron →
            {' '}{num(arte.conversaron)} conversaron → {num(arte.pedidos)} pedidos →
            {' '}{money(arte.venta)}
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: Archivar el arte en el cron**

Las URLs de imagen que trae el `referral` son firmadas por Meta y **caducan**.
Agregar a `app/api/cron/pauta/route.js` — mismo patrón que `lib/media-archive.js`
usa para las fotos entrantes del WhatsApp:

```js
/**
 * Archiva el arte de un anuncio en el bucket `pauta-artes` la PRIMERA vez que
 * se ve. Las URLs de Meta caducan; una vez archivada, la imagen es nuestra.
 * El texto (arte_texto) sale del referral del inbox, que sí es permanente.
 */
async function archivarArte(sb, adId, tiendaId) {
  const { data: ya } = await sb
    .from('pauta_dia').select('arte_url')
    .eq('ad_id', adId).not('arte_url', 'is', null).limit(1)
  if (ya?.length) return null // ya archivada

  // El referral del inbox trae la creatividad tal como la vio el cliente.
  const { data: refs } = await sb.schema('inbox')
    .from('mensajes').select('referral')
    .contains('referral', { source_id: adId })
    .order('fecha', { ascending: false }).limit(1)

  const ref = refs?.[0]?.referral
  if (!ref) return null

  const origen = ref.image_url || ref.thumbnail_url
  const datos = {
    arte_tipo: ref.media_type || null,
    arte_texto: ref.body || null,
    arte_titular: ref.headline || null,
    arte_url: null,
  }

  if (origen) {
    try {
      const r = await fetch(origen)
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        const ruta = `${tiendaId}/${adId}.jpg`
        await sb.storage.from('pauta-artes')
          .upload(ruta, buf, { contentType: 'image/jpeg', upsert: true })
        datos.arte_url = sb.storage.from('pauta-artes').getPublicUrl(ruta).data.publicUrl
      }
    } catch {
      // Si la URL ya caducó nos quedamos con el texto, que es lo que no se pierde.
    }
  }
  return datos
}
```

Y engancharla en el `map` que arma los registros, dentro del bucle de cuentas.
Reemplazar `const registros = filas.map(...)` por:

```js
      // Los artes se archivan una sola vez por anuncio, no una vez por día.
      const artesPorAd = new Map()
      for (const adId of adIds) {
        const arte = await archivarArte(sb, adId, c.tienda_id)
        if (arte) artesPorAd.set(adId, arte)
      }

      const registros = filas.map((f) => ({
        // … los mismos campos de antes …
        creative_id: detalle.get(f.adId)?.creativeId || '',
        ...(artesPorAd.get(f.adId) || {}),   // arte_url, arte_tipo, arte_texto, arte_titular
        actualizado_at: new Date().toISOString(),
      }))
```

`archivarArte` devuelve `null` para los que ya tienen `arte_url`, así que el
spread no pisa lo ya archivado.

- [ ] **Paso 3: Verificar en el navegador**

Correr el cron una vez y abrir `/dashboard/pauta`. Esperado:
- La tabla despliega campaña → conjunto → arte.
- Al menos un arte muestra su foto y su texto.
- El anuncio sin cuenta mapeada muestra **`⚠ sin gasto`**, nunca `$0.00`.

- [ ] **Paso 4: Commit**

```bash
git add app/dashboard/pauta/Tabla.jsx app/api/cron/pauta/route.js
git commit -m "feat(pauta): tabla desplegable y ficha del arte"
```

---

## Verificación final

- [ ] `node scripts/test-pauta.mjs` — todas pasan
- [ ] `npm run build` — compila sin errores
- [ ] El embudo de INDSTORE coincide con §3.3 del diseño (876/511/270/9/8)
- [ ] El embudo de MANDARINA coincide (291/198/119/3/3)
- [ ] Un VENDEDOR recibe 403 en `/api/pauta`
- [ ] Ningún anuncio sin cuenta mapeada muestra `$0` ni ROAS infinito
- [ ] Un rango que empiece antes del 13-jul muestra el aviso, no ceros
- [ ] `META_ADS_TOKEN` cargado en Vercel (Production), sin BOM

## Pendientes que este plan NO cubre

Están en §12 y §13 del diseño y quedan fuera a propósito:

- Cerrar el circuito CAPI con `ctwa_clid` (ya está guardado, sin usar).
- Atribuir ventas de la web (Shopify).
- Cambiar campañas desde el tablero.
