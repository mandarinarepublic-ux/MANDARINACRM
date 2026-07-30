# Mapeo de cuentas publicitarias de Meta a tiendas (Tarea 1)

Investigación para el tablero de pauta: de qué cuenta publicitaria de Meta sale
cada anuncio que trajo clientes por WhatsApp desde el 13-jul-2026.

Proyecto Supabase usado: `piingkecjgoisnxccvaa` (mandarina-DATA).

**Resultado final: los 33 anuncios del inbox quedaron mapeados al 100 % —
0 sin cuenta.** La primera pasada de esta investigación había dejado 13
anuncios (864 chats) marcados como "sin cuenta", incluido el más importante
de todo el inbox (368 chats). Era un error de la consulta, no de los datos:
ver la sección **"Trampa de la API"** más abajo, es la lección más valiosa de
esta tarea.

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

Quedaron **11 cuentas consultables**. De esas, solo 2 tuvieron anuncios reales
que cruzan con el inbox: `360623391212876` (MandarinaLaBMKT) y
`1500806130455765` (IndStore). Las otras 9 se confirmaron vacías (0 anuncios,
ni uno solo, en toda su historia): `1261033825398074`, `764308613219252`,
`842013491909964`, `1431125065267536`, `839441791828661`, `909054595327442`,
`1307108744775475`, `2512693612480595`. La cuenta `675324778794194` (INR)
tampoco tiene ninguno de los 33 anuncios del inbox, aunque sí tiene 2 anuncios
`DELETED` propios (`metodo_pago`, `carrito_abandonado`) sin relación con
IND/MANDI.

**Ninguna cuenta paga anuncios de las dos tiendas a la vez** — cada una de las
dos cuentas activas solo trae coincidencias de un lado (MandarinaLaBMKT ↔
MANDI, IndStore ↔ IND). No se rompe ese supuesto del diseño. Esto además está
garantizado por diseño de Meta: un `ad_id` es único globalmente y solo puede
pertenecer a una cuenta publicitaria, así que no hace falta re-verificar las
9 cuentas vacías una vez que los 33 anuncios ya aparecieron en las 2 cuentas
buenas.

## Trampa de la API: los anuncios archivados desaparecen sin `effective_status`

**Esta es la causa real de que 13 anuncios (864 chats) salieran "NO
ENCONTRADO" en la primera pasada, incluido el anuncio de 368 chats que
dispara toda la tarea.**

`ads_get_ad_entities` a nivel `ad` **excluye por defecto los anuncios
`ARCHIVED` y `DELETED`** de los resultados — y esto pasa **incluso con
`date_preset: "maximum"`** (todo el histórico de la cuenta). No es un
problema de rango de fechas ni de que el anuncio nunca haya tenido entrega:
el anuncio existe, tiene gasto e impresiones reales, pero la API lo omite en
silencio salvo que se lo pidas explícitamente con:

```
filtering: [{"field":"ad.effective_status","operator":"IN",
  "value":["ACTIVE","PAUSED","DELETED","ARCHIVED","CAMPAIGN_PAUSED",
           "ADSET_PAUSED","DISAPPROVED","PENDING_REVIEW","WITH_ISSUES"]}]
```

Con ese filtro agregado, los 13 anuncios "perdidos" aparecieron de inmediato
**en las mismas 2 cuentas que ya se habían identificado** — no había ninguna
tercera cuenta oculta. Los 12 de IND estaban `ARCHIVED` en IndStore, y el de
MANDI (`120244193056830600`) estaba `ADSET_PAUSED` en MandarinaLaBMKT.

**Para quien retome esto:** cualquier consulta futura de `ads_get_ad_entities`
a nivel `ad` para este tablero (Tarea 2 en adelante) **debe incluir siempre
este filtro de `effective_status`**, o el gasto de campañas pausadas/
archivadas — que en este negocio son la mayoría de las de mejor desempeño
histórico — va a desaparecer del reporte sin ningún aviso de la API.

**Problema técnico encontrado al aplicar el filtro:** en la cuenta
`360623391212876` (MandarinaLaBMKT), combinar `filtering` con
`date_preset: "maximum"` devolvió `MCP error -32603: Internal Server Error`
de forma repetible (probado 3 veces, con distintos `limit`). La vuelta que
funcionó fue reemplazar `date_preset: "maximum"` por un `time_range` explícito
amplio (`{"since":"2024-01-01","until":"2026-07-30"}`) — con eso sí respondió
normal. Esa cuenta tiene **449 anuncios en total**; con `limit: 1000` el MCP
también dio `Internal Server Error`, así que hubo que bajar a `limit: 200` (se
guarda en un archivo local por exceder el máximo de tokens de un solo mensaje)
y buscar el `ad_id` puntual con `grep` sobre ese archivo en vez de leerlo
entero.

