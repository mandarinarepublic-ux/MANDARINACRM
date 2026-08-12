# Botón "Generar FACTURA SRI" en la pantalla del pedido

**Fecha:** 11-ago-2026
**Estado:** aprobado, pendiente de implementar

## El problema

`MAN-AND-5601` (11-ago 23:10 UTC, $35,00) pidió factura y no la tiene. No hubo error en
ningún lado: ni en Dátil, ni en Vercel, ni en `crm.eventos_sistema`.

La causa está verificada: **la factura no la emite el servidor, la emite el navegador**.
`POST /api/pedidos` crea el pedido y marca `factura_solicitada`, pero la emisión es una
SEGUNDA petición que sale del celular del vendedor —`dispararFactura()` en
`app/dashboard/nuevo-pedido/page.js:559`, llamada **sin `await`** y seguida a los
milisegundos por `router.push` (línea 587). Si el celular se interrumpe en ese instante,
la petición muere sin dejar rastro y el servidor nunca se entera de que había que facturar.

Evidencia en los logs de Vercel (producción, `mandarina-pro-sales`):

| Pedido | POST /api/pedidos | POST /api/factura/emitir | Factura |
|---|---|---|---|
| MAN-AND-5598 | 21:34:23 | 21:34:27 | sí |
| MAN-AND-5599 | 21:42:45 | 21:42:49 | sí |
| **MAN-AND-5601** | **23:10:34** | **nunca llegó** | **no** |
| MAN-AND-5602 | 23:31:22 | 23:31:26 | sí |

10 de 14 pedidos con factura pedida se emitieron bien desde que `DATIL_DIRECTO` está
activo. No es un sistema roto: es un volado que casi siempre cae bien.

**Este spec NO arregla esa causa.** Arregla el rescate manual. Las capas que sí atacan la
causa (que el servidor emita, y un reintento automático) quedan pendientes y se tratan
aparte.

## El hallazgo que cambia el trabajo

El botón que se pedía **ya existe** en `app/dashboard/pedido/[id]/page.js:797`, con su
spinner y su mensaje de éxito. Está muerto porque su condición es:

```js
pedido.EMITIR_FACTURA === 'TRUE'
```

y la API **nunca devuelve `EMITIR_FACTURA`**. El mapeador que alimenta esa pantalla
(`lib/db/pedidos.js:50-82`, `pedidoSupToSheet`) devuelve `FACTURA_SOLICITADA`.
`EMITIR_FACTURA` aparece en exactamente **2 líneas de todo el repo** —las dos en esa
pantalla— y nadie lo escribe nunca. O sea `undefined === 'TRUE'` → falso siempre.

Consecuencias verificadas:
- el botón "🧾 Emitir factura" **nunca se dibuja**
- el aviso "⏳ Factura en proceso… (llega en 5–30 seg)" (línea 447) **tampoco**

Es la misma familia de bug que el de las fotos entrantes y el de los audios del inbox: la
pantalla mirando un campo que nadie llena.

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Alcance de esta entrega | Solo el botón, bien hecho |
| Quién puede apretarlo | Solo `ADMIN` |
| Pedidos que NO pidieron factura | Sí aparece, pero gris y discreto |
| Tras emitir con éxito | Recargar el pedido (`loadPedido()`) |

## Diseño

### 1. Corregir el campo muerto

`pedido.EMITIR_FACTURA` se usa en dos sitios y cada uno tiene un destino distinto:

- **línea 797** (el botón): pasa a leer `pedido.FACTURA_SOLICITADA`
- **línea 447** (el aviso "en proceso"): se **borra** el bloque entero (ver punto 2)

Leerlo con tolerancia, no comparando crudo:

```js
const pidioFactura = String(pedido.FACTURA_SOLICITADA ?? '').toUpperCase() === 'TRUE'
```

`boolStr` (`lib/db/_backend.js:74`) devuelve `'TRUE'`/`'FALSE'`, así que hoy la
comparación cruda funcionaría. El `toUpperCase()` es para que el día que la columna llegue
como booleano real o como `'true'` minúscula, la pantalla no se apague en silencio otra vez.

### 2. Tres estados de visibilidad

`yaFacturado = Boolean(pedido.FACTURA_ID || pedido.FACTURA_PDF_URL)`

| Condición | Qué se muestra |
|---|---|
| `yaFacturado` | Tarjeta azul + `📄 Ver RIDE`. **Ningún botón de emitir.** |
| `!yaFacturado && pidioFactura` | Botón **amarillo**: `🧾 Generar FACTURA SRI` |
| `!yaFacturado && !pidioFactura` | Mismo botón, **gris y discreto** |

La regla que evita el duplicado es una sola: **si `yaFacturado`, el botón no se dibuja.**

