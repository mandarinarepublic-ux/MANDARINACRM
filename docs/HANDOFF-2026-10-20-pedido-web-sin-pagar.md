# HANDOFF 20-oct-2026 — pedido web SIN PAGAR → aviso en el inbox

En producción en los TRES repos (verificado el commit de cada despliegue en Vercel):

| repo | commit | qué |
|---|---|---|
| MANDARINACRM (`mandarina-pro-sales`) | `071f75e` | webhook de Shopify: marca + aviso al inbox + no crea al pagar |
| wa-inbox-next (`wa-inbox-v2`, MANDI) | `ce3add4` | burbuja `AvisoInterno` + fuera del historial de la IA |
| ind-inbox-next (`ind-inbox-v2`, IND) | `ccb07d7` | lo mismo + botón «Enviar plantilla» en chats sin entrantes |

Migración (x1): `docs/sql/2026-10-20-shopify-sin-pagar.sql` → `crm.shopify_sin_pagar`.
Pruebas: CRM 891/891 · MANDI 973/973 · IND 917/917.

⚠️ **Sin prueba con un pedido real.** Rodrigo decidió no hacer pedido de prueba («no
tengo tantas compras por la web»). El primer pedido web sin pagar ES la prueba.

## Por qué

Pedido de Shopify **#1191** (Kevin Guzhñay Peralta, 20-oct, Chaqueta de Ben 10 L, $35,
**Depósito bancario → PENDING**). Rodrigo no lo veía en el CRM. No era un bug: el
webhook solo crea pedidos **pagados**. Andrés lo había cargado a mano como
`MAN-AND-6409` (PAGADO, EN_FABRICA, `origen=mensaje_directo`, sin `shopify_order_id`).

