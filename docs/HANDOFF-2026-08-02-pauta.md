# HANDOFF · 2-ago-2026 · Pauta, atribución y señales a Meta

Todo lo de este documento está **en producción**. Sesión larga; esto es lo que
hay que saber para retomar sin repetir errores.

Complemento: `docs/CAPI-senales.md` en `wa-inbox-next` e `ind-inbox-next` cubre
el lado del inbox (Lead e InitiateCheckout).

---

## Qué se construyó

**El circuito completo anuncio → chat → venta, en los dos sentidos.**

| pieza | dónde |
|---|---|
| `LeadSubmitted` e `InitiateCheckout` | los dos inbox (`lib/capi.js`) |
| `Purchase` con atribución | CRM (`lib/metaCapi.js`) |
| Atribución congelada en el pedido | trigger `crm.pedidos_set_origen` |
| Tablero de pauta | `/dashboard/pauta` |
| Artes (salida manual) | `/dashboard/pauta/artes` |
| Origen en la ficha del pedido | acordeón 🎯 |
| Errores | `/dashboard/errores` + Telegram |

---

## Las cinco cosas que NO son obvias

**1. `Lead` no existe; es `LeadSubmitted`.** El canal de mensajería tiene su
propio vocabulario de eventos y NO es el del pixel web. Meta rechaza `Lead` con
`error_subcode 2804066`. Antes de agregar un evento nuevo, comprobarlo.

**2. El dataset NO es el pixel del sitio.** Los eventos de Click-to-WhatsApp van
a un dataset propio de cada WABA. No hay forma de asociarlos desde el panel —
esa sección no existe, se recorrió entera buscándola. Se crea por API
(`POST /{WABA_ID}/dataset`) y queda asociado solo. Lo resuelve
`datasetDeWaba()`, cacheado en `inbox.capi_datasets`.

**3. El token que publica es `META_TOKEN`, no uno de CAPI.** Un token de CAPI se
genera desde un dataset concreto y no sirve para otro. `META_TOKEN` manda sobre
la WABA y es el que crea esos datasets. **`META_CAPI_TOKEN` y
`META_CAPI_PIXEL_ID` en los inbox se pueden borrar: no se usan.**

**4. `error_user_msg`, no `message`.** Meta responde `"Invalid parameter"` en el
campo obvio y la explicación de verdad va enterrada en `error_user_msg`. Todo lo
que registre errores de Meta debe preferir ese campo.

**5. Venta = que exista el PEDIDO, cobrado o no.** Regla del negocio. Un ABONO
ya se vendió; falta cobrarlo, no venderlo. Filtrar por `estado_pago='PAGADO'`
deja fuera ~46 pedidos por ~$3.263 en tres semanas.

---

## ⚠️ El bug que costó la noche — no repetirlo

**El cliente de Supabase del CRM leía respuestas CACHEADAS.**

Next.js parchea el `fetch` global y cachea las respuestas `GET`. Las lecturas de
PostgREST son `GET`, así que sin `cache: 'no-store'` quedan **congeladas en el
resultado de la primera llamada del proceso**.

`lib/inbox-supabase.js` ya lo tenía; `lib/supabase.js` no.

Se diagnosticó mal **siete veces** (el filtro en JS, el comodín de
`.not(ilike)`, el recorte de PostgREST, el caché de esquema, el
`merge-duplicates` del upsert, la fila nueva del día). Todas parecían plausibles
porque **las escrituras sí funcionaban y solo mentían las lecturas**: cada
arreglo "no cambiaba nada" y el siguiente sospechoso parecía más probable.

> **Regla:** cuando una lectura no coincide con lo que dice la base y las
> escrituras sí llegan, sospechar del **transporte** antes que de la consulta.
> Y cualquier cliente nuevo de Supabase en este repo lleva `no-store`.

Corolario: **los despliegues de Vercel no son instantáneos.** Buena parte de la
confusión vino de probar contra despliegues viejos creyendo que eran nuevos.
Verificar con un campo que solo exista en la versión nueva.

---

## Cómo se clasifica cada venta

Cinco categorías, misma regla en el CAPI, el tablero y el trigger:

| origen | qué es | a Meta |
|---|---|---|
| `por_chat` | vino de un anuncio, cerró por WhatsApp | `business_messaging` + `ctwa_clid` |
| `digital_a_fisico` | vino de un anuncio, compró en el mostrador | `business_messaging` + `ctwa_clid` |
| `cliente_de_paso` | mostrador, sin chat | `physical_store` (Meta cruza) |
| `mensaje_directo` | escribió por su cuenta, sin anuncio | `chat` |
| `sin_rastro` | ni chat ni mostrador | `chat` |

