# Pedidos de Shopify al CRM — que ninguna venta web pase desapercibida

**Fecha:** 28-ago-2026
**Estado:** diseño aprobado, sin implementar
**Tiendas:** `mandarinaec.com` (MANDARINA) y `indlovers.com` (INDSTORE)

---

## 1. El problema

Lo dijo Rodrigo con todas sus letras: **"nunca nos enteramos de las ventas de
Shopify"**.

No es una impresión. Está medido:

- En `crm.pedidos`, la columna `origen` tiene 5 valores vivos en los últimos 60
  días —`mensaje_directo`, `cliente_de_paso`, `sin_rastro`, `por_chat`,
  `digital_a_fisico`— y **ninguno es de tienda web**. Cero pedidos identificados
  como venta de Shopify sobre 694 pedidos.
- El CRM ya habla con Shopify (`lib/shopify.js`, `/api/shopify/sync`) pero
  **solo para bajar el catálogo**. No existe ninguna ruta de webhook.
- La tienda de Mandarina tiene **6 pedidos en 60 días**. Es poco volumen, y ese
  es justamente el riesgo: seis ventas al año no generan una rutina, así que
  nadie mira. Una venta que nadie mira es una venta perdida.

### Lo que se está perdiendo hoy

Se cruzaron los 10 pedidos web más recientes de Mandarina contra el CRM, por
celular, email y por nombre. Resultado:

| Estado | Cantidad |
|---|---|
| Encontrados en el CRM (alguien los volvió a escribir a mano) | 6 |
| **No encontrados** | **4** |
| …de esos, **pagados** | **2** |

Los cuatro sin rastro: Justin Vinces (8-jul, pendiente), Wilson De la Vera
(12-jun, pendiente), **Geovanny Suárez (20-may, $31,50, PAGADO)** y **David León
Celorio (9-may, $35, PAGADO)**.

⚠️ **No se afirma que estén perdidos.** El cruce por celular/email/nombre falla
fácil: a Julio César Castro casi se le da por perdido y sí estaba en el CRM
(`MAN-GRV-5106`), registrado con otro correo. Quedan como **pendientes de
revisión manual**, no como pérdida confirmada.

### Por qué el trabajo manual no alcanza

Los 6 que sí entraron llegaron porque alguien los transcribió. Eso significa
que la única defensa hoy es que una persona se acuerde de entrar al panel de
Shopify. Y los 10 pedidos siguen en `UNFULFILLED` allá, o sea que **el estado en
Shopify no refleja nada** y no sirve como control.

---

## 2. Enfoques descartados

**Un cron que cada hora pregunte por pedidos nuevos.** Funciona, pero llega
tarde por definición y suma una corrida programada más a un CRM que ya tiene
crones. El webhook llega en segundos y no cuesta nada. Descartado.

**Que el webhook escriba directo en Supabase.** Sería un segundo camino para
crear pedidos, en paralelo al que ya existe. Se perdería el dual-write a Sheets,
el aviso de Telegram, el evento de CAPI y las validaciones. Es exactamente la
clase de código que se desincroniza en silencio (ya pasó con `roles.js` y con
`pedidos.js` vs `pedidos-client.js`). **Descartado: el webhook arma el mismo
payload que la pantalla de Nueva Venta y entra por la misma puerta.**

**Sacar las ~200 líneas que crean el pedido a una función común.** Es lo
correcto a largo plazo y evita la llamada de la app a sí misma. Se descartó por
**radio de explosión**: si el refactor sale mal no falla el pedido web, falla
TODA la venta de las tres tiendas. Y la red es débil — las pruebas de esa ruta
(`api-pedidos-blindada`, `identidad-vendedor`) **leen el archivo como texto**, no
ejecutan nada, así que no cazarían un cambio de comportamiento. Se puede hacer
más adelante, cuando la web venda lo suficiente como para justificarlo.

