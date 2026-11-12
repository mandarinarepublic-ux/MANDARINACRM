# Transferencia bancaria dentro del recuadro de pago de la tienda (MANDI)

12-nov-2026 · decidido con Rodrigo en chat · estado: DISEÑO (sin construir)

## Por qué

Rodrigo quiere que **todo** pago de mandarinaec.com pase por nuestro recuadro
(`public/pago-tienda.js` → `/pagar`), no por el checkout de Shopify. Hoy el
recuadro solo cobra con tarjeta (Payphone, en producción y abierto a todos desde
`a03a6cc1`). Pero los 2 últimos pedidos web (#1191, #1192) se pagaron por
**depósito/transferencia** en el checkout de Shopify, así que no se puede esconder
ese checkout sin antes ofrecer transferencia dentro del recuadro.

Pidió que la transferencia sea **visiblemente más bonita** que la de Shopify (que
solo muestra un texto plano con las cuentas después de comprar).

## Objetivo

En el recuadro, después de los datos de envío, el cliente elige **💳 Tarjeta** o
**🏦 Transferencia**. Transferencia: elige su banco con botones, ve los datos de la
cuenta y el monto exacto, transfiere desde su app, **sube la foto del comprobante
ahí mismo** y listo.

### Lo que decidió Rodrigo (textual de la conversación)

1. **Botones con los nombres de los bancos**, como la respuesta rápida «selecciona tu
   banco» del inbox; al tocar uno se muestran los datos de esa cuenta.
2. **El cliente sube la foto del comprobante en el recuadro.**
3. **En el inbox entra un chat con la foto** (el vendedor lo maneja desde ahí).
4. **En el CRM, el pedido entra con la foto como pago TRANSFERENCIA en la sección de
   pagos.**
5. **El pedido espera** (no va a producción) **hasta que el vendedor confirme el pago.**
6. Si no completa el proceso → **chat en el inbox como carrito abandonado.**
7. Abrir el botón a todos **ya** (hecho, `a03a6cc1`) sin esperar el 1.er pago aprobado.

### No-objetivos

- IND STORE (solo Mandarina en esta versión).
- Leer el monto del comprobante solo (lector QR de comprobantes): mejora posterior.
- Esconder el checkout de Shopify: va **después** de que esto esté en producción y
  probado (ver «Después»).
- Conciliación bancaria automática.

### Anti-objetivos (sería un fracaso aunque «funcione»)

- Que un pedido por transferencia llegue al taller sin que un humano haya visto la
  plata en el banco.
- Que el mismo pedido entre **dos veces** al CRM (ya pasó: `MAN-WEB-6241`, ver
  `docs/HANDOFF-2026-10-20-pedido-web-sin-pagar.md`).
- Que el cliente suba la foto y no quede rastro en ningún lado (ni CRM ni inbox).
- Abrir una ventana de 24 h falsa en el inbox (`direccion='ENTRANTE'` sintético →
  Meta 131047). Ver el handoff del 20-oct, sección «Por qué INTERNO».

## Las cuentas (fuente: `inbox.respuestas_rapidas`, cuenta MANDI, grupo `datos`)

| Botón | Tipo | Número | Titular |
|---|---|---|---|
| Banco Pichincha | Ahorros | 2210996988 | RODRIGO CASTILLO · CI 1716608094 |
| Banco Guayaquil | Ahorros | 38180287 | RODRIGO CASTILLO · CI 1716608094 |
| Produbanco | Ahorros | 18059046370 | RODRIGO CASTILLO · CI 1716608094 |
| Deuna | Corriente | 7700310145 | RODRIGO CASTILLO · CI 1716608094 |

Mail INFO@MANDARINAEC.COM · teléfono 0983745757 (los de las respuestas activas).
*Decisión mía:* las cuentas van en **un archivo del CRM** (`lib/cuentasBancarias.js`),
no leídas en vivo de `respuestas_rapidas` (ese texto es libre y cambia de forma).
Cambiar una cuenta = editar ese archivo. Si Rodrigo quiere editarlas sin código,
se mueve a tabla después.

## Cómo se ve (recuadro, celular primero)

1. Datos de envío (ya existe) → «Continuar».
2. **Resumen** (ya existe el cálculo con Shopify) + dos tarjetas grandes:
   «💳 Tarjeta de crédito o débito» y «🏦 Transferencia o Deuna».
3. Transferencia → **4 botones** con el nombre (y color de marca) de cada banco.
4. Banco elegido → ficha de la cuenta: banco, tipo, número, titular, cédula y
   **MONTO EXACTO** en grande. Botón **«Copiar»** junto al número, a la cédula y al
   monto (*idea mía*: en el celular nadie quiere tipear el número). Enlace «cambiar
   de banco».
5. Botón **«📸 Subir foto del comprobante»** (`<input type=file accept=image/*>`,
   abre cámara o galería). Vista previa + «Enviar comprobante».
6. Éxito: «¡Recibimos tu comprobante! Lo verificamos y te confirmamos por WhatsApp.
   Tu pedido es el #119x.» (*decisión mía:* el número de Shopify, igual que la
   rama de tarjeta en `procesarPagoTienda.js`.) El carrito se vacía (mismo `postMessage` que la
   tarjeta).

