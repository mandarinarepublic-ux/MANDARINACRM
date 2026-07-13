# Plan de migración: Google Sheets → Supabase (Postgres)

> Estado: **PLANIFICACIÓN**. Nada en producción cambia hasta la Fase 5 (cutover).
> Estrategia: **conectar y validar todo primero; migrar cuando estemos 100% listos.**
> Sheets sigue siendo la verdad hasta que Supabase pase todas las validaciones.

## ⭐ Arquitectura definitiva (decidida)

- **UNA sola base Postgres** = proyecto Supabase **`mandarina-DATA`** (a crear; el MCP se reconecta a ese; el proyecto `mandarina-inbox` conectado antes NO se usa).
- **Schemas separados dentro de la misma DB:**
  - `crm` → las 11 tablas del CRM (este plan).
  - `inbox` → conversaciones + mensajes de los DOS inbox (IND y MANDI) en las MISMAS tablas, distinguidos por columna `cuenta = 'IND' | 'MANDI'`.
- **Objetivo del diseño unificado:** el CRM consulta las conversaciones del inbox para mostrar el hilo de WhatsApp junto al pedido/cliente. **Llave de unión = número de celular** (`crm.clientes.celular` ↔ `inbox.conversaciones.telefono`). Se resuelve con una vista (p.ej. `crm_cliente_conversacion`).
- **Por fases:** primero migrar el CRM; luego los dos inbox (hoy también en Sheets) al mismo Postgres; la unión por teléfono se activa cuando ambos estén dentro.
- **Decisiones confirmadas:** estrategia de corte = **doble escritura (dual-write)**; contraseñas = **hashear las actuales con bcrypt** (nadie resetea).

```
Proyecto Supabase  mandarina-DATA  (una sola DB)
├── schema inbox : conversaciones(telefono, cuenta='IND'|'MANDI', ...) + mensajes(conversacion_id, direccion, texto, media_url, fecha)
└── schema crm   : clientes(celular ⟵ join) + pedidos + detalle_pedido + pagos + guias_despacho + logs_pedidos + sucursal + usuarios + productos_shopify + productos_catalogo + dias_entrega
```

---

## 0. Principios de la migración

1. **Cero downtime, cero riesgo hasta el final.** Supabase se construye en paralelo. Sheets no se toca hasta el cutover.
2. **Un interruptor.** Una variable de entorno `DATA_BACKEND = sheets | supabase` decide de dónde lee/escribe la app. Se puede volver atrás en segundos.
3. **Se mantiene lo que ya funciona fuera de la DB.** **Cloudinary se queda** (las imágenes ya son URLs, no base64 en la DB). El **login propio se queda** (solo le agregamos hash real de contraseña). Así el alcance baja mucho.
4. **Aprovechamos para corregir la deuda técnica** detectada en el mapeo (ver §6), pero sin cambiar el comportamiento visible para el usuario.
5. **Todo el acceso a datos ya pasa por pocos archivos** (`lib/sheets.js` + ~13 rutas). Eso hace la migración concentrada, no dispersa.

---

## 1. Arquitectura objetivo

```
Navegador (vendedor / admin, móvil o desktop)
        │
        ▼
Next.js API routes (Vercel)  ──►  lib/db/*  (repositorios)
        │                              │
        │                              ├─► DATA_BACKEND=sheets   → lib/sheets.js (hoy)
        │                              └─► DATA_BACKEND=supabase → @supabase/supabase-js (nuevo)
        │
        └─► Cloudinary (imágenes, SIN cambios — subida directa firmada)
```

- Las rutas API **no cambian su interfaz**. Solo dejan de llamar a `readSheet/appendRow/...` y llaman a funciones de repositorio (`pedidos.crear()`, `clientes.upsertPorCedula()`, etc.).
- El repositorio internamente elige backend según `DATA_BACKEND`. En transición puede **escribir en ambos** (dual-write) para validar.
- Clave de servicio (`service_role`) **solo del lado servidor** (todas las rutas son server-side). En Fase 1 esto nos deja RLS simple; se endurece después.

---

## 2. Esquema Postgres propuesto

Decisiones de diseño:
- **Conservar los IDs de negocio existentes como PK** (`PEDIDO_ID = 'MAN-AND-2432'`, `ITEM_ID`, etc.) para no romper referencias. Donde hoy ya hay UUID, usar `uuid`.
- Tipos **reales**: `numeric`, `boolean`, `timestamptz`. Se acabaron los `'TRUE'`/`'FALSE'` y las fechas string.
- **FKs reales** con `on delete` explícito. Se acaban los joins en memoria.
- Columnas que hoy se crean "on the fly" quedan fijas en el esquema.

### 2.1 Tablas núcleo (SQL de referencia)