**Deducir el área del taller desde el producto.** Requiere una tabla
producto→técnica que hoy no existe y que habría que mantener sobre 225
productos. Demasiado trabajo para el volumen actual. Descartado.

---

## 3. Alcance

**Entra:**
- Ruta nueva `POST /api/shopify/pedidos`, con verificación de firma HMAC.
- Las **dos** tiendas: `mandarinaec.com` → `MANDARINA`, `indlovers.com` → `INDSTORE`.
- Pedido **pagado** → se crea en el CRM reusando `/api/pedidos`.
- Pedido **sin pagar** → no toca el CRM; avisa por Telegram.
- Columna `shopify_order_id` en `crm.pedidos`, con índice único.

**No entra:**
- Facturación en Dátil. **Decisión explícita de Rodrigo: estos pedidos NO se
  facturan.**
- Marcar el pedido como despachado (`fulfillment`) en Shopify.
- Sincronizar cambios posteriores del pedido (cancelaciones, reembolsos,
  ediciones). Solo el alta.
- La tienda YAW: no tiene Shopify.
- El backfill de los 4 pedidos sin rastro. Es una tarea manual aparte.

---

## 4. Diseño

### 4.1 La puerta: una ruta, dos tiendas

```
POST /api/shopify/pedidos
```

Shopify manda dos cabeceras que importan:

| cabecera | para qué |
|---|---|
| `X-Shopify-Shop-Domain` | de qué tienda vino → `MANDARINA` o `INDSTORE` |
| `X-Shopify-Hmac-Sha256` | firma del cuerpo crudo |
| `X-Shopify-Topic` | `orders/create` o `orders/paid` |

El orden es **primero identificar la tienda, después verificar con SU secreto**.
Cada tienda es una app distinta y firma con su propio `CLIENT_SECRET`, los
mismos que ya usa `getTiendasConfig()`. No hace falta ninguna variable nueva.

```
dominio → tienda (config)     si no hay tienda para ese dominio → 401
HMAC(cuerpo crudo, clientSecret de esa tienda) === cabecera   → si no, 401
```

⚠️ **La firma se calcula sobre el cuerpo CRUDO**, antes de cualquier `JSON.parse`.
En Next hay que leer `await req.text()` y parsear después; si se usa `req.json()`
y luego se re-serializa, la firma no cuadra nunca.

⚠️ Elegir el secreto por una cabecera que todavía no está verificada es seguro:
si el dominio es falso, la firma no va a validar con ningún secreto. Lo que
**no** se puede hacer es derivar la `tienda_id` de la cabecera sin haber
validado — la tienda sale del dominio **que efectivamente verificó**.

### 4.2 Pagado o no pagado

La decisión sale de `financial_status` del pedido:

| `financial_status` | qué pasa |
|---|---|
| `paid` | se crea el pedido en el CRM |
| cualquier otro (`pending`, `voided`, …) | **no toca el CRM**, solo Telegram |

Suscribiéndose a los dos temas:
- `orders/paid` → el camino de creación.
- `orders/create` → si viene sin pagar, el aviso de Telegram. Si viene pagado, no
  hace nada (lo va a manejar `orders/paid`, y el índice único cubre el empate).

**Un pedido que se paga después sí entra.** Si el cliente deja el pedido pendiente
y paga tres días más tarde, Shopify dispara `orders/paid` en ese momento y el
pedido se crea recién ahí. O sea que el aviso de Telegram del no pagado **no es
un descarte**: es un aviso de que hay alguien a quien perseguir, y si termina
pagando entra solo. Un mismo pedido puede generar primero el aviso y después el
alta — es lo esperado, no un duplicado.

### 4.2-bis Cómo se autentica el webhook

`/api/pedidos` **exige sesión** y saca el vendedor de la cookie — candado puesto
el 21-ago para que nadie cree pedidos a nombre de otro:

```js
const sesion = await sesionActual()
if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })
const vendedorId = usuario.USUARIO_ID
```