«Más bonito que Shopify» = los puntos 3-5: botones de banco en vez de texto plano,
monto exacto visible, copiar con un toque, comprobante en el mismo lugar. La
estética sigue la del recuadro actual (`/pagar`, naranja `#f26a1b`).

## Qué pasa al enviar el comprobante (servidor)

Endpoint nuevo en el CRM (público, como `/api/publico/pago`), atado al
`crm.checkouts_tienda` del intento (no confía en montos ni productos que mande el
navegador: usa el `calculo` guardado).

En este orden (cada paso idempotente por `checkout_id`):

1. **Foto** → Supabase Storage. Validar tipo imagen y tamaño (tope sugerido 10 MB).
2. **Shopify:** crear el pedido como **pago pendiente** (draftOrderCreate +
   draftOrderComplete con pago pendiente; mismos datos y descuentos que la rama de
   tarjeta). El webhook `orders/create`/`orders/paid` **no debe crearlo** en el CRM ni
   disparar el aviso de «pedido web sin pagar».
   ⚠️ `crm.shopify_sin_pagar` tiene PK `shopify_order_id`, que recién existe tras
   `draftOrderComplete` (el mismo instante en que dispara `orders/create`): el webhook
   llegaría primero. *Decisión mía:* marcar el **borrador** con una etiqueta/nota
   (`tienda-transferencia` + `checkout_id`) y que el webhook la mire antes de todo en
   las dos ramas; si la trae, no crea, no avisa y registra evento nivel `ok`.
   *Decisión mía* (Rodrigo no objetó): el pedido existe también en Shopify para ver
   todas las ventas web en un solo lugar.
3. **CRM:** crear el pedido `MAN-WEB-####` directamente (mismo armado que los
   pedidos web pagados), estado **`PENDIENTE_FABRICA`**, con un pago
   `tipo='TRANSFERENCIA'`, `estado='PENDIENTE'`, `monto=total`,
   `foto_comprobante_url=<foto>`, `notas='Banco Pichincha · tienda web'`.
4. **Inbox MANDI:** mensaje `direccion='INTERNO'` en la conversación del celular del
   cliente (o una nueva), en **Pendientes**, con la **foto** y el resumen (productos,
   tallas, total, banco, dirección, cédula, número MAN-WEB), resaltado como
   «🏦 Transferencia desde la tienda web — verificar pago». Reusar
   `avisarPedidoEnInbox` / el patrón del 20-oct; `wa_message_id` único por checkout.
5. `crm.checkouts_tienda.estado` → nuevo estado `COMPROBANTE` (con banco y URL).

Si falla 3 o 4 después de 2: no se le dice «error» al cliente si la foto quedó
guardada; se registra en `eventos_sistema` nivel `error` y el chat/CRM se reintenta
(o se carga a mano). Nunca perder la foto.

## La espera hasta que se confirme el pago

Respuestas de Rodrigo a la revisión (12-nov): **solo ADMIN confirma**; al confirmar
**pasa solo a producción**; si es falsa, **solo botón Rechazar** (sin vencimiento).

