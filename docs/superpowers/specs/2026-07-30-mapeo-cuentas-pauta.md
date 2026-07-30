# Mapeo de cuentas publicitarias de Meta a tiendas (Tarea 1)

Investigación para el tablero de pauta: de qué cuenta publicitaria de Meta sale
cada anuncio que trajo clientes por WhatsApp desde el 13-jul-2026. Sin este
mapeo el tablero mostraría el anuncio con más chats (`120249663261930600`, 368
chats en IND) con gasto $0 y ROAS infinito, porque ese anuncio **no vive en
ninguna cuenta que la API pueda consultar**.

Proyecto Supabase usado: `piingkecjgoisnxccvaa` (mandarina-DATA).

## Paso 1: anuncios que hay que ubicar

Consulta sobre `inbox.mensajes` con `referral->>'source_id'` desde el
13-jul-2026: salieron **33 anuncios** (no ~34), 20 de la cuenta `IND` y 13 de
`MANDI`, con 1248 chats en total.

## Paso 2: las 16 cuentas publicitarias

`ads_get_ad_accounts` devolvió 16 cuentas. Se descartaron 5 antes de consultar
anuncio por anuncio:

| ad_account_id | nombre | motivo de descarte |
|---|---|---|
| `243532905688515` | (sin nombre) | `account_status: DISABLED`, `is_queryable: false` — "flagged por actividad inusual" |
| `1461049912075189` | Mandarina Republic (Read-Only) | `account_status: DISABLED`, `is_queryable: false` — mismo motivo |
| `870188658960036` | Mandarina Republic (Read-Only) | `is_ads_mcp_enabled: false` ("Ads MCP is gradually being rolled out") — la propia herramienta prohíbe usarla aunque `is_queryable` sea `true` |
| `1447332230100183` | Mandarina Republic (Read-Only) | igual que arriba |
| `1551762756106123` | Mandarina Republic (Read-Only) | igual que arriba |

Quedaron **11 cuentas consultables**. Se les corrió `ads_get_ad_entities`
(`level: ad`, campos `id,name,amount_spent,impressions,campaign_id`, rango
`2026-07-13` a `2026-07-30`, `sort: impressions_descending`, `limit: 200`) y
**9 de las 11 devolvieron cero anuncios** (confirmado además con
`date_preset: maximum`, o sea nunca tuvieron un anuncio, ni siquiera fuera del
rango de fechas):

`1261033825398074`, `764308613219252` (Mandarina Lab - WhatsApp for Shopify),
`842013491909964`, `675324778794194`, `1431125065267536`, `839441791828661`,
`909054595327442`, `1307108744775475`, `2512693612480595`.

Solo **2 cuentas tuvieron anuncios reales**: `360623391212876`
(MandarinaLaBMKT) y `1500806130455765` (IndStore).

**Ninguna cuenta paga anuncios de las dos tiendas a la vez** — cada una de las
dos cuentas activas solo trajo coincidencias de un lado (MandarinaLaBMKT ↔
MANDI, IndStore ↔ IND). No se rompe ese supuesto del diseño.

## Paso 3: cruce anuncio por cuenta

### Tabla de cuentas

| ad_account_id | nombre | tienda_id | moneda | anuncios del inbox |
|---|---|---|---|---|
| `1500806130455765` | IndStore | INDSTORE | USD | 8 de 20 (73 chats) |
| `360623391212876` | MandarinaLaBMKT | MANDARINA | USD | 12 de 13 (311 chats) |

Las demás 9 cuentas consultables no aportan ningún anuncio del inbox (0
coincidencias) — se omiten de la tabla porque no tienen tienda_id que
asignarles; ver "Cuentas sin datos" abajo si se necesita el detalle.

### Anuncios de IND encontrados en IndStore (8)

| ad_id | chats | titular |
|---|---|---|
| `120249974136450600` | 31 | LA NECESITO |
| `120250003653260600` | 22 | Quiero comprar |
| `120249974153650600` | 10 | Chatear |
| `120249974153640600` | 4 | Chatear |
| `120249974136470600` | 3 | Chatear |
| `120249974153660600` | 1 | CONJUNTOS EN MAS DE 54 COLORES DISPONIBLES |
| `120249974153630600` | 1 | Chatear |
| `120250002343420600` | 1 | IND STORE |

### Anuncios de MANDI encontrados en MandarinaLaBMKT (12)