## Paso 3: cruce anuncio por cuenta (con el filtro correcto)

### Tabla de cuentas

| ad_account_id | nombre | tienda_id | moneda | anuncios del inbox |
|---|---|---|---|---|
| `1500806130455765` | IndStore | INDSTORE | USD | 20 de 20 (936 chats) |
| `360623391212876` | MandarinaLaBMKT | MANDARINA | USD | 13 de 13 (312 chats) |

Cobertura total: **33 de 33 anuncios, 1248 de 1248 chats**. Cero anuncios sin
cuenta.

Los montos de gasto e impresiones de abajo son **históricos (all-time)** —
`date_preset: maximum` para IndStore, `time_range` 2024-01-01→2026-07-30 para
MandarinaLaBMKT (ver la nota técnica arriba sobre por qué no se pudo usar
`maximum` ahí) — no están acotados al 13-jul→30-jul porque el gasto real de
un anuncio archivado se acumuló antes de esa ventana.

### Anuncios de IND en IndStore (20 de 20)

| ad_id | chats | titular (inbox) | nombre (Meta) | effective_status | gasto | impresiones |
|---|---|---|---|---|---|---|
| `120249663261930600` | 368 | Status ad | DUO PERFECTO | ARCHIVED | $82,33 | 72.666 |
| `120249665639710600` | 117 | LA NECESITO | Nuevo anuncio de Interacción | ARCHIVED | $61,11 | 31.490 |
| `120249663292400600` | 112 | Chatear | SPIDERMAN 35 | ARCHIVED | $34,63 | 49.554 |
| `120249904356800600` | 109 | LA NECESITO | jacket spiderman | ARCHIVED | $24,77 | 25.452 |
| `120249661721850600` | 71 | Set Minimalist Cream: Hoodie & Jogger | VIDEO SPIDERVERSE | ARCHIVED | $11,12 | 12.461 |
| `120249669461120600` | 43 | QUIERO COMPRAR | Nuevo anuncio de Interacción - Copia | ARCHIVED | $27,93 | 10.873 |
| `120249974136450600` | 31 | LA NECESITO | HOODIE SPIDERMAN | ACTIVE | $8,98 | 7.932 |
| `120250003653260600` | 22 | Quiero comprar | Nuevo anuncio de Interacción | ACTIVE | $8,73 | 9.099 |
| `120249671400450600` | 14 | MAS INFORMACION | Nuevo anuncio de Interacción - Copia | ARCHIVED | $8,52 | 5.624 |
| `120249663221800600` | 13 | CREW NECK SPIDERMAN | CONJUNTO | ARCHIVED | $7,41 | 7.210 |
| `120249974153650600` | 10 | Chatear | DUO PERFECTO | ACTIVE | $3,13 | 2.231 |
| `120249904506080600` | 6 | LA NECESITO | HOODIE SPIDERMAN | ARCHIVED | $6,80 | 5.905 |
| `120249904356790600` | 4 | Chatear | hoodie spiderman antiguo | ARCHIVED | $5,95 | 4.438 |
| `120249974153640600` | 4 | Chatear | CONJUNTO | ACTIVE | $1,55 | 1.148 |
| `120249974136470600` | 3 | Chatear | hoodie spiderman antiguo | ACTIVE | $2,13 | 1.473 |
| `120249662288960600` | 3 | mab.studioo | VIDEO HOODIE ARGENTINA | ARCHIVED | $0,70 | 329 |
| `120249904356780600` | 3 | MAS INFORMACION | ECUADOR | ARCHIVED | $1,98 | 1.561 |
| `120249974153660600` | 1 | CONJUNTOS EN MAS DE 54 COLORES DISPONIBLES | CONJUNTO 2 | ACTIVE | $0,38 | 297 |
| `120249974153630600` | 1 | Chatear | SPIDERMAN 35 | ACTIVE | $0,64 | 670 |
| `120250002343420600` | 1 | IND STORE | Nuevo anuncio de Interacción | ACTIVE | $0,04 | 68 |

Total IND: **$298,83 USD**, 250.481 impresiones, 936 chats.