O sea que el webhook no puede llamar la ruta a secas. La solución: **un usuario
real** en `crm.usuarios`, y el webhook firma una sesión para él con
`firmarSesion()` y `secretoSesion()` — la app firmando con su propio secreto, no
una credencial inventada.

```
USUARIO_ID     (uuid nuevo)
NOMBRE         TIENDA WEB
CODIGO         WEB
ROL            VENTAS
TIENDAS        MANDARINA,INDSTORE
ACTIVO         TRUE
PASSWORD_HASH  (vacío — nadie puede entrar con él a mano)
```

**Efecto secundario bueno:** el `CODIGO` va en el id del pedido, así que las
ventas web quedan como **`MAN-WEB-5701`** e **`IND-WEB-…`**. Se reconocen de un
vistazo en cualquier bandeja, sin filtrar por nada.

☠️ **La app se llama a sí misma, y eso ya mató LINKPAGO 7 días** (8→14 ago): el
candado de sesión dejó sin credencial la llamada interna, y el `.catch` solo
miraba errores de RED — **un 401 no es un error de red**, así que el fallo se
descartó solo. Reglas de esta ruta, no negociables:

1. **Mirar `res.ok` siempre.** Nunca asumir que un `fetch` que no lanzó salió bien.
2. Si la llamada falla, **avisar por Telegram con el motivo y el número de pedido
   de Shopify**, para poder cargarlo a mano. Un pedido que no entra tiene que
   hacer ruido.
3. Contestarle **200 a Shopify igual** cuando ya se avisó: si se devuelve error,
   Shopify reintenta 19 veces y termina borrando la suscripción.

### 4.3 El cliente

Se busca por los **últimos 9 dígitos del celular**, que es el criterio que ya usa
el resto del CRM. Si no existe, se crea:

| campo | de dónde | ejemplo |
|---|---|---|
| `nombre` | `shipping_address.name` | Leonardo Pazmiño |
| `celular` | normalizado a 10 dígitos | `+593960643698` → `0960643698` |
| `cedula` | **`PENDIENTE-` + celular** | `PENDIENTE-0960643698` |
| `email` | del pedido o del cliente | |
| `ciudad`, `direccion` | `shipping_address` | Ambato |

**El teléfono siempre está.** Se verificó sobre los 10 pedidos: `customer.phone`
viene nulo en varios, pero `shipping_address.phone` está en **10 de 10**. Se lee
de ahí, con `customer.phone` de respaldo.

#### Por qué `PENDIENTE-` y no el celular pelado

`crm.clientes` **no tiene columna de tipo de identificación**. El tipo se deduce
del propio número en `lib/identificacion.js`:

```js
if (/^\d{13}$/.test(s)) return 'RUC'
if (/^\d{10}$/.test(s)) return 'CEDULA'   // ← un celular cae acá
if (s && !/^\d+$/.test(s)) return 'PASAPORTE'
```

Un celular ecuatoriano tiene exactamente 10 dígitos, así que guardarlo pelado lo
convertiría en **CÉDULA**, justo lo contrario de lo pedido. Con el prefijo deja
de ser solo dígitos y `inferirTipo()` devuelve **PASAPORTE**, que además ya está
marcado `factura: false` — coherente con no facturar en Dátil.

⚠️ **Guion medio, no guion bajo.** La validación es
`/^[A-Za-z0-9-]{3,20}$/`: un `_` la reprueba y el formulario de edición no
dejaría guardar ese cliente. `PENDIENTE-0960643698` mide exactamente 20
caracteres y pasa. Si algún día se quiere el guion bajo, hay que ampliar esa
regla primero.

Y el prefijo cumple una segunda función: **le grita al admin que a ese cliente
todavía hay que pedirle la cédula real.**

### 4.4 El pedido y sus prendas