☠️ El riesgo real: si alguien marcaba #1191 pagado en Shopify, el webhook creaba
`MAN-WEB-####` y la chaqueta entraba **dos veces a fábrica**. Ya pasó el patrón:
`MAN-WEB-6241` (#1189, 5-oct) era depósito pagado 4 h después y entró solo.

## Lo que decidió Rodrigo

1. Pedido web sin pagar → **chat en Pendientes del inbox de esa tienda** con un mensaje
   **resaltado** que resume la compra y dice *«Comunícate con el cliente: realizó una
   compra pero tiene pendiente el pago.»*
2. Si el cliente ya escribió desde ese número → **en ese chat**. Si no → **chat nuevo**
   con el botón de plantilla de Meta.
3. Cuando paga, **el vendedor lo carga a mano con Pedido manual**. Un pedido que nació
   sin pagar **NUNCA entra solo** al CRM, aunque lo marquen pagado en Shopify.

Decisiones mías (Rodrigo no objetó): color ámbar; chat nuevo en el número principal
(MANDI `1024077200794372` = 98 374 5757 · IND `1153686904504422` = 99 995 3326); IA
apagada en el chat nuevo.

## Cómo funciona

`app/api/shopify/pedidos/route.js`, rama `orders/create` sin pagar, en este orden:

1. **Marca** en `crm.shopify_sin_pagar` (PK `shopify_order_id`). Va PRIMERO: es lo
   que frena a `orders/paid` después. Si falla → `eventos_sistema` nivel `error`.
2. Telegram de siempre (`notificarPedidoWebSinPagar`).
3. `avisarPedidoEnInbox` (`lib/inbox-supabase.js`), escribe DIRECTO en `inbox.*` con
   el service-role (misma base, sin endpoint nuevo en los inbox):
   - busca la conversación por cola de 9 dígitos en la cuenta de la tienda
     (`MANDARINA→MANDI`, `INDSTORE→IND`); usa su `phone_id` (el del último entrante);
   - si no hay, `upsert` en `conversaciones` (PENDIENTE + HUMANO) con el canal principal;
   - inserta en `mensajes`: `direccion='INTERNO'`, `tipo='pedido_web'`,
     `wa_message_id='pedido_web_<order.id>'` (idempotente: el índice único rebota
     los reintentos de Shopify), `raw={origen:'shopify'}`;
   - `bandeja` → `estado='PENDIENTE'`, `no_leidos+1`, **sin `ultimo_entrante_at`**;
   - `conversaciones.estado='PENDIENTE'` (IND y el CRM aún lo leen de respaldo).
   - Nunca lanza: el resultado queda en `shopify_sin_pagar.aviso_inbox`
     (`ok` | `error: …`) y, si falla, en `eventos_sistema` nivel `aviso`.

Rama `orders/paid`: antes de crear, mira la marca. Si está → **no crea**,
`notificarPedidoWebPagadoDespues` (Telegram «marcado PAGADO… NO entró solo») y evento
nivel `ok`. Si la consulta de la marca falla → lanza (no se crea a ciegas) y el catch
avisa «Hay que cargarlo a mano».

El texto del aviso: `textoAvisoPedidoWeb` en `lib/pedidoWebPendiente.js` (puro, con
pruebas en `tests/shopify-pedido-pendiente-inbox.test.js`). Traduce las pasarelas:
`Bank Deposit` → «Depósito / transferencia bancaria», `Dlocal Go Offline Payments` →
«dLocal en efectivo…»; una desconocida pasa tal cual.

### ☠️ Por qué `direccion='INTERNO'` (y no copiar `cambio-numero.js`)

El precedente del repo (`notaParaNumeroNuevo`) guarda el mensaje sintético como
**ENTRANTE** para que caiga en Pendientes. Aquí eso habría roto todo: `ultimo_entrante_at`
abre una **ventana de 24 h falsa** → el inbox deja escribir texto libre, Meta lo rechaza
con 131047 y el botón «Enviar plantilla» no sale. SALIENTE tampoco: lo contaría como
nuestro («Tú:», ticks, estadísticas, `pagos_sin_pedido`).

Se revisaron TODAS las vistas y funciones SQL que leen `direccion`
(`lista_bandeja`, `completar_bandeja`, `dashboard_periodo`, `pauta_embudo`,
`pagos_sin_pedido`, `etiqueta_pauta_auto`…): todas comparan `= 'ENTRANTE'` o
`= 'SALIENTE'`, así que un tercer valor queda fuera de las dos cuentas. La vista
`ultimo_mensaje_canal` la mantiene un trigger por `phone_id`, así que el chat aparece.
No hay CHECK sobre `direccion`.

### En los inbox (x2, parches distintos a mano)

- `components/Components.jsx`: `AvisoInterno` (centrado, ámbar, «Aviso interno · el
  cliente no lo ve»). `MessageBubble` lo devuelve **después** de sus dos `useState`.
- `lib/inbox-supabase.js` y `app/api/conversacion/route.js`: el historial de la IA salta
  los INTERNO (si no, la IA leería «Comunícate con el cliente…» como si lo dijera el cliente).
- **Solo IND** `components/App.jsx`: el aviso «Ventana cerrada — 📋 Enviar plantilla»
  exigía `lastIncoming`; un chat creado por el CRM no tiene ninguno → ahora basta
  cualquier mensaje. MANDI ya usaba `lastMsg`.
- Prueba guardia: `tests/aviso-interno-pedido-web.test.js` (2 en MANDI, 3 en IND).

## Lo que queda

| # | qué | cómo se cierra |
|---|---|---|
| 1 | **Ningún pedido real pasó todavía** | Al primer pedido web sin pagar: `select * from crm.shopify_sin_pagar order by creado_en desc limit 3` → `aviso_inbox='ok'`, y el chat en Pendientes con el recuadro ámbar y el botón de plantilla |
| 2 | **dLocal en efectivo** también «nace sin pagar» y se confirma SOLO días después | Por la regla de Rodrigo NO entra solo: depende de que el vendedor vea el Telegram. Si se pierden ventas, reabrir esta decisión para esa pasarela |
| 3 | **#1190** (18-oct, dLocal efectivo, PENDING) es anterior: sin marca ni aviso | Rodrigo lo dejó así. Si se paga, entra solo como antes |
| 4 | Pedidos sin pagar de INDSTORE anteriores al cambio | No revisados (el MCP de Shopify estaba en Mandarina) |
| 5 | El aviso no se actualiza si el cliente paga | Decidido así: queda como texto en la conversación |

## Cómo mirar

```sql
-- marcas y si el aviso llegó
select * from crm.shopify_sin_pagar order by creado_en desc limit 10;
-- los avisos en los inbox
select cuenta, telefono, phone_id, fecha, left(texto,60)
from inbox.mensajes where direccion = 'INTERNO' order by fecha desc limit 10;
```