```sql
-- USUARIOS
create table usuarios (
  usuario_id   uuid primary key default gen_random_uuid(),
  nombre       text not null,
  codigo       text,                       -- 3 letras usadas en PEDIDO_ID
  email        text,
  username     text unique,                -- login
  password_hash text not null,             -- ⚠️ AHORA sí hasheada (bcrypt), ver §6
  rol          text not null,              -- ADMIN|VENDEDOR|VENDEDOR_YAW|DISEÑO|DESPACHO
  areas        text[] default '{}',        -- antes CSV en una celda
  tiendas      text[] default '{}',        -- antes CSV en una celda
  activo       boolean not null default true,
  fecha        timestamptz not null default now()
);

-- CLIENTES
create table clientes (
  cliente_id     uuid primary key default gen_random_uuid(),
  nombre         text not null,
  cedula         text unique,              -- clave de negocio (upsert por cédula)
  celular        text,
  email          text,
  ciudad         text,
  direccion      text,
  fecha_registro timestamptz not null default now()
);

-- PEDIDOS  (PK = ID de negocio existente)
create table pedidos (
  pedido_id                uuid  -- NO: se conserva el text de negocio ↓
);
-- (reescrito correctamente:)
drop table pedidos;
create table pedidos (
  pedido_id                text primary key,        -- 'MAN-AND-2432'
  tienda_id                text not null,           -- MANDARINA|INDSTORE|YAW
  vendedor_id              uuid references usuarios(usuario_id),  -- se DESAMBIGUA (§6)
  cliente_id               uuid references clientes(cliente_id),
  fecha_pedido             timestamptz not null default now(),
  fecha_actualizacion      timestamptz not null default now(),
  fecha_entrega_prometida  timestamptz,
  dias_calculado           int,
  dias_prometido           int,
  alerta_entrega           boolean default false,
  estado_pedido            text default 'EN_FABRICA',
  estado_pago              text default 'PENDIENTE',   -- PENDIENTE|ABONO|PAGADO
  monto_total              numeric(12,2) default 0,
  monto_abonado            numeric(12,2) default 0,
  monto_pendiente          numeric(12,2) default 0,
  factura_solicitada       boolean default false,
  factura_datil_id         text,
  factura_id               text,             -- antes columna on-the-fly
  factura_pdf_url          text,             -- antes columna on-the-fly
  fecha_impresion_produccion timestamptz,    -- antes columna on-the-fly
  impreso_por              text,             -- antes columna on-the-fly
  notas_vendedor           text,
  guia_numero              text,
  guia_transportista       text,
  direccion_pedido         text,             -- unifica DIRECCION_TEXTO/DIRECCION_PEDIDO (§6)
  latitud                  numeric(10,7),
  longitud                 numeric(10,7)
);

-- DETALLE_PEDIDO (ítems)
create table detalle_pedido (
  item_id            text primary key,       -- 'AND-MAN-AND-2432-01'
  pedido_id          text not null references pedidos(pedido_id) on delete cascade,
  tienda_id          text,
  producto_nombre    text,
  detalle_personalizado text,
  es_personalizado   boolean default false,
  color              text,
  talla              text,
  cantidad           int default 1,
  precio_unit        numeric(12,2) default 0,
  subtotal           numeric(12,2) default 0,
  area               text,
  subestado          text,                   -- formato multi-área 'ESTAMPADO:LISTO|BORDADO:EN_PROCESO'
  subestado_corte    text,                   -- antes columna on-the-fly
  foto_pecho_url     text,
  foto_espalda_url   text,
  foto_manga_d_url   text,
  foto_manga_i_url   text,
  archivo_diseno     text,
  shopify_variant_id text,                   -- '{id}_{talla}'
  fecha_modificacion timestamptz default now(),
  notas_area         text,
  eliminado          boolean default false   -- reemplaza soft-delete SUBESTADO='ELIMINADO' (§6)
);

-- PAGOS
create table pagos (
  pago_id              uuid primary key default gen_random_uuid(),
  pedido_id            text not null references pedidos(pedido_id) on delete cascade,
  tipo                 text,                 -- EFECTIVO|LINK_PAGO|TRANSFERENCIA...
  monto                numeric(12,2) not null,
  fecha                timestamptz not null default now(),
  estado               text default 'PAGADO',
  foto_comprobante_url text,
  vendedor_id          uuid references usuarios(usuario_id),
  notas                text
  -- se ELIMINAN las 3 columnas placeholder vacías G/H/I (§6)
);

-- GUIAS_DESPACHO (1-N con pedidos)
create table guias_despacho (
  guia_id        uuid primary key default gen_random_uuid(),
  pedido_id      text not null references pedidos(pedido_id) on delete cascade,
  numero_guia    text,
  transportista  text default 'SERVIENTREGA',
  foto_guia_url  text,
  fecha_despacho timestamptz not null default now(),
  registrado_por text,
  notas          text
);

-- LOGS_PEDIDOS (bitácora append-only)
create table logs_pedidos (
  log_id        bigint generated always as identity primary key,
  pedido_id     text references pedidos(pedido_id) on delete cascade,
  fecha         timestamptz not null default now(),
  usuario       text,
  campo         text,
  valor_antes   text,
  valor_despues text
);

-- SUCURSAL (inventario físico)
create table sucursal (
  id                   text primary key,     -- 'SUC-...' o migrar a uuid
  nombre               text not null,
  tienda               text,
  precio               numeric(12,2) default 0,
  talla                text default 'U',
  color                text,
  stock                int default 0,
  reservado            int default 0,
  foto_url             text,
  activo               boolean default true,
  fecha_creacion       timestamptz default now(),
  creado_por           text,
  ultima_modificacion  timestamptz default now(),
  modificado_por       text
);

-- PRODUCTOS_SHOPIFY (catálogo sincronizado; reemplazo total en cada sync)
create table productos_shopify (
  tienda   text not null,
  id       text not null,          -- shopify product id
  title    text,
  price    numeric(12,2),
  variants text[],                 -- antes CSV 'S, M, L'
  image    text,
  activo   boolean default true,
  primary key (tienda, id)
);

-- PRODUCTOS_CATALOGO (tipos de prenda)
create table productos_catalogo (
  nombre text primary key,
  activo boolean default true
);

-- DIAS_ENTREGA (config de plazos)
create table dias_entrega (
  area_combinacion text primary key,   -- 'ESTAMPADO', 'ESTAMPADO+BORDADO', 'TODAS'
  dias_minimos     int not null
);
```