```
tienda_id     MANDARINA | INDSTORE   (del dominio verificado)
vendedor_id   TIENDA WEB             (aparece como un vendedor más en reportes)
origen        tienda_web
estado_pago   PAGADO, monto_abonado = total
direccion_pedido  dirección de envío completa
```

Una prenda por línea del pedido:

| campo | de dónde |
|---|---|
| `producto_nombre` | título del producto |
| `talla`, `color` | de la variante (`M / Naranja`) |
| `cantidad`, `precio_unit`, `subtotal` | de la línea |
| `shopify_variant_id` | id de la variante — la columna **ya existe** |
| **foto** | `imagenShopify` → `/api/pedidos` la archiva en `foto_pecho_url` |
| `area` | **`PRODUCTO SIN DISEÑO`** |

La foto no necesita código nuevo. `app/api/pedidos/route.js:221` ya lo soporta:

```js
fotoPecho = await processPhoto(item.fotoPecho || item.imagenShopify || '', `${itemId}_pecho.jpg`)
```

**El orden de las opciones de la variante no es constante** en el catálogo: hay
productos `Talla, Color` y otros `Color, Talla`. Se identifican por **nombre de
opción**, nunca por posición — misma regla que ya se aplicó en el HOME v6.

Sobre el área: **decidido — `PRODUCTO SIN DISEÑO`**. Es lo que es —algo del
catálogo, ya diseñado, que solo hay que tomar y despachar— y es una categoría
viva (342 ítems en 60 días). El proceso acordado es que **el pedido entra y el
admin completa lo que falte**, área incluida si hiciera falta.

### 4.5 Que no entre dos veces

Shopify **reintenta los webhooks** ante cualquier error o demora. Sin defensa, el
mismo pedido entra dos veces a fábrica.

```sql
alter table crm.pedidos add column shopify_order_id text;
create unique index pedidos_shopify_order_id_uniq
  on crm.pedidos (shopify_order_id) where shopify_order_id is not null;
```

Antes de crear, se consulta por `shopify_order_id`. Si ya existe → `200 OK` sin
hacer nada (a Shopify hay que contestarle 200 o sigue reintentando). El índice
único es la red de seguridad real: dos webhooks simultáneos pasan la consulta a
la vez, y ahí solo el índice los separa.

### 4.6 El aviso — que es el punto de todo esto

**Pedido pagado:** no hace falta construir nada. `/api/pedidos` ya dispara
`notificarVenta()` al chat de ventas en cada alta. Una venta web va a caer ahí
igual que una del mostrador, con vendedor `TIENDA WEB`.

☠️ **Pero ese aviso va sin `await`** (`app/api/pedidos/route.js:283`,
`.catch(() => {})`). En Vercel la función se congela apenas responde: el mensaje
se puede perder y nadie se entera — que es exactamente el problema que se está
resolviendo. Es la misma trampa que ya costó los `registrarEvento` perdidos.
**En el webhook el envío se espera antes de responder.**

**Pedido sin pagar:** mensaje propio al mismo chat (`TELEGRAM_CHAT_VENTAS`), con
nombre, celular, qué pidió, monto y el enlace al pedido en Shopify, para que lo
persigan por WhatsApp. También esperado, no fire-and-forget.

### 4.7 Lo que NO cambia

- Ninguna pantalla del CRM.
- El alta manual de pedidos: se reusa, no se modifica.
- El sync de catálogo (`/api/shopify/sync`).
- La facturación: estos pedidos no la tocan.

---

## 5. Pruebas

### 5.1 Funciones puras (`node --test`)

El mapeo Shopify→CRM sale a su propio módulo, sin red ni base, y se prueba con
cuerpos de webhook reales guardados como fixtures:

- Normalización del celular: `+593960643698`, `0960643698`, `+593 96 064 3698`,
  `593960643698` → todos a `0960643698`.
- `PENDIENTE-0960643698` pasa `validarIdentificacion('PASAPORTE', …)` y
  `inferirTipo()` devuelve `PASAPORTE`. **Con guion bajo debe fallar** — la
  prueba lo fija para que nadie lo cambie sin darse cuenta.