Quién vende en mostrador vive en **`crm.vendedores_tienda`** (hoy: JACKELINE
BARRETO). Está en una tabla y no en el código porque lo necesitan tres lugares y
tenerlo duplicado garantizaba que algún día dijeran cosas distintas sin que
nadie lo notara. **Agregar a alguien es un `insert`, sin desplegar.**

---

## Números al 2-ago (para no engañarse)

- **El 80 % de las conversaciones nuevas viene de pauta**, y convierte **1,2 %**
  contra 8-13 % de lo que llega por otro lado. Ese es el argumento del proyecto:
  Meta optimiza hacia quien abre chats, no hacia quien paga.
- Ventas atribuibles: **~14 % (IND)** y **~40 % (MANDARINA)** de las rastreables.
- **~25 % de los pedidos tienen un celular que nunca escribió.** Estructural: el
  que negocia no siempre es el que queda en el pedido. No lo arregla el código.
- Señales por semana: **65 (IND)** y **38 (MANDI)** `LeadSubmitted`.

⚠️ Los números anteriores al **29-jul** están sesgados: REPUBLIC y el 9804 no se
grababan. Cualquier análisis serio arranca ahí.

---

## Pendientes

**Del lado de Meta (no es desarrollo, es lo que falta para cobrar el trabajo):**

1. Dejar correr 7-10 días sin tocar nada.
2. **Consolidar conjuntos de anuncios.** Es lo que más rinde y no cuesta plata:
   con 65 y 38 señales semanales repartidas en cinco conjuntos, ninguno sale de
   aprendizaje (Meta quiere ~50/semana **por conjunto**).
3. Recién entonces, optimizar por `LeadSubmitted`. **No por `Purchase`**: 29 y 19
   por semana está muy por debajo del umbral.
4. A las dos semanas, mirar ROAS por creativo y cortar lo que no vende.

**Técnicos, ninguno bloquea:**

- Revisar en un mes si 🔥 CALIENTE y SOPORTE aportan algo como disparador de
  `InitiateCheckout`: hoy 159 de 161 entran por el conteo de mensajes.
- 17 anuncios sin arte recuperable (borrados en Meta). Solo se recuperan
  subiendo la imagen a mano.
- `arteViejoSinRespuesta` puede salir negativo en la respuesta del cron.
  Cosmético.

---

## Variables de entorno

**CRM:** `META_ADS_TOKEN` (ads_read sobre las dos cuentas), `CRON_SECRET`,
`META_CAPI_TOKEN`, `META_PIXEL_*`, `TELEGRAM_BOT_TOKEN`, `CLOUDINARY_*`.
Opcionales: `PAUTA_ARCHIVAR_AUTO=0` (frena el archivado de artes),
`CRM_VENDEDORES_TIENDA` (hoy la tabla manda).

**Inbox:** `META_TOKEN`, `TELEGRAM_BOT_TOKEN`, `DIAG_KEY`. Opcionales:
`CAPI_LEAD_UMBRAL` (4), `CAPI_VENTA_UMBRAL` (6), `CAPI_VENTANA_HORAS` (72),
`CAPI_VENTANA_VENTA_HORAS` (168).

⚠️ **Cargar una variable NO basta: hay que redesplegar.** Next inserta los
`process.env` en tiempo de compilación. Y cargarlas desde PowerShell les pega un
BOM invisible — por eso `lib/env.js` en los inbox.

---

## Diagnóstico

```
GET /api/capi/diag?clave=DIAG_KEY        (cada inbox)
```
Comprueba token de Meta, dataset por WABA, Telegram y contactos listos. **Correrlo
crea el dataset de la WABA si no existe.**

```sql
-- Señales enviadas
select cuenta, event_name, count(*) filter (where http_status=200) ok,
       count(*) filter (where http_status is distinct from 200) fallidos
from inbox.capi_events group by 1,2;

-- De dónde salió cada venta
select origen, count(*), round(sum(monto_total)::numeric,2)
from crm.pedidos where fecha_pedido >= '2026-07-13' group by 1;

-- Artes sin guardar (deberían ser 0)
select crm.pauta_arte_pendiente_total();
```

En Events Manager hay que **elegir el canal de mensajería**: en la vista por
defecto estos eventos no aparecen y parece que no llegó nada.