### 2.2 Índices recomendados
```sql
create index on pedidos (cliente_id);
create index on pedidos (vendedor_id);
create index on pedidos (estado_pedido);
create index on detalle_pedido (pedido_id);
create index on pagos (pedido_id);
create index on guias_despacho (pedido_id);
create index on logs_pedidos (pedido_id);
create index on sucursal (tienda) where activo;
```

### 2.3 Generación de PEDIDO_ID (contador)
Hoy = `max(existentes)+1` con base 2400 y resolución de colisión en bucle. En Postgres se reemplaza por una **secuencia** o una tabla `contadores`, atómica:
```sql
create sequence pedido_seq start 2433;   -- arrancar en (max actual + 1)
-- al crear: numero = nextval('pedido_seq'); pedido_id = prefijo + codigoVendedor + numero
```
Esto elimina la race condition del contador de raíz.

---

## 3. Fases del plan

### Fase 0 — Preparación (sin tocar producción) ✅ empezar aquí
- [ ] Crear proyecto en Supabase (región cercana: `us-east` o `sa-east`).
- [ ] Guardar en Vercel las env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, y `DATA_BACKEND=sheets` (arranca apuntando a lo actual).
- [ ] `npm i @supabase/supabase-js`.
- [ ] Crear `lib/supabase.js` (cliente con service_role, server-side).

### Fase 1 — Esquema
- [ ] Ejecutar el SQL de §2 en Supabase (SQL Editor).
- [ ] Cargar `dias_entrega` y `productos_catalogo` (config manual, pocos registros).
- [ ] Verificar tipos, FKs e índices.

### Fase 2 — Capa de repositorios + backfill
- [ ] Crear `lib/db/` con un módulo por entidad (pedidos, clientes, usuarios, pagos, guias, sucursal, catalogo, logs) que exponga las MISMAS operaciones que hoy hacen las rutas.
- [ ] Cada repositorio implementa ambos backends detrás de `DATA_BACKEND`.
- [ ] **Script de backfill** (`scripts/migrate-sheets-to-supabase.mjs`): lee cada hoja → transforma → inserta.
      Transformaciones clave:
      - Fechas `"14Jun2026 20:53:00"` → `timestamptz` (parser de formato Ecuador; USUARIOS.FECHA es ISO).
      - `'TRUE'/'FALSE'` → `boolean`.
      - montos/cantidades string → `numeric/int`.
      - CSV `AREAS/TIENDAS/VARIANTS` → `text[]`.
      - `SUBESTADO='ELIMINADO'` → `eliminado=true`.
      - Contraseñas texto plano → **bcrypt** (o marcar reset obligatorio).
      - Desambiguar `VENDEDOR_ID` (nombre vs uuid) contra `usuarios`.
      - Script **idempotente** (upsert por PK) para poder correrlo muchas veces.

### Fase 3 — Doble escritura + lectura sombra (con tráfico real, sin riesgo)
- [ ] Activar **dual-write**: cada mutación escribe en Sheets (verdad) y también en Supabase.
- [ ] **Lectura sombra**: en los GET, leer también de Supabase y comparar en logs las diferencias (no se muestran al usuario).
- [ ] Correr el backfill una vez para el histórico + dual-write mantiene lo nuevo sincronizado.
- [ ] Dejar rodar unos días con el equipo trabajando normal.

### Fase 4 — Validación 100% (la puerta al cutover)
Checklist de paridad por flujo (probar cada uno contra Supabase y comparar con Sheets):
- [ ] Crear pedido (con cliente nuevo y con cliente existente por cédula).
- [ ] Agregar/editar ítem, subestados multi-área, soft-delete de ítem.
- [ ] Registrar abono (efectivo y transferencia con comprobante) → recálculo de montos.
- [ ] Auto-avance de estado a DESPACHO.
- [ ] Crear guía de despacho.
- [ ] Emitir factura (callback Dátil) → columnas factura.
- [ ] Inventario Sucursal: agregar, editar, vender/despachar/cancelar (stock↔reservado).
- [ ] Catálogo: sync Shopify (reemplazo total) y productos_catalogo.
- [ ] Login y permisos por rol.
- [ ] **Reconciliación**: conteos de filas y sumas de montos por pedido coinciden Sheets vs Supabase.