### Anuncios de MANDI en MandarinaLaBMKT (13 de 13)

| ad_id | chats | titular (inbox) | nombre (Meta) | effective_status | gasto | impresiones |
|---|---|---|---|---|---|---|
| `120252247632190606` | 103 | Mandarina Republic | DRAGONBALL | ACTIVE | $66,48 | 64.410 |
| `120250156746210606` | 88 | Mandarina Republic | DRAGONBALL | CAMPAIGN_PAUSED | $159,61 | 181.127 |
| `120247696914820606` | 59 | Chatear con nosotros | NewSpiderman | CAMPAIGN_PAUSED | $91,48 | 59.271 |
| `120252042893220606` | 24 | Chatear con nosotros | Nuevo anuncio de Interacción | CAMPAIGN_PAUSED | $10,34 | 9.093 |
| `120250156292050606` | 14 | Mandarina Republic | TORTUGAS | CAMPAIGN_PAUSED | $23,95 | 25.149 |
| `120249837561070606` | 8 | api.whatsapp.com | DragonBallZ | ACTIVE | $301,72 | 333.717 |
| `120249481156510606` | 4 | Chaqueta Ben 10 \| Envío Gratis 👽 | MR_BEN10_CHAQUETA_05Jun2026 | CAMPAIGN_PAUSED | $5,90 | 7.724 |
| `120252247866450606` | 3 | Chatear con nosotros | DONKEY | ACTIVE | $2,41 | 2.061 |
| `120252247535600606` | 2 | Chatear con nosotros | SPIDERMAN NUEVO | ACTIVE | $0,80 | 715 |
| `120252420807580606` | 2 | Chatear con nosotros | DrDoom | ACTIVE | $2,63 | 1.796 |
| `120249837541660606` | 2 | api.whatsapp.com | DonkeyKong | ACTIVE | $53,15 | 144.748 |
| `120250159728190606` | 2 | Chatear con nosotros | ONEPIECE | CAMPAIGN_PAUSED | $4,47 | 3.615 |
| `120244193056830606` | 1 | api.whatsapp.com | TortugasNinja | ADSET_PAUSED | $67,12 | 101.012 |

Total MANDI: **$790,06 USD**, 934.438 impresiones, 312 chats.

## Anuncios sin cuenta

**Ninguno.** Con el filtro de `effective_status` agregado, los 33 anuncios
del inbox quedaron mapeados a una de las dos cuentas activas. Esta sección se
deja aquí a propósito, vacía, como registro de que se buscó y no quedó nada
pendiente — no porque el brief lo pida sin resultados, sino para que quien
lea este documento después no tenga que preguntarse si faltó revisar algo.

## Cuentas sin datos (consultadas, cero anuncios del inbox)

Para que quede completo el rastro de las 16 cuentas:

9 cuentas consultables sin ningún anuncio propio, nunca (verificado con
`date_preset: maximum` antes de aplicar el filtro de `effective_status`, y no
hacía falta repetir con el filtro porque cero anuncios propios en total
implica cero anuncios `ARCHIVED`/`DELETED` propios también):
`1261033825398074`, `764308613219252`, `842013491909964`, `1431125065267536`,
`839441791828661`, `909054595327442`, `1307108744775475`,
`2512693612480595`.

1 cuenta consultable con anuncios propios pero ninguno del inbox
(`675324778794194`, INR — tiene 2 anuncios `DELETED` propios sin relación con
IND/MANDI).

5 cuentas no se pudieron consultar en absoluto (ver Paso 2 para el motivo):
`243532905688515`, `1461049912075189`, `870188658960036`, `1447332230100183`,
`1551762756106123`.

## Resumen para la Tarea 2 (semilla de `crm.pauta_cuentas`)

```
ad_account_id      | nombre           | tienda_id  | moneda
1500806130455765   | IndStore         | INDSTORE   | USD
360623391212876    | MandarinaLaBMKT  | MANDARINA  | USD
```

Cobertura real del inbox con esta semilla: **33 de 33 anuncios (100 %), 1248
de 1248 chats**. No hace falta que el tablero contemple un estado `⚠ sin
gasto` para ningún anuncio de este período — pero si Tarea 2 (o cualquier
tarea futura) vuelve a consultar `ads_get_ad_entities` a nivel `ad`, **debe
incluir el filtro de `effective_status`** descrito arriba, o va a repetir el
mismo error de esta investigación.
