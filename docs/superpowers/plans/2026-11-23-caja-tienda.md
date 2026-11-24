# Caja de la tienda: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cierre de caja diario con arqueo a ciegas para la responsable de la tienda
(Jackeline, `uuid-007`). El excedente sale a sobre o a depósito, y el ADMIN
confirma sobres, depósitos y transferencias en «Por confirmar».

**Architecture:**
- Cinco tablas nuevas en el schema `crm`. No se toca `crm.pagos`: los cobros se
  leen de ahí y el vínculo con cada cierre va en una tabla aparte.
- La aritmética (en centavos) y las reglas van en `lib/caja.js`, que es puro y
  tiene tests.
- Las lecturas y escrituras van en `lib/db/caja.js`.
- Hay dos grupos de rutas: `/api/caja/*`, para la responsable (sesión), y
  `/api/caja/admin/*`, con `requireAdmin`.
- Una sola página, `/dashboard/caja`, con vista de responsable y vista de admin.

**Tech Stack:** Next.js 14 (app router, client pages), Supabase JS (service role vía
`lib/supabase.js`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-caja-tienda-design.md`

## Global Constraints

- Se trabaja en `main`. Antes de cada commit, `git status -sb`, y solo se hace
  `git add` de los archivos de la tarea. Nunca `git add -A` ni `commit -a`: puede
  haber trabajo de otra sesión sin commitear.
- Supabase `piingkecjgoisnxccvaa`, schema `crm`. La migración se aplica con
  `apply_migration`, que la registra en `supabase_migrations.schema_migrations`.
  El archivo va en `docs/sql/`, con RLS activado y sin políticas (solo
  service_role), como `2026-11-19-depositos-pasarela.sql`.
- Montos en **centavos enteros** dentro de `lib/caja.js`; en la base van como
  `numeric(10,2)`. En la UI se usa `components/InputDinero.js`. El servidor lee
  con `leerDecimal` de `lib/decimal.js` y rechaza valores negativos o NaN.
- Fechas: se guardan como `timestamptz` y se muestran con `formatFechaCorta` /
  `formatFechaDia` de `lib/parseFecha.js`, en hora de Ecuador. Nunca hacer
  `split` del ISO.
- Valores por defecto de la caja: `fondo_fijo` **20.00**, `tolerancia` **5.00**.
- Cobro en efectivo = fila de `crm.pagos` con `tipo='EFECTIVO'`,
  `estado='PAGADO'`, `vendedor_id = caja.responsable_usuario_id` y
  `fecha >= caja.inicio`, que no esté en un cierre vigente.
- Transferencia por confirmar = igual, pero con `tipo='TRANSFERENCIA'` y sin fila
  en `crm.verificaciones_banco`.
- **Arqueo a ciegas:** ninguna respuesta de la API para la responsable incluye
  esperado, cobros, montos ni diferencia del período abierto antes de que el
  conteo quede guardado.
- Confirmar o marcar «no llegó» **no** cambia `crm.pagos` ni el pedido.
- Los textos de la UI van en español de Ecuador, con tuteo.
- Al leer de PostgREST se pagina con `.range()` (tope de 1000) o se agrega en SQL.

## Review Focus

1. **Doble toque en «Guardar conteo»:** no se crean dos cierres. Lo impide un
   índice único parcial (un solo cierre `CONTADO` por caja) y la ruta devuelve
   409. Test en la Tarea 4.
2. **Un cobro registrado mientras ella cuenta o después de contar:** entra en el
   cierre siguiente. Los pagos se fijan en `cierre_pagos` en el instante del
   conteo. Test de `seleccionarCobros` en la Tarea 2.
3. **Un pago de un cierre ya firmado se edita o se borra:** el cierre no cambia y
   el admin ve un aviso. Test de `pagosCambiados` en la Tarea 2.
4. **Contó menos que el fondo fijo:** excedente 0, no se permite sacar nada, y la
   apertura del cierre siguiente es igual a lo contado. Test en la Tarea 2.
5. **Montos escritos con coma o con valores raros** (`"55,98"`, `"-3"`, `"abc"`,
   un excedente mayor al permitido): el servidor normaliza o devuelve 400 con un
   mensaje claro. Tests de `validarMonto` y `validarSalidaExcedente` en la Tarea 2.

---

### Task 1: Tablas de la caja + caja de Jackeline

**Files:**
- Create: `docs/sql/2026-11-23-caja-tienda.sql`

**Interfaces:**
- Produces:
  - **`crm.cajas`:** `id bigint identity pk`, `nombre text`,
    `responsable_usuario_id text not null`, `fondo_fijo numeric(10,2) default 20`,
    `tolerancia numeric(10,2) default 5`, `activa bool default true`,
    `inicio timestamptz null` (lo fija el arranque), `creado_en`.
  - **`crm.cierres_caja`:**
    - Identificación: `id`, `caja_id fk`, `tipo text check in ('ARRANQUE','NORMAL')`,
      `estado text check in ('CONTADO','CERRADO','REABIERTO')`.
    - Montos: `apertura`, `cobros_efectivo`, `salidas`, `esperado`, `contado`,
      `diferencia` (todos `numeric(10,2)`). `motivo text`.
    - Firma: `contado_en timestamptz default now()`, `cerrado_en`, `firmado_por`,
      `firmado_por_nombre`.
    - Reapertura: `reabierto_por`, `reabierto_en`.
    - Índice único parcial `(caja_id) where estado='CONTADO'`.
  - **`crm.cierre_pagos`:** `cierre_id fk`, `pago_id text`, `monto numeric(10,2)`
    (copia al momento del conteo), `pedido_id text`, pk `(cierre_id, pago_id)`.
  - **`crm.movimientos_caja`:**
    - Identificación: `id`, `caja_id fk`, `cierre_id fk null`,
      `tipo text check in ('SALIDA','SOBRE','DEPOSITO','REPOSICION')`.
    - Datos: `monto numeric(10,2) check (monto > 0)`, `motivo text`,
      `foto_url text`, `creado_por`, `creado_por_nombre`, `creado_en`.
    - Confirmación: `confirmacion text check in ('PENDIENTE','OK','NO_CUADRA')
      default 'PENDIENTE'`, `monto_confirmado`, `confirmado_por`, `confirmado_en`.
  - **`crm.verificaciones_banco`:** `pago_id text pk`,
    `resultado text check in ('LLEGO','NO_LLEGO')`, `verificado_por`,
    `verificado_por_nombre`, `verificado_en`.
  - Seed: una fila en `crm.cajas` (`'Tienda'`, `'uuid-007'`, inicio null), y
    `'CAJA'` agregado a `crm.usuarios.accesos` de `uuid-007`.

- [ ] **Step 1: Escribir el SQL.** Usa `create table if not exists`, los índices
  del Produces y `enable row level security` en las 5 tablas. El seed va con
  `insert … where not exists`, y el acceso con `array_append` solo si no está.
- [ ] **Step 2: Aplicar** con `apply_migration`, nombre `crm_2026_11_23_caja_tienda`.
- [ ] **Step 3: Verificar.** Con `execute_sql`, `select * from crm.cajas` debe
  devolver 1 fila con `responsable_usuario_id='uuid-007'`, y
  `select accesos from crm.usuarios where usuario_id='uuid-007'` debe contener `CAJA`.
- [ ] **Step 4: Commit** de `docs/sql/2026-11-23-caja-tienda.sql`, con el mensaje
  `feat(caja): tablas de la caja de la tienda`.

### Task 2: Reglas puras de la caja

**Files:**
- Create: `lib/caja.js`
- Test: `tests/caja.test.js`

**Interfaces:**
- Produces (todos los montos en **centavos enteros**; `aCentavos(n)` y
  `aDolares(c)` convierten):
  - `aCentavos(numOrString) -> number` y `aDolares(c) -> number` (2 decimales).
  - `validarMonto(texto, { permitirCero=false }) -> { ok:true, centavos } | { ok:false, error }`.
  - `calcularCierre({ aperturaC, cobrosC:number[], salidasC:number[], contadoC, fondoFijoC, toleranciaC }) -> { cobrosEfectivoC, salidasC, esperadoC, diferenciaC, estado:'CUADRA'|'DENTRO'|'FUERA', requiereMotivo:boolean, excedenteC }`
    - `diferenciaC = contadoC − esperadoC`.
    - `FUERA` si `|dif| > toleranciaC`.
    - `excedenteC = max(0, contadoC − fondoFijoC)`.
  - `calcularArranque({ contadoC, fondoFijoC }) -> { excedenteC }`.
  - `validarSalidaExcedente({ montoC, excedenteC }) -> null | string`. Acepta
    `0 ≤ monto ≤ excedente`.
  - `aperturaSiguiente({ contadoC, salidaC, reposicionesC:number[] }) -> number`
    = `contado − salida + Σ reposiciones`.
  - `seleccionarCobros(pagos, { responsableId, inicioIso, yaEnCierre:Set }) -> pagos[]`.
    Aplica el filtro de cobro en efectivo de Global Constraints y quita los que
    están en `yaEnCierre`.
  - `pagosCambiados(snapshot:[{pago_id,monto}], actuales:Map<pago_id,{monto,tipo,estado}>) -> [{ pago_id, motivo:'BORRADO'|'MONTO'|'YA_NO_EFECTIVO' }]`.
  - `textoDiferencia(diferenciaC) -> 'Cuadra' | 'Falta $X,XX' | 'Sobra $X,XX'`.

- [ ] **Step 1: Escribir los tests que fallan.** Usar exactamente estos valores:
  - `calcularCierre` con apertura 2000, cobros [3598], salidas [], contado 5598,
    fondo 2000, tolerancia 500 → esperado 5598, diferencia 0, `CUADRA`,
    excedente 3598.
  - El martes del ejemplo: apertura 2000, cobros [1800,1500,1900], salidas [300],
    contado 6100 → esperado 6900, diferencia −800, `FUERA`, `requiereMotivo`
    true, excedente 4100.
  - Diferencia −500 → `DENTRO` (borde: 5,00 exacto no pide motivo).
  - Contado 1500 con fondo 2000 → excedente 0;
    `validarSalidaExcedente({montoC:100, excedenteC:0})` devuelve un error;
    `aperturaSiguiente({contadoC:1500, salidaC:0, reposicionesC:[500]})` = 2000.
  - `validarMonto('55,98')` = 5598; `validarMonto('30.75')` = 3075;
    `validarMonto('-3')`, `validarMonto('abc')` y `validarMonto('')` → ok false;
    `validarMonto('0', {permitirCero:true})` = 0.
  - `seleccionarCobros`:
    - Excluye una TRANSFERENCIA, un EFECTIVO `PENDIENTE`, uno de otro
      `vendedor_id` y uno con fecha anterior a `inicioIso`.
    - Excluye también uno que está en `yaEnCierre`.
    - Incluye uno registrado a las 01:58Z del día siguiente (cobro tarde → entra).
  - `pagosCambiados`: un pago borrado → `BORRADO`; monto 20→15 → `MONTO`; tipo
    cambiado a TRANSFERENCIA → `YA_NO_EFECTIVO`; sin cambios → `[]`.
  - `textoDiferencia(-800)` = `'Falta $8,00'`; `textoDiferencia(0)` = `'Cuadra'`.
- [ ] **Step 2: Correr** `node --test tests/caja.test.js`. Esperado: FAIL (no existe el módulo).
- [ ] **Step 3: Implementar `lib/caja.js`** con imports relativos
  (`./decimal.js`). No accede a la base.
- [ ] **Step 4: Correr** `npm test`. Esperado: todo PASS.
- [ ] **Step 5: Commit** de `lib/caja.js` y `tests/caja.test.js`, con el mensaje
  `feat(caja): reglas puras del cierre`.

### Task 3: Repositorio de la caja

**Files:**
- Create: `lib/db/caja.js`

**Interfaces:**
- Consumes: `getSupabase()` de `lib/supabase.js`; Task 2 (`seleccionarCobros`).
- Produces. Todas lanzan `Error(message)` si Supabase falla, y los montos salen
  como `Number` en dólares:
  - `cajaDeResponsable(usuarioId) -> caja | null`, solo si está activa.
  - `cajaPorId(id) -> caja | null`.
  - `listarCajas() -> caja[]`.
  - `actualizarCaja(id, { fondo_fijo?, tolerancia? }) -> caja`.
  - `cierreAbierto(cajaId) -> cierre | null` (estado `CONTADO`).
  - `ultimoCierreCerrado(cajaId) -> cierre | null`.
  - `listarCierres(cajaId, { limite=60 }) -> cierre[]`, del más nuevo al más
    viejo, sin `REABIERTO`.
  - `cobrosPendientes(caja) -> pago[]`. Lee de `crm.pagos` paginando con
    `.range()`, con el filtro de responsable, tipo, estado y fecha; quita los
    `pago_id` que están en `cierre_pagos` de cierres no `REABIERTO`.
  - `movimientosSinCierre(cajaId, tipo) -> mov[]`, para `SALIDA` y `REPOSICION`.
  - `crearCierreContado({ caja, tipo, aperturaC, cobros, salidas, contadoC, calc, usuario }) -> cierre`.
    Inserta el cierre, las filas de `cierre_pagos` y pone `cierre_id` a las
    salidas. Si el índice único choca (código `23505`), lanza
    `Object.assign(new Error('Ya hay un conteo guardado sin cerrar'), { status: 409 })`.
  - `cerrarCierre(cierreId, { motivo, salida:{ tipo:'SOBRE'|'DEPOSITO', montoC, fotoUrl } | null, usuario }) -> cierre`.
    Crea el movimiento con `cierre_id` y deja el estado en `CERRADO`. En un
    `ARRANQUE` también fija `cajas.inicio = cierre.contado_en`.
  - `crearMovimiento({ cajaId, tipo, montoC, motivo, fotoUrl, usuario }) -> mov`.
  - `ponerFotoMovimiento(movId, fotoUrl, usuarioId) -> mov`. Solo si el
    movimiento es de su caja y no tiene foto.
  - `porConfirmar(caja) -> { movimientos: mov[], transferencias: pago[] }`.
    Movimientos `SOBRE`/`DEPOSITO` en `PENDIENTE`, y transferencias desde
    `caja.inicio` sin fila en `verificaciones_banco`.
  - `confirmarMovimiento(movId, { resultado:'OK'|'NO_CUADRA', montoRealC?, admin })`.
  - `verificarTransferencia(pagoId, { resultado:'LLEGO'|'NO_LLEGO', admin })`.
  - `transferenciasNoLlegaron(caja) -> pago[]`.
  - `reabrirCierre(cierreId, admin)`. Pasa el estado a `REABIERTO`, libera
    `cierre_pagos` y `cierre_id` de las salidas, y anula el movimiento de salida
    de ese cierre si sigue `PENDIENTE`. Si ya fue confirmado, lanza 409 con el
    mensaje `'El sobre/depósito ya fue confirmado'`.
  - `snapshotYActuales(cajaId, { limite=60 }) -> { snapshot, actuales:Map }`,
    para `pagosCambiados`.

- [ ] **Step 1: Implementar** siguiendo `lib/db/depositosPasarela.js` (COLS
  explícitos y `Number()` en los montos). Las escrituras en varias tablas van en
  orden y, si falla un paso, se borra lo insertado en ese mismo request.
- [ ] **Step 2: Verificar contra la base**, sin escribir datos reales. Correr un
  script en el scratchpad que llame `cajaDeResponsable('uuid-007')` y
  `cobrosPendientes(caja)`. Con `inicio` null todavía, el resultado tiene que ser
  `[]`. Comparar con `execute_sql`.
- [ ] **Step 3: Commit** de `lib/db/caja.js`, con el mensaje
  `feat(caja): repositorio Supabase`.

### Task 4: API de la responsable

**Files:**
- Create: `app/api/caja/route.js`
- Create: `app/api/caja/cierre/route.js`
- Create: `app/api/caja/movimiento/route.js`
- Create: `app/api/caja/movimiento/[id]/foto/route.js`
- Test: `tests/caja-respuestas.test.js`

**Interfaces:**
- Consumes: `usuarioDeSesion()` de `lib/auth.js`; Tasks 2 y 3.
- Produces (todas con `export const dynamic='force-dynamic'`, 401/403 desde
  `usuarioDeSesion`, y 404 `{error:'No tienes una caja asignada'}` si
  `cajaDeResponsable` es null):
  - `GET /api/caja` → `{ caja:{id,nombre,fondo_fijo,tolerancia}, necesitaArranque:boolean, pendienteCerrar: cierre|null, salidasDelDia: mov[], cierres: cierre[] (últimos 14, completos con sus pagos), sinFoto: mov[] (DEPOSITO sin foto) }`.
    - **No incluye** `cobrosPendientes` ni montos del período abierto.
    - `pendienteCerrar` es el cierre `CONTADO`, que ya se puede ver completo
      porque el conteo quedó guardado.
  - `POST /api/caja/cierre {contado}`:
    - Si la caja no tiene `inicio`, el tipo es `ARRANQUE` (apertura 0, sin
      cobros, esperado = contado).
    - Si no, es `NORMAL`: apertura = `aperturaSiguiente` del último cerrado,
      cobros = `cobrosPendientes`, salidas = `movimientosSinCierre(SALIDA)`.
    - Responde `{ cierre, calc }`.
  - `PATCH /api/caja/cierre {cierreId, motivo?, salida?:{tipo,monto,fotoUrl?}}`:
    - 400 si `calc.requiereMotivo` y `motivo` viene vacío.
    - 400 con el texto de `validarSalidaExcedente` si la salida no es válida.
    - Responde `{ cierre }`.
  - `POST /api/caja/movimiento {monto, motivo, fotoUrl?}` → crea una `SALIDA`
    (motivo obligatorio, de 3 a 200 caracteres).
  - `POST /api/caja/movimiento/[id]/foto {fotoUrl}` → foto de la papeleta
    después del cierre.
  - En `lib/caja.js`, nueva función pura
    `respuestaResponsable({ caja, necesitaArranque, pendienteCerrar, salidas, cierres, sinFoto }) -> objeto`.
    Arma la respuesta del GET: es la lista blanca de campos. Así, el test
    garantiza que no se cuela el esperado del período abierto.

- [ ] **Step 1: Escribir el test que falla.**
  `respuestaResponsable` con datos de ejemplo debe cumplir:
  - Las claves raíz son exactamente las del Produces.
  - `JSON.stringify` del resultado no contiene `esperado` cuando
    `pendienteCerrar` es null.
  - Contiene `esperado` cuando hay un cierre `CONTADO`.
- [ ] **Step 2: Correr** `node --test tests/caja-respuestas.test.js`. Esperado: FAIL.
- [ ] **Step 3: Implementar `respuestaResponsable` y las 4 rutas.** El usuario
  se identifica con `{ id: usuario.USUARIO_ID, nombre: usuario.NOMBRE }`. Los
  errores con `status` se devuelven con ese status y el resto con 500, como en
  `app/api/pagos/[id]/transferencia/route.js`.
- [ ] **Step 4: Correr** `npm test` (PASS) y `npx next build`. Esperado:
  «Compiled successfully».
- [ ] **Step 5: Commit** de los 5 archivos, más `lib/caja.js` si cambió, con el
  mensaje `feat(caja): API del cierre para la responsable`.

### Task 5: API del admin

**Files:**
- Create: `app/api/caja/admin/route.js`
- Create: `app/api/caja/admin/accion/route.js`

**Interfaces:**
- Consumes: `requireAdmin(req)`; Tasks 2 y 3.
- Produces:
  - `GET /api/caja/admin?cajaId=` (sin `cajaId`, toma la primera caja activa) →
    `{ cajas, caja, porConfirmar:{movimientos, transferencias}, noLlegaron, cierres (60, con pagos y flag fueraTolerancia), avisos: pagosCambiados[] con pedido_id y fecha del cierre, abierto:{ cobrosC, salidasC, aperturaC } }`.
    El admin sí puede ver el período abierto.
  - `POST /api/caja/admin/accion {accion, ...}` con:
    - `confirmar-movimiento {movId, resultado, montoReal?}`. `montoReal` es
      obligatorio si el resultado es `NO_CUADRA`.
    - `verificar-transferencia {pagoId, resultado}`.
    - `reabrir {cierreId}`.
    - `reposicion {cajaId, monto, motivo?}`.
    - `ajustes {cajaId, fondo_fijo, tolerancia}`, con valores entre 0 y 500.
    - Cualquier otra acción → 400 `'Acción no reconocida'`.
  - El admin se identifica con `{ id: auth.usuario.USUARIO_ID, nombre: auth.usuario.NOMBRE }`.

- [ ] **Step 1: Implementar las 2 rutas.**
- [ ] **Step 2: Correr** `npm test` y `npx next build`. Esperado: PASS / «Compiled successfully».
- [ ] **Step 3: Commit** con el mensaje `feat(caja): API del admin (por confirmar, reabrir, ajustes)`.

### Task 6: Pantalla de la responsable

**Files:**
- Create: `app/dashboard/caja/page.js`
- Create: `components/caja/VistaResponsable.js`
- Modify: `app/dashboard/layout.js:38`. Agregar
  `{ href:'/dashboard/caja', label:'Caja', icon:'💵', roles:['ADMIN'], oAcceso:'CAJA' }`
  antes de «Reporte de pagos».

**Interfaces:**
- Consumes: `GET/POST/PATCH /api/caja*` (Task 4), `InputDinero`, `subirFoto`
  de `lib/subirImagen.js`, `formatFechaCorta`, `textoDiferencia`.
- Produces: `page.js` muestra `VistaAdmin` (Task 7) si el rol es ADMIN y
  `VistaResponsable` si no.

`VistaResponsable` sigue el estilo oscuro de las otras pantallas del CRM y tiene
estos estados:

1. **`necesitaArranque`:**
   - Título «Arranque de caja».
   - Texto: «Cuenta todo el efectivo que hay en el cajón. Deja $20 de fondo y lo
     demás va a un sobre para Rodrigo.»
   - Un input y el botón «Guardar conteo».
   - Después de guardar: «Al sobre: $X», un monto editable (máximo el
     excedente) y el botón «Cerrar arranque».
2. **Sin conteo pendiente:**
   - Título «Cierre de hoy».
   - Un solo input, «¿Cuánto contaste en billetes y monedas?», y el botón
     «Guardar conteo». No se muestra ningún monto del día.
   - Debajo, «Salidas de hoy» con «+ Anotar salida» (monto, motivo, foto
     opcional) y la lista de salidas.
3. **`pendienteCerrar`:**
   - El ticket del cierre: abrió con, cobros con cada `pedido_id` y monto,
     salidas, debería haber, contó, y una pastilla `textoDiferencia` (verde si
     cuadra, ámbar si está dentro de la tolerancia, rojo si está fuera).
   - Si está fuera, el campo «¿Qué pasó?» es obligatorio.
   - Si el cobro más antiguo es de un día de Ecuador anterior al del conteo, se
     muestra «Incluye cobros desde el 22 Nov: ese día no se cerró la caja».
   - Si la apertura es menor que el fondo fijo, se muestra en rojo «Abrió con
     menos de $20».
   - «¿Qué haces con el excedente?» con dos botones: «💵 A sobre» y
     «🏦 Depositado/transferido». El monto viene prellenado con el excedente y
     es editable. La foto es opcional en el momento.
   - El botón «Cerrar caja».
4. **Historial:** los últimos 14 cierres, tocables, con la misma presentación
   del ticket. Los depósitos sin foto muestran el botón «📷 Subir papeleta».

- [ ] **Step 1: Implementar** `page.js`, `VistaResponsable.js` y la entrada del
  menú. El botón «Guardar conteo» se deshabilita mientras el pedido está en
  vuelo, y un 409 recarga el estado.
- [ ] **Step 2: Correr** `npx next build`. Esperado: «Compiled successfully».
- [ ] **Step 3: Commit** con el mensaje `feat(caja): pantalla de cierre para la responsable`.

### Task 7: Pantalla del admin

**Files:**
- Create: `components/caja/VistaAdmin.js`

**Interfaces:**
- Consumes: `GET /api/caja/admin`, `POST /api/caja/admin/accion` (Task 5).

Tiene tres pestañas:

1. **«Por confirmar»:** una lista única ordenada por fecha.
   - Cada sobre trae «✓ Recibido» y «✗ No cuadra». «No cuadra» pide el monto que
     había.
   - Cada depósito trae «✓ Llegó» y «✗ No cuadra», y un link a la foto.
   - Cada transferencia trae «✓ Llegó» y «✗ No llegó», más su `pedido_id` y el
     link a la ficha (`/dashboard/pedido/[id]`).
   - Debajo, «No llegaron» en rojo y los avisos de `pagosCambiados`.
2. **«Cierres»:** tabla por día con abrió, cobros, salidas, esperado, contó,
   diferencia (en rojo si está fuera), motivo, salida (tipo y monto) y estado de
   confirmación. Al tocar una fila se abre el ticket completo con el botón
   «Reabrir». La reapertura usa una confirmación en línea, sin `confirm()`.
   Arriba, el período abierto: «Desde el último cierre: cobros $X · salidas $Y».
3. **«Ajustes»:** fondo fijo, tolerancia y el botón «+ Reposición de fondo».

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Correr** `npx next build`. Esperado: «Compiled successfully».
- [ ] **Step 3: Commit** con el mensaje `feat(caja): pantalla del admin`.

### Task 8: Prueba en producción con una caja de prueba

**Files:** ninguno (solo datos).

- [ ] **Step 1: Subir el código.** `git status -sb` y luego `git push origin main`.
  Esperar a que Vercel `mandarina-pro-sales` quede en `READY` para el commit.
- [ ] **Step 2: Crear una caja de prueba.** Con `execute_sql`, crear
  `crm.cajas ('PRUEBA', <usuario_id del ADMIN que prueba>)`, y agregar
  `'CAJA'` a sus accesos solo si hace falta. No usar la caja de Jackeline.
- [ ] **Step 3: Recorrer el flujo** en `crm.apps.mandarinaec.com/dashboard/caja`
  con esa caja:
  - Arranque con $50 → al sobre $30.
  - Registrar un pago EFECTIVO de $1 en un pedido de prueba.
  - Guardar el conteo con $20: antes de guardar no se ve ningún monto, y después
    sale «Falta $1,00», dentro de la tolerancia.
  - Cerrar y verificar en «Por confirmar» el sobre del arranque.
  - Doble toque en «Guardar conteo» → un solo cierre.
- [ ] **Step 4: Limpiar.** Pasar la caja PRUEBA a `activa=false`. **Antes de
  borrar cualquier fila o pago de prueba, preguntarle a Rodrigo.**
- [ ] **Step 5: Avisar a Rodrigo.** Jackeline ya puede hacer el arranque desde
  su usuario (menú «💵 Caja»). Actualizar `docs/ESTADO-CRM.md` con una línea
  del módulo y hacer commit.