### Fase 5 — Cutover (el "switch")

**Checklist de cutover (en ORDEN — no saltear pasos):**

Pre-requisitos (infraestructura, ANTES de tocar el switch):
- [x] **Subir Supabase a Pro** (motivo: backups automáticos + sin pausa por inactividad).
      Es cambio de facturación, cero impacto técnico: no cambian URL, keys ni project id
      (`piingkecjgoisnxccvaa`), sin downtime. Hecho el 2026-07-13.
- [ ] Verificar en el dashboard: *Database → Backups* muestra **backups diarios** activos.
- [ ] *Settings → Billing*: **spend cap ACTIVADO** (fija el costo en ~$25/mes, evita overage).
- [ ] NO activar PITR (add-on ~$100/mes, innecesario para este volumen).

Validación (Fase 4 completa antes de seguir):
- [ ] Reconciliar paridad Sheets⇄Supabase. Dos opciones:
      - **Endpoint** (recomendado, sin credenciales locales): `GET /api/admin/reconcile?key=<CRON_SECRET>`
        corre del lado del servidor en Vercel (usa las env vars ya cargadas) y devuelve el reporte JSON.
      - CLI local: `node scripts/reconcile-sheets-vs-supabase.mjs` (necesita `.env.local`).
- [ ] Recorrer el checklist de flujos (§3, Fase 4) contra Supabase.
- [ ] **Backfill final** justo antes del switch para reconciliar cualquier deriva del
      espejo best-effort (ver nota de consistencia en §8).

El switch:
- [ ] Cambiar `DATA_BACKEND=supabase` en Vercel (Supabase pasa a ser la verdad).
- [ ] Ahora el dual-write invierte: Supabase primario, **Sheets queda como espejo/respaldo**
      de solo lectura 2–3 semanas.
- [ ] Apagar `SHADOW_READ` (ya no aplica; la sombra era para comparar durante Fase 3).
- [ ] Monitorear errores en Vercel y feedback del equipo unos días.

### Fase 6 — Limpieza
- [ ] Quitar dual-write y `lib/sheets.js`.
- [ ] Borrar endpoints temporales: `shopify/seed`, `admin/reconcile` (Fase 4) y `admin/inbox-backfill`.
- [ ] Borrar deuda: hacks `safeCell`, fallbacks hardcoded ya innecesarios.
- [ ] (Opcional, más adelante) endurecer RLS; evaluar Supabase Auth y Storage.

---

## 4. Qué NO se toca en esta migración (para acotar riesgo)
- **Cloudinary** — imágenes siguen igual (URLs). Ideal aprovechar y pasar la foto de Sucursal a subida directa firmada, pero es independiente.
- **Login propio** — se mantiene; solo se agrega hash de contraseña.
- **Integraciones externas** — Shopify sync y Dátil (facturas) no cambian su lógica, solo dónde guardan el resultado.
- **UI** — las pantallas no cambian; las rutas API mantienen su contrato.

---

## 5. Relación con el error "Error al guardar"
Ese error era el límite de 4.5 MB de Vercel al subir la foto en base64, **no** un problema de Sheets. Ya quedó mitigado con compresión en cliente. **Esta migración no depende de ese fix ni al revés.** Supabase sí elimina otra clase de fallos de guardado (cuota de Sheets, colisiones de fila, escrituras concurrentes).

---

## 6. Deuda técnica a corregir durante la migración
Detectada en el mapeo del modelo actual:
1. **Password en texto plano** (USUARIOS.PASSWORD_HASH) → hashear con bcrypt.
2. **Append de `nuevoItem` desalineado** en `pedidos/[id]` (omite `ARCHIVO_DISENO`, 20 vs 21 valores) → en Postgres desaparece (se insertan campos por nombre, no por posición).
3. **`logCambio` con argumentos desordenados** en `pagos/route.js` (usuario/campo mezclados) → corregir al portar.
4. **`VENDEDOR_ID` ambiguo** (a veces nombre, a veces uuid) → normalizar a FK real `usuarios(usuario_id)`.
5. **Columnas placeholder vacías G/H/I en PAGOS** → eliminadas.
6. **Duplicación `DIRECCION_TEXTO`/`DIRECCION_PEDIDO`** → una sola columna `direccion_pedido`.
7. **Contador de PEDIDOS con race condition** → secuencia atómica de Postgres.
8. **IDs por `Date.now()` en SUCURSAL** (posible colisión) → uuid o secuencia.
9. **Tres offsets de fila conviviendo** y hacks de header → desaparecen (ya no hay filas de Sheet).
10. **Bug PATCH `rowIndex+4`** de Sucursal (fila equivocada) → eliminado por completo (UPDATE por PK).

---

## 7. Decisiones (CONFIRMADAS)
- **Estrategia de corte**: ✅ **doble escritura (dual-write)**.
- **Contraseñas**: ✅ **hashear las actuales con bcrypt** (sin forzar reset).
- **DB**: ✅ **un solo proyecto `mandarina-DATA`**, schemas `crm` + `inbox` (ver arquitectura arriba).
- **IDs de negocio**: ✅ conservar `PEDIDO_ID`/`ITEM_ID` con el mismo formato.
- Pendiente menor: región de Supabase y plan (Free alcanza para empezar).