| ad_id | chats | titular |
|---|---|---|
| `120252247632190606` | 103 | Mandarina Republic |
| `120250156746210606` | 88 | Mandarina Republic |
| `120247696914820606` | 59 | Chatear con nosotros |
| `120252042893220606` | 24 | Chatear con nosotros |
| `120250156292050606` | 14 | Mandarina Republic |
| `120249837561070606` | 8 | api.whatsapp.com |
| `120249481156510606` | 4 | Chaqueta Ben 10 \| Envío Gratis 👽 |
| `120252247866450606` | 3 | Chatear con nosotros |
| `120252247535600606` | 2 | Chatear con nosotros |
| `120252420807580606` | 2 | Chatear con nosotros |
| `120249837541660606` | 2 | api.whatsapp.com |
| `120250159728190606` | 2 | Chatear con nosotros |

## Anuncios sin cuenta

Estos anuncios **no aparecieron en ninguna de las 11 cuentas consultables**,
ni con el rango 13-jul→30-jul ni repitiendo con `date_preset: maximum` (todo
el historial de la cuenta). El tablero los debe marcar `⚠ sin gasto`.

### IND — 12 anuncios sin resolver, 863 chats

| ad_id | chats | titular |
|---|---|---|
| `120249663261930600` | 368 | Status ad |
| `120249665639710600` | 117 | LA NECESITO |
| `120249663292400600` | 112 | Chatear |
| `120249904356800600` | 109 | LA NECESITO |
| `120249661721850600` | 71 | Set Minimalist Cream: Hoodie & Jogger |
| `120249669461120600` | 43 | QUIERO COMPRAR |
| `120249671400450600` | 14 | MAS INFORMACION |
| `120249663221800600` | 13 | CREW NECK SPIDERMAN |
| `120249904506080600` | 6 | LA NECESITO |
| `120249904356790600` | 4 | Chatear |
| `120249662288960600` | 3 | mab.studioo |
| `120249904356780600` | 3 | MAS INFORMACION |

Esto incluye el caso que dispara la Tarea 1: `120249663261930600` (368 chats,
el anuncio con más tráfico de todo el inbox) no vive en `1500806130455765`
(IndStore) ni en ninguna otra cuenta consultable.

**Hipótesis más probable, sin confirmar:** estos 12 anuncios viven en una de
las dos cuentas `DISABLED` (`243532905688515` o `1461049912075189`), que la
API rechaza directamente, o en una de las 3 cuentas con
`is_ads_mcp_enabled: false` (`870188658960036`, `1447332230100183`,
`1551762756106123`) que esta herramienta tiene prohibido consultar aunque
figuren como `is_queryable: true`. No se pudo verificar ninguna de las dos
hipótesis con las herramientas disponibles en esta sesión — haría falta
acceso directo a Meta Business Manager (o rehabilitar esas cuentas) para
confirmarlo.

### MANDI — 1 anuncio sin resolver, 1 chat

| ad_id | chats | titular |
|---|---|---|
| `120244193056830600` | 1 | api.whatsapp.com |

Impacto bajo (1 chat), pero se documenta por la misma razón: no inventar el
mapeo.

## Cuentas sin datos (consultadas, cero anuncios)

Para que quede completo el rastro de las 16 cuentas: estas 9 se consultaron
igual que las dos buenas (incluyendo `date_preset: maximum`) y no tienen
ningún anuncio, nunca — no son candidatas a mapear ninguna tienda:

`1261033825398074`, `764308613219252`, `842013491909964`, `675324778794194`,
`1431125065267536`, `839441791828661`, `909054595327442`, `1307108744775475`,
`2512693612480595`.

Y estas 5 no se pudieron consultar en absoluto (ver Paso 2 para el motivo):
`243532905688515`, `1461049912075189`, `870188658960036`, `1447332230100183`,
`1551762756106123`.

## Resumen para la Tarea 2 (semilla de `crm.pauta_cuentas`)

```
ad_account_id      | nombre           | tienda_id  | moneda
1500806130455765   | IndStore         | INDSTORE   | USD
360623391212876    | MandarinaLaBMKT  | MANDARINA  | USD
```

Cobertura real del inbox con esta semilla: 20 de 33 anuncios (384 de 1248
chats). El resto (13 anuncios, 864 chats) queda sin cuenta y debe mostrarse
como `⚠ sin gasto`, no como gasto $0 real.