- Variante `M / Naranja` y `Naranja / M` producen la misma talla y el mismo
  color (por nombre de opción, no por posición).
- Un pedido sin `shipping_address.phone` cae a `customer.phone`.
- `financial_status` distinto de `paid` **nunca** produce un pedido.

### 5.2 Control negativo — la más importante

Un POST con **firma inválida** debe devolver **401 y no crear absolutamente
nada**. Sin esta prueba, un 200 no significa nada. Se verifica en la ruta
desplegada, no solo en local.

También: un POST con un `X-Shopify-Shop-Domain` que no corresponde a ninguna
tienda configurada → 401.

### 5.3 No duplicar

Mandar el **mismo** cuerpo dos veces seguidas y confirmar que hay **un solo**
pedido en `crm.pedidos`.

### 5.4 Verificación por la puerta real

Un pedido de prueba real en cada tienda, pagado, y confirmar:
1. que aparece en el CRM con todos sus datos y la foto,
2. que **llegó el mensaje de Telegram** — mirando el chat, no el código.

⚠️ **Antes de confiar en Telegram hay que probar que el token esté vivo.** El
`TELEGRAM_BOT_TOKEN` de IND estaba vacío y se dio por bueno solo porque la
variable existía con el nombre correcto. Se envía un mensaje de prueba y se
confirma que llegó.

---

## 6. Riesgos abiertos

**El secreto de la firma.** Se asume que un webhook creado por la app vía Admin
API se firma con el `CLIENT_SECRET` de esa app. Es lo documentado, pero **no está
verificado en esta tienda**. Si no cuadrara, hace falta una variable por tienda
con el secreto que Shopify entregue. Se sabrá con el primer webhook real: se
verifica midiendo, no leyendo.

**Un pedido web con producto personalizado.** Hoy no existe esa venta en la web,
pero si algún día se vende algo que sí requiere arte, entraría como `PRODUCTO SIN
DISEÑO` y el taller no sabría que hay que fabricarlo. Mitigación por proceso: el
admin revisa cada pedido web.

**Cancelaciones y reembolsos.** Si el cliente cancela en Shopify, el CRM no se
entera. Queda fuera de alcance a propósito; el volumen no lo justifica todavía.

**INDSTORE sin medir.** El volumen de `indlovers.com` no se midió (el MCP está
conectado a la tienda de Mandarina y cambiar de tienda revoca el token). Podría
ser bastante mayor. No cambia el diseño, pero sí la urgencia.

---

## 7. Decisiones tomadas

| Decisión | Quién | Por qué |
|---|---|---|
| Solo los **pagados** entran al CRM | Rodrigo | Un pedido sin pagar no va a fábrica |
| Los **no pagados** avisan por Telegram | Rodrigo | Para perseguirlos por WhatsApp |
| `cedula` = `PENDIENTE-<celular>` | Rodrigo | Shopify no pide cédula; queda marcado como pendiente |
| Estos pedidos **no se facturan en Dátil** | Rodrigo | Explícito |
| El pedido entra **incompleto** y el admin completa | Rodrigo | El objetivo es enterarse, no la perfección del dato |
| Las prendas entran **con la foto de Shopify** | Rodrigo | Para reconocer la prenda de un vistazo |
| Las **dos** tiendas | Rodrigo | `mandarinaec.com` e `indlovers.com` |
| Área `PRODUCTO SIN DISEÑO` | Rodrigo | Es lo que es y ya se usa (342 ítems en 60 días) |
| Entrar por `/api/pedidos`, no escribir directo | diseño | No duplicar el camino de creación |
| `shopify_order_id` con índice único | diseño | Shopify reintenta |
| Usuario **TIENDA WEB** + sesión firmada, en vez de refactorizar `/api/pedidos` | Rodrigo | Radio de explosión: si falla, falla solo el pedido web |
