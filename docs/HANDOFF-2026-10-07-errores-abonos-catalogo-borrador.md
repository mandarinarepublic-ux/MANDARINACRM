# HANDOFF · 7-oct-2026 · errores, abonos, tipos de prenda y borrador del pedido

Sesión pedida como «revisa los errores del CRM», que acabó en cinco cambios en
producción. El estado vivo está en `docs/ESTADO-CRM.md`; las lecciones, en la
skill `/crm-mandarina`. Esto es lo que pasó y por qué.

## 1. Historial: «Bad Request» al buscar con 1-2 caracteres — `a17f36e`

- **Cómo se encontró:** `crm.eventos_sistema` agrupado (no Vercel, que daba
  CERO: el CRM atrapa el error y lo registra). 75 eventos desde el 18-sep, 69
  abiertos, todos con `params.q` de un carácter (`6` = 52 veces).
- **Causa medida:** los ids de cliente que coinciden iban en la URL
  (`cliente_id.in.(…)`). `6` → 979 clientes → ~26 KB; `0` → 1249 → ~33 KB.
- **Arreglo:** `lib/historial-busqueda.js` — <3 caracteres busca solo el número;
  nunca más de 200 ids. Pruebas: `tests/historial-busqueda.test.js`.
- ⚠️ **No probado en vivo** (Chrome desconectado). Comprobar: 
  `select count(*) from crm.eventos_sistema where mensaje like 'El Historial fallo%Bad Request%' and fecha > '2026-10-08'` = 0.
  Si da 0, marcar resueltos los 69 viejos.

## 2. Corregir abonos, solo ADMIN — `c8a2e71`

Rodrigo: «si cometo un error en ABONO no lo puedo editar… solo para el admin».

- ✏️ por pago en el detalle del pedido → tipo / monto / notas, o eliminar.
- `PATCH·DELETE /api/pagos/[id]` con `requireAdmin` → `recalcPago` →
  `logCambio` con el antes y el después (`PAGO_EDITADO` / `PAGO_ELIMINADO`).
- No hay papelera: **la bitácora es lo único que queda** de un pago borrado
  (incluye la URL del comprobante).
- Se revisó antes: sin triggers en `crm.pagos`, nada externo (Dátil, CAPI,
  dLocal) cuelga de una fila de pago.

## 3. Tipos de prenda: limpieza en la base (sin commit, SQL directo)

346 activos → **194**. En UNA transacción con conteos que la cancelan si no
cuadran:

| acción | cuántos | qué |
|---|---|---|
| borrar | 75 | nunca usados (`BZUO`, `CAMISETA JWTSEYV`, notas de pedido…) |
| desactivar | 77 | mal escritos con uso (`HODIE PREMIUM` 37 usos/60 d, `HOODIE PEEMIUM` 12…), descripciones metidas como tipo, y **28 de personajes** a pedido de Rodrigo («se supone que no deberían hacerlo los vendedores») |
| renombrar | 4 | BOLSO DE LIENZO, CAMISA SUBLIMADA, JOGGER BASTAS RECTAS, ROMPEVIENTO CON REFLECTIVO CON CIERRE |

- Respaldo: `crm.respaldo_productos_catalogo_20261007` (351 filas, con RLS).
- El primer intento se canceló solo: la lista tenía 77 y el chequeo decía 78
  (error mío al contar). No se aplicó nada a medias.
- **Sin decidir:** `DZ` (¿Dragon Ball Z?), selecciones (ARGENTINA 33 usos,
  BRASIL, PORTUGAL), `CAMISETA NORMAL` vs `CAMISETA`, `CAMISETA TELA JERSEY` vs
  `CAMISETA JERSEY`, `POLO` vs `CAMISETA POLO`. `ENVIO`/`SERVIENTREGA` se
  quedan (cobran el envío como línea).
- ⚠️ Las ventas viejas conservan el nombre mal escrito: un reporte por producto
  ve `HODIE PREMIUM` aparte. Unirlas = UPDATE a `detalle_pedido`, no hecho.

## 4. El buscador de tipo de prenda — `f40e92b` (confirmado por Rodrigo)

- **Causa de la basura:** «Crear» iba primero y resaltado → `HOODIE PREM` +
  Enter creaba «HOODIE PREM».
- Ahora: Enter elige la coincidencia, «Crear» al final, «¿Quisiste decir…?»
  (`lib/tiposParecidos.js`), **solo ADMIN crea** (UI + `requireAdmin` en
  `POST /api/productos`), y crear uno desactivado ya no lo reactiva (el upsert
  ponía `activo=true`).
- **La barra de bajar no se veía** (gris oscuro sobre gris; en el celular no
  existe): pie «↓ N más · desliza para ver» + barra visible `.lista-desplegable`.

## 5. Pedido nuevo: refrescar no borra lo llenado — `e862e7d` (confirmado por Rodrigo)

Rodrigo: en el celular, bajar con el dedo refrescaba y había que meter todo de
nuevo; pidió un mensaje antes de refrescar.

- **Un mensaje propio ANTES de refrescar no es posible**: `beforeunload` solo
  muestra el texto fijo del navegador. Se hizo en tres capas:
  1. `overscroll-behavior-y: contain` (página + contenedor que se desliza).
  2. `beforeunload` con trabajo pendiente.
  3. Borrador en localStorage → al volver: «¿Deseas volver a llenar el pedido?».
- Por usuario; dentro del inbox, por cliente. Vence a las 12 h. Lo precargado
  (nombre/celular del inbox, cliente YAW) no cuenta como trabajo.
- El comprobante en base64 no se guarda (puede pesar más que localStorage): se avisa.
- ☠️ Se borra al crear el pedido, ANTES de navegar (y `creadoRef` frena el
  guardado pendiente): si no, se ofrecería recuperar un pedido ya creado.
- La fecha de entrega recuperada no se pisa con la mínima (`saltarFechaRef`).

## Lo que quedó vivo

| qué | cómo se cierra |
|---|---|
| Historial: confirmar cero «Bad Request» nuevos | la consulta del punto 1; luego resolver los 69 |
| Corregir un abono de verdad | corregir uno y ver `PAGO_EDITADO` en la bitácora |
| Decisiones del catálogo (DZ, selecciones, CAMISETA NORMAL…) | Rodrigo |
| «Pauta IndStore no está entregando» (6-oct, $0) | no es del CRM: mirar la cuenta de anuncios |
| `pauta_dia` a 683/tienda, cruza 1000 ~15-nov | `.range()` en `lib/pauta/consultas.js` |