Se elimina el bloque de "⏳ Factura en proceso… (llega en 5–30 seg)" (línea 447). Esa
frase era cierta cuando emitía Make; hoy la factura sale en ~4 segundos o no sale sola
nunca. Un aviso que dice "espera" cuando no hay nada esperando es peor que no decir nada.

Permiso: `user?.rol === 'ADMIN'` (antes era `ADMIN || VENDEDOR`).

### 3. Confirmación antes de emitir

Emitir al SRI no se deshace. `confirm()` con los datos reales, mismo patrón que
`handleSubmit` en `nuevo-pedido/page.js:479`:

```
🧾 Se emitirá FACTURA ELECTRÓNICA al SRI

Pedido: MAN-AND-5601
Cliente: Granizo Salazar Irma Lorena
Cédula: 1717650434
Total: $35,00

Esto NO se puede deshacer.
```

Si cancela, no pasa nada. Las validaciones que ya existen (`emitirFactura()`, líneas
170-172: cliente, email, cédula) se conservan y corren ANTES del confirm.

### 4. Candado anti-duplicado en el servidor

Esconder el botón no alcanza: doble toque, pestaña vieja abierta, o dos personas a la vez
emiten dos facturas al SRI. Una factura duplicada es un problema tributario real.

`app/api/factura/emitir/route.js` pasa a **releer el pedido antes de emitir**:

```js
const actual = await getPedidoById(pedidoId)
if (!actual) → 404
if (actual.FACTURA_ID) →
  Response.json({ ok: true, yaFacturado: true, datilId: actual.FACTURA_ID })
```

No emite, no registra evento de error, contesta éxito con el id que ya existe. La pantalla
lo trata como éxito y recarga.

Esta relectura es la protección de verdad; el botón oculto es solo comodidad.

### 5. Después de emitir

`emitirFactura()` (línea 169) ya está bien construida: usa `await`, revisa
`res.ok && d.ok`, y escribe en la bitácora. Se le agrega:

- el `confirm` del punto 3, al inicio
- `await loadPedido()` tras el éxito, en vez de quedarse solo con `setFacturaEnviada(true)`

Así el botón desaparece solo y en su lugar sale la tarjeta azul con el Dátil ID y el
`Ver RIDE`: **se ve el PDF real, no un cartel que dice que salió**. Ese cartel sin prueba
es exactamente lo que dejó pasar 13 días de facturación muerta.

`facturaEnviada` deja de gobernar la UI (lo hace el pedido recargado) pero se conserva
para el mensaje verde momentáneo mientras recarga.

## Manejo de errores

| Caso | Qué pasa |
|---|---|
| Cliente sin email o sin cédula | `alert` y no se emite (ya existe) |
| Usuario cancela el confirm | No pasa nada |
| Dátil rechaza | Tarjeta roja con el detalle. `lib/datil.js` ya registra el evento `error` con `await` |
| El pedido ya tenía factura | `ya_facturado`, se recarga y aparece la tarjeta azul |
| Falla la red del navegador | `catch` → tarjeta roja. El pedido no se toca |

## Pruebas

**Automáticas** (`node --test`, lógica pura extraída a un helper):
- `yaFacturado` → botón oculto, en los dos casos de `pidioFactura`
- `!yaFacturado && pidioFactura` → botón amarillo
- `!yaFacturado && !pidioFactura` → botón gris
- `FACTURA_SOLICITADA` como `'TRUE'`, `'true'`, `true`, `'FALSE'`, `undefined`
- rol distinto de `ADMIN` → nada

**Contra producción, sin emitir nada:**
- `POST /api/factura/emitir` con `pedidoId: 'MAN-AND-5602'` (ya facturado) debe contestar
  `yaFacturado: true` y **no** crear comprobante. Se comprueba con el secuencial de Dátil:
  si sigue en 1143, no se emitió nada.
- Control negativo: `pedidoId` inexistente debe dar 404, no `ok:true`.

**Manual, la hace Rodrigo:** apretar el botón en `MAN-AND-5601`. Emite al SRI de verdad, así
que no se ejecuta como prueba automática ni la corre el agente.

## Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `app/dashboard/pedido/[id]/page.js` | Campo correcto, 3 estados, confirm, `loadPedido()`, solo ADMIN, quitar el "en proceso" |
| `app/api/factura/emitir/route.js` | Relectura del pedido + respuesta `yaFacturado` |
| `lib/facturas-visibilidad.js` (nuevo) | Lógica pura de visibilidad, para poder probarla |
| `tests/facturas-visibilidad.test.js` (nuevo) | Los casos de arriba |

## Fuera de alcance

- Que el servidor emita la factura al crear el pedido (la causa raíz)
- Reintento automático por cron sobre `lib/facturas-pendientes.js`
- Emitir `MAN-AND-5601`, que sigue sin factura: lo decide Rodrigo