## 8. Estado / handoff (retomar con "SUPERMANDARINA")

### ✅ Hecho (2026-07-12)
- **Proyecto Supabase creado**: `mandarina-DATA` — id **`piingkecjgoisnxccvaa`**, región `sa-east-1` (São Paulo), org "Mandarina Republic" (plan free, $0/mes).
- **Schemas** `crm` e `inbox` creados.
- **Las 11 tablas del CRM** (§2.1) creadas dentro del schema `crm`, con todos los FKs calificados a `crm.*`. Se corrigió el quirk del doc (se crea `pedidos` bien de una vez, sin el drop/recreate).
- **Índices** §2.2 y **secuencia** `crm.pedido_seq` (start 2433) creados.
- **RLS activado** en las 11 tablas (sin políticas). Rationale: la app usa solo `service_role` server-side, que ignora RLS → no rompe nada; y bloquea anon/authenticated si la anon key se filtrara. (Esto adelanta el "endurecer RLS" que estaba para Fase 6.)
- El proyecto viejo `mandarina-inbox` (id `umsdhojdwgzpmwmqojdl`) quedó **vacío y sin usar** (candidato a borrar).

### ✅ Fase 0/1/2 completas
- `@supabase/supabase-js` instalado; env vars en Vercel; `lib/supabase.js` (service_role, server-side, schema `crm`).
- `lib/db/` con repo por entidad (pedidos, clientes, usuarios, pagos, guias, sucursal, catalogo, logs, detalle, facturas, diasEntrega) — ambos backends detrás de `DATA_BACKEND`, patrón dual-write en `_backend.js`.
- `scripts/migrate-sheets-to-supabase.mjs` — backfill idempotente ejecutado. Poblado: usuarios 14, clientes 675, pedidos 268, detalle 520, pagos 285, guias 37, logs 1466, sucursal 77, prod_shopify 429, prod_catalogo 42, dias_entrega 8. Integridad: 0 FKs huérfanas, 0 nulls en FKs.