- ⚠️ Hoy los pedidos web pagados nacen directo en `EN_FABRICA` (`estadoInicialPedido`)
  y `lib/db/impresion.js:118` dice que `PENDIENTE_FABRICA` «NO EXISTE» en ese flujo.
  El pedido por transferencia necesita un estado de espera que **no aparezca** en
  Producción, impresión, Plan de fábrica ni contadores de urgentes. El constructor
  elige si es `PENDIENTE_FABRICA` u otro, verificando cada pantalla que lista pedidos.
- Mientras el pago `TRANSFERENCIA` esté `PENDIENTE`, el CRM **bloquea** pasar el
  pedido a `EN_FABRICA` por cualquier camino (pantalla del pedido, cambio masivo,
  Producción) con «Falta confirmar la transferencia».
- **Confirmar (solo ADMIN)**, en la sección Pagos del pedido, junto a la foto:
  acción nueva (hoy `lib/editarPago.js` no cambia `estado`). Deja registro de quién y
  cuándo. Al confirmar, en este orden:
  1. pago → `PAGADO`, `recalcPago`;
  2. pedido → `EN_FABRICA` (sale a producción solo);
  3. Shopify: marcar el pedido pagado; el marcador de «no crear» debe frenar el
     `orders/paid` que eso dispara (no se crea dos veces);
  4. **recién aquí** se disparan lo que hoy sale al crear un pedido pagado: CAPI
     Purchase a Meta, `notificarVenta` y la factura Dátil. **Nada de eso al crear**
     el pedido con la transferencia sin confirmar (no reportar a Meta plata no vista).
  5. nota INTERNO en el chat del inbox: «✅ Transferencia confirmada por <admin>».
- **Rechazar (solo ADMIN)**: pago → `RECHAZADO` (o el estado que use el CRM), pedido →
  `CANCELADO`, pedido de Shopify cancelado (reponiendo inventario si aplica), nota
  INTERNO en el chat «❌ Transferencia rechazada por <admin>». Sin vencimiento
  automático: espera hasta que alguien confirme o rechace.
- **`recalcPago` (decisión mía):** hoy las dos ramas suman TODOS los pagos sin mirar
  `estado`, y los `LINK_PAGO` nacen `PENDIENTE` y cuentan. Para no mover los números
  de los LINK_PAGO existentes ni de cobranza, excluir **solo** `TRANSFERENCIA` en
  `PENDIENTE`/`RECHAZADO`. No tocar el resto.
- En el chat del inbox no hay botón de confirmar (Rodrigo eligió confirmar en el
  CRM). El chat sirve para hablar con el cliente.

## Carrito abandonado

Ya existe `/api/cron/carritos` (cada 10 min; ≥30 min sin pagar y con celular → chat
PENDIENTE INTERNO). Extender: si el intento eligió transferencia (y banco) pero no
subió comprobante, el aviso lo dice: «Eligió transferencia (Banco Guayaquil) y no
subió el comprobante». Guardar en `checkouts_tienda` el método y el banco elegidos
en cuanto el cliente los toca.

## Después (fuera de esta versión, en este orden)

1. Prueba real: una transferencia de punta a punta (foto → CRM → inbox → confirmar →
   producción) y un pago con tarjeta aprobado.
2. Esconder el checkout de Shopify: botón «Pagar pedido» del carrito, «Comprar ya»
   (botones dinámicos) en la ficha de producto y el carrito lateral si existe. Apagar
   dLocal en Shopify (lo hace Rodrigo en Configuración → Pagos).
3. Lector QR del comprobante para avisar «monto coincide / no coincide».

## Lo que queda a criterio del constructor

- Forma exacta del endpoint, nombres de archivos y componentes.
- Bucket y ruta de la foto (bucket propio del CRM o `inbox-media`), siempre que el
  inbox pueda mostrarla.
- Colores exactos de cada banco.
- Mensajes de error al cliente (tono: tuteo ecuatoriano, corto).

## Pruebas mínimas

- Unidad: armado del pago TRANSFERENCIA, bloqueo de `EN_FABRICA` con pago pendiente,
  texto del aviso de inbox, idempotencia por checkout, el webhook de Shopify NO crea
  el pedido marcado.
- Inventario de rutas públicas del CRM si existe (sumar la nueva).
- Antes de decir «listo»: un comprobante de prueba real en producción, revisado en
  CRM e inbox, y luego anulado.