### ✅ Fase 3 (dual-write + lectura-sombra) — completa
- **Dual-write CABLEADO en TODAS las mutaciones.** ⚠️ Hallazgo clave: los repos `lib/db/*` tenían el dual-write listo pero **las rutas nunca los llamaban para escribir** — seguían usando `appendRow`/`updateRow`/`spreadsheets.values.update` directos a Sheets, así que Supabase solo tenía la foto del backfill. Ya se cablearon todas:
  - `clientes` POST/PATCH → createCliente/updateCliente
  - `productos` POST → addCatalogo
  - `pagos` POST → createPago + recalcPago
  - `sucursal` POST/PATCH → createSucursalProducto/updateSucursalProducto/ajustarStock (corrige bug `rowIndex+4`, deuda #10)
  - `pedidos/item/[id]` PATCH/DELETE → updateItem/updateSubestado/updateNotasArea/updateSubestadoCorte/softDeleteItem; auto-avance DESPACHO via setEstado
  - `pedidos/[id]` PATCH → updatePedido/markImpreso/createGuia/createItem/createPago (createItem incluye ARCHIVO_DISENO, deuda #2)
  - `pedidos` POST → upsertClienteByCedula/createPedido/createItem/createPago (conserva anti-colisión de PEDIDO_ID y webhook META CAPI)
  - `usuarios` POST/PATCH → createUsuario (bcrypt, deuda #1)/updateUsuario
  - `factura-callback` → setFactura; `shopify/sync` → replaceProductosShopify
  - Único pendiente: `shopify/seed` (endpoint temporal §6, a borrar) sigue solo-Sheets.
- Corregido bug en `createPedido`: escribía placeholders de FACTURA en las columnas 22-23 (que son LATITUD/LONGITUD), perdiendo lat/long en Sheets.
- Cerrado el hueco de **logs**: `lib/pedidos.js logCambio` delegaba solo a Sheets; ahora delega en `lib/db/logs` (dual-write). Antes `crm.logs_pedidos` se congelaba tras el backfill.
- **Lectura-sombra** (`SHADOW_READ=1`) en los GET: pedidos.list, clientes.all, usuarios.list, sucursal.list, catalogo.list, shopify.products y logs.byPedido.
- Corregida deuda #3 (orden de args de `logCambio` en pagos) y #1 (bcrypt en alta de usuarios).

> **Nota de consistencia del espejo:** `write()` corre la escritura secundaria (Supabase en Fase 3) como *best-effort no bloqueante*. En flujos multi-paso (p.ej. createPago→recalcPago) el mirror de Supabase puede ir un paso atrás momentáneamente; se auto-corrige en la siguiente escritura, y un backfill final antes del cutover reconcilia cualquier deriva. Sheets sigue siendo la verdad y no se afecta.

### ▶️ Fase 4 (validación / gate al cutover) — en curso
- **`scripts/reconcile-sheets-vs-supabase.mjs`** (nuevo): compara paridad Sheets⇄Supabase (solo lectura) reutilizando las MISMAS transforms del backfill. Chequea conteos, conjuntos de PK, y montos de pedidos + pagos (total y por pedido). El backfill se refactorizó para exportar `TABLES`/clientes/`readSheet` y sólo corre su `main()` si se invoca directo.
  - Correr local con `.env.local`: `node scripts/reconcile-sheets-vs-supabase.mjs [--only=pedidos,pagos] [--verbose]`. Exit 0 = paridad total, 1 = discrepancias.
- **Hallazgo de calidad de datos (pre-existente en Sheets, migrado fiel — NO tocar sin decisión):**
  - 17 pedidos con `monto_pendiente` negativo por **sobrepago** (abonado > total); la app hoy clamparía a 0.
  - 2 pedidos con `monto_abonado ≠ Σpagos`: `MAN-JAC-5093` (abonado 100, pagos 150) y `MAN-JAC-5009` (abonado 15, sin fila de pago).
- Pendiente de Fase 4: correr la reconciliación con credenciales reales y recorrer el checklist de flujos (§4 arriba) antes del cutover.

### ▶️ Schema `inbox` (v1 creado — prep en paralelo, wiring después del CRM)
> ⚠️ **Ver §9 (2026-07-13):** el inbox NO se construye en el CRM. Esta subsección quedó histórica: el schema/backfill/`lib/db/inbox.js` se conservan como INSUMO para migrar la app real (`wa-inbox-v2`), pero las rutas `/api/inbox/*` y la UI se ELIMINARON del CRM.
- **DDL aplicado** (`db/inbox_schema.sql`): tablas `inbox.conversaciones` + `inbox.mensajes` (una cuenta por columna `cuenta='IND'|'MANDI'`), índices, RLS activado (como en crm).
- **Unión CRM ↔ inbox por teléfono resuelta y PROBADA**: vista `crm.cliente_conversacion` + función `inbox.norm_telefono(text)` (toma los últimos 9 dígitos → cruza `09XXXXXXXX` de `crm.clientes.celular` con `5939XXXXXXXX` de WhatsApp). Test end-to-end: conversación `593959263396` unió correctamente al cliente con celular `0959263396`.
- **Capa de datos lista y probada**: `lib/db/inbox.js` + `getSupabaseInbox()` en `lib/supabase.js`.
  - Conversaciones: list/get/upsert (por cuenta+telefono), marcarLeidas, cambiarEstado, asignar.
  - Mensajes: listMensajes (hilo), addMensaje (idempotente por `wa_message_id`).
  - Flujos: `recibirMensaje` (entrante: upsert conv + msg IN + no_leidos++) y `enviarMensaje` (saliente).
  - Puente CRM: `conversacionesConCliente` / `conversacionesDeCliente` (leen la vista).
  - Simulación end-to-end en SQL: hilo ordenado, dedup por wa_message_id, no_leidos, y unión al cliente — todo OK. Datos de prueba borrados.
- **Estructura real conocida** (export del bot): hojas CONTACTOS (51k filas, ~890 reales; el resto vacías) + MENSAJES (12k) + auxiliares (SOCIAL, KB, respuestas rápidas, sesiones, leads, franquicias, ads). Alcance elegido: **solo WhatsApp core** (CONTACTOS + MENSAJES). Cuenta del export: **MANDI**.
- **Backfill listo**: `scripts/migrate-inbox-to-supabase.mjs` — lee CONTACTOS + MENSAJES del Sheet del inbox, idempotente (upsert conv por cuenta+telefono, msgs por mensaje_id). Correr por cuenta:
  `node scripts/migrate-inbox-to-supabase.mjs --cuenta=MANDI --sheet-id=<idInbox>` (y otra vez con `--cuenta=IND`).
- **Rutas API listas** (usan `lib/db/inbox`):
  - `GET /api/inbox/conversaciones` (lista; `conCliente=1` adjunta cliente CRM)
  - `GET /api/inbox/conversaciones/[id]` (conversación + hilo)
  - `POST /api/inbox/conversaciones/[id]/mensajes` (enviar saliente)
  - `PATCH /api/inbox/conversaciones/[id]` (marcar leída / soporte / humano / vincular venta)
  - `POST /api/inbox/webhook` (entrante; payload YA normalizado — el parsing crudo + verificación depende del proveedor).
- **Superposición con el CRM** (sobre ~882 teléfonos del inbox): 17 coinciden con un cliente por teléfono, 13 con `id_venta` (el inbox es mayormente prospectos que aún no compran; `id_venta` es el puente fuerte de los compradores).
- **Backfill server-side listo**: `GET /api/admin/inbox-backfill?key=<CRON_SECRET>&cuenta=&sheetId=` (temporal, a borrar). Corre en Vercel con las creds existentes — no requiere node local. Sheets del inbox (públicos, no hay que compartir nada):
  - MANDI "WhatsAppMandarinaSales": `1ZQ_vIhKsDBnAUjitOB3zP-4MDbdmsv7hdDgnqNbOkak`
  - IND "WhatsAppINDLoversCHAT": `1ObNIff1ypeFW7PfuAjeoiGBJCDyZU4etIsbGpyB-Nqk`  ⚠️ este está como `anyone writer` (editable por cualquiera con el link) — conviene restringirlo.
- **Proveedor identificado = Meta WhatsApp Cloud API** (inspeccionando el escenario Make "EsuchaWhatsAppBusiness"). El flujo LINKPAGO (dLocal Go → Meta) es independiente; el inbox no lo toca.
- **Wiring en vivo LISTO (aditivo, env-gated)**:
  - Webhook Meta-nativo `GET/POST /api/inbox/webhook?cuenta=MANDI|IND` (verificación + parseo del payload real, replicando el mapeo del escenario; dedup por `wa_message_id`).
  - Envío saliente real por Meta desde la UI (`lib/whatsapp.js`), gateado por env; si no está configurado, solo persiste.
  - `mensajes.wa_message_id` (unique) para idempotencia; probado.
- **Pendiente**: desplegar + correr backfill (2 URLs); setear env vars de Meta (`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID_MANDI/_IND`, `WHATSAPP_TOKEN`); agregar en el escenario "Escucha" un módulo HTTP que reenvíe el payload a `/api/inbox/webhook` (o apuntar Meta directo). Canales sociales y backend del bot = fases posteriores.

### ⏳ Pendiente aparte (no bloquea)
- Fix "Error al guardar" (compresión de foto en catálogo): commit local **`5d12d57f` NO pusheado**. Falta `git push origin main`.

---

## 9. 🧠 MEMORIA DE SESIÓN — retomar aquí (act. 2026-07-13)

### 🎯 ALCANCE REAL DE "SUPERMANDADINA" (corregido — manda sobre todo lo demás)
El **único** objetivo es **reemplazar la base de datos de Excel/Google Sheets por Supabase**, para las apps que YA existen, dejándolas funcionando igual:
1. **MANDARINACRM** (este repo) — el CRM. → migración Sheets→Supabase **en curso** (dual-write).
2. **El inbox de WhatsApp** — que vive en repos SEPARADOS, NO en el CRM.

> **Corrección de rumbo (2026-07-13):** en sesiones previas me "pasé de rosca" y construí un inbox DENTRO del CRM (`/dashboard/inbox`, `/api/inbox/*`, envío Meta, etc.). Eso era **redundante** con la app de inbox que el usuario ya tiene. El usuario eligió: **el inbox se queda en su app (wa-inbox-v2); NO se construye inbox en el CRM.** Ese código ya fue **ELIMINADO** del CRM hoy (commit `5e74dea`).

### 📦 Las apps del inbox (repos separados, misma estructura)
- **`mandarinarepublic-ux/wa-inbox-v2`** = inbox **MANDI** (Mandarina). Es la app viva. Clonada en `/workspace/wa-inbox-v2` (en scope de la sesión, `can_push`). Último commit: `ded7648`.
- **`mandarinarepublic-ux/ind-inbox-v2`** = inbox **IND** (repo separado, misma estructura). Aún no clonado.
- (Repos viejos, ignorar: `wainboxmandarina`, `ind-inbox`.)

### Referencias clave
- **Supabase**: proyecto `mandarina-DATA` id `piingkecjgoisnxccvaa` (plan **Pro**). Schemas `crm` + `inbox`.
- **Vercel**: CRM = `mandarina-pro-sales` (`prj_tcRidmjG670ag4jdrPGF4sopj4pq`, team `team_Sk65ztrHF0ybuWBRPQoS0hzp`). El inbox se despliega en su propio proyecto Vercel.
- **Sheets inbox** (públicos): MANDI `1ZQ_vIhKsDBnAUjitOB3zP-4MDbdmsv7hdDgnqNbOkak` ("WhatsAppMandarinaSales"), IND `1ObNIff1ypeFW7PfuAjeoiGBJCDyZU4etIsbGpyB-Nqk` ("WhatsAppINDLoversCHAT", ⚠️ anyone-writer → restringir).
- **Make** (org 6191488): `EsuchaWhatsAppBusiness` (4471276), `IND_ESCUCHA_WHATSAPP` (5471227), `CONSULTA_LINKPAGO` (5304064). ⚠️ Secrets en texto plano en los blueprints (token Meta + API key dLocal) → **rotar**.
- **Proveedor WhatsApp = Meta Cloud API**. phone_number_id MANDI = `1024077200794372`. LINKPAGO = pasarela **dLocal Go**. wa-inbox-v2 envía por Meta directo (`META_TOKEN`/`META_PHONE_ID`) y cae a Make solo si falta el token.

### Track A — CRM (este repo, branch `claude/supermandadina-q1ykfz` → PR #12, NO mergeado)
Sin cambios de rumbo: Fases 0–3 ✅ (dual-write cableado en TODAS las mutaciones + shadow reads + deudas #1/#2/#3/#10 + clamp sobrepagos). Fase 4 tooling ✅ (`/api/admin/reconcile` + script). **Falta**: desplegar PR #12, correr reconcile, cutover (`DATA_BACKEND=supabase`), limpieza Fase 6. ~75%.

### Limpieza del inbox-app del CRM — ✅ HECHA hoy (commit `5e74dea`, pusheado)
- **Borrado**: `app/dashboard/inbox/page.js`, `app/api/inbox/*` (webhook, conversaciones, mensajes), `lib/whatsapp.js`, `lib/inboxAuth.js`, item "Inbox" del nav + entradas en `ROL_PRIORITY` (`app/dashboard/layout.js`), reverse-link "Ver conversación de WhatsApp" en `pedido/[id]`, y env vars WhatsApp/webhook de `.env.example`. `next build` OK.
- **Conservado como INSUMO para migrar el inbox** (no se usa en el CRM, pero es la receta): `db/inbox_schema.sql`, `lib/db/inbox.js`, `scripts/migrate-inbox-to-supabase.mjs`, `app/api/admin/inbox-backfill/route.js`, `getSupabaseInbox()` en `lib/supabase.js`. El schema `inbox` (conversaciones + mensajes + vista `crm.cliente_conversacion` + `inbox.norm_telefono`) YA está aplicado en Supabase.

### Track B — Migrar wa-inbox-v2 (MANDI) Sheets→Supabase — MAPEO ✅, código PENDIENTE
**Cómo usa Sheets hoy** (Service Account; su spreadsheet `SHEET_ID`=1ZQ_ para MANDI):
| Hoja | Uso | Columnas | Escrita por |
|---|---|---|---|
| **MENSAJES** | read tail(3000)+full, append | A=ID(wamid) B=Telefono C=Nombre D=Tipo E=Contenido F=MediaURL G=Fecha H=Direccion(ENTRANTE/SALIENTE) I=MediaID J=RespuestaIA K=FotoIA L=ContextoID | `api/webhook` (entrante), `api/saliente` (saliente) |
| **CONTACTOS** | read full, append+updateCell | A=Telefono B=Nombre C=Alias D=Estado E=WaId F=? G=ModoIA(IA/HUMANO) H=IdVenta I=Notas J=Refuerzo1 K=Refuerzo2 | `lib/contactos` (estado/notas/alias/idVenta/modoIA), webhook (upsert entrante) |
| **RESPUESTAS_RAPIDAS** | read, append/updateRow | A=ID B=Texto C..L=ImagenURL1..10 M=Botones(`\|`) | `lib/respuestas` (CRUD) |
| **SOCIAL** | append | ID,canal,sender_id,sender_id,'',fecha,message,'ATENDIDO','TRUE' | `api/social/saliente` (DMs IG/FB) |
| CRM (read-only, spreadsheet 13MiI4…) | PEDIDOS, DETALLE_PEDIDO, CLIENTES | headers en fila 2, datos fila 4+ | `lib/crm.js` (feature cliente-pedidos + dashboard) |

- Capa de caché `lib/cache.js` (unstable_cache 8–30s) sobre las lecturas de polling. Dashboard combina MANDI+IND vía `readSheetFrom`.
- **Mapeo a Supabase**: MENSAJES→`inbox.mensajes`, CONTACTOS→`inbox.conversaciones` (ambas ya existen). **Faltan 2 tablas**: `inbox.respuestas_rapidas` y `inbox.social` → **decisión: agregarlas** (para no perder funcionalidad). Lectura del CRM: cuando el CRM esté en Supabase, `lib/crm.js` puede leer de `crm.*` en vez del Sheet.

**Plan de migración wa-inbox-v2** (mismo patrón que el CRM): (1) añadir `lib/db/` + cliente Supabase (schema `inbox`) al repo; (2) crear tablas faltantes; (3) dual-write en `webhook`/`saliente`/`contactos`/`respuestas`/`social` (Sheets primario, Supabase espejo, gate por env); (4) backfill (ya existe `migrate-inbox-to-supabase.mjs`, extenderlo a respuestas/social); (5) lectura-sombra → cutover `DATA_BACKEND=supabase`. Luego repetir en **ind-inbox-v2** (misma receta, `cuenta=IND`).

### ⚠️ Decisión de alcance ABIERTA (la última pregunta quedó sin responder directo)
¿Migro **ambos** repos (wa-inbox-v2 + ind-inbox-v2) o **solo wa-inbox-v2** primero? (Objetivo real = que **ninguna** app quede en Excel → tender a ambos, MANDI como plantilla.)

### Notas heredadas (contexto, ya NO son el objetivo)
- El "apagar Make este finde" y "reconstruir el cerebro del bot (IA/LINKPAGO/KB)" eran ideas de sesiones previas fuera del alcance real (solo-BD). El escenario Make `EsuchaWhatsAppBusiness` no ejecuta desde 2026-07-11 23:02 porque el commit "elimina Make" de wa-inbox-v2 repuntó el webhook de Meta hacia esa app (no se perdieron mensajes).
- Seguridad pendiente (independiente): rotar tokens en blueprints de Make; restringir Sheet IND (anyone-writer).

### Endpoints temporales a borrar en Fase 6 (CRM)
`shopify/seed`, `admin/reconcile`, `admin/inbox-backfill`.
