# Tablero de pauta — diseño

**Fecha:** 30-jul-2026
**Repo:** MANDARINACRM (proyecto Vercel `mandarina-pro-sales`)
**Ruta:** `/dashboard/pauta`
**Acceso:** solo ADMIN

---

## 1. Para qué

Responder, por tienda y hasta el nivel de cada arte: **cuánto gasté, cuántos leads
entraron, cuántos compraron, y cuánto me devolvió.**

Hoy esa pregunta no se puede contestar. El gasto vive en Meta, los mensajes en el
schema `inbox` y las ventas en el schema `crm`, y nada los cruza.

## 2. Por qué en el CRM y no en los inbox

- Es el único de los tres proyectos que tiene las **ventas** (`crm.pedidos`).
- Es el único con **roles**: `lib/auth.js` ya valida el rol contra la base y el
  ADMIN ya tiene el permiso `'reportes'`. Los inbox no tienen roles y sus repos
  son públicos.
- Los inbox son **dos apps** (MANDI e IND): el tablero quedaría duplicado.
- Ya hay precedente de leer el schema `inbox` desde el CRM
  (`lib/inbox-supabase.js`, para el chat dentro del pedido).

## 3. Hallazgos del diagnóstico

Medidos el 30-jul-2026 contra producción. Son la base del diseño.

### 3.1 La atribución a nivel de arte es posible

`inbox.mensajes.referral->>'source_id'` **es el ID del anuncio de Meta**. Hay 34
anuncios distintos identificados (21 de IND, 13 de MANDI) y `ctwa_clid` presente
en 1.249 mensajes.

### 3.2 La captura de referral arrancó el 13-jul-2026

| Semana | IND con referral | MANDI con referral |
|---|---|---|
| hasta 06-jul | 2–4 % | 0–1 % |
| **13-jul** | **89 %** | **78 %** |
| 20-jul | 94 % | 98 % |
| 27-jul | 74 % | 70 % |

Antes del 13-jul el referral **no se estaba guardando**. Cualquier análisis de
pauta anterior a esa fecha es ruido, no historia.

### 3.3 El embudo real (chats nacidos desde el 13-jul, con anuncio)

| | Llegaron | Respondieron | Conversaron (5+ msgs) | Compraron |
|---|---|---|---|---|
| IND | 876 | 511 (58 %) | 125 (14 %) | 9 |
| MANDI | 290 | 198 (68 %) | 64 (22 %) | 3 |

El escalón que sangra es el cierre: de los que conversaron en serio, compra el
7 % en IND y el 5 % en MANDI.

### 3.4 El lead de pauta convierte 6x peor que el orgánico

| | Personas | Compradores | Conversión |
|---|---|---|---|
| IND de pauta | 876 | 9 | 1,0 % |
| IND sin pauta | 171 | 10 | 5,8 % |
| MANDI de pauta | 290 | 3 | 1,0 % |
| MANDI sin pauta | 66 | 4 | 6,1 % |

El patrón se repite idéntico en las dos cuentas. Es un hallazgo real, no un
error de captura.

### 3.5 Hay tres verdades distintas sobre la misma venta

| Fuente | Qué dice | Problema |
|---|---|---|
| **Meta** | ROAS 5,9x / 8,9x en IND | En MANDARINA dice "Not available" en 3 de 4 campañas |
| **CRM** | $768 rastreables a pauta | Se queda corto: cruce estricto por teléfono |
| **Negocio** | $1.347 de gasto → $16.325 de venta = **12x** | No dice qué campaña funcionó |

Ninguna miente; miden cosas distintas. **El tablero muestra las tres.**

### 3.6 Gasto y MER de julio

| | Gasto 30d | Ventas julio | MER |
|---|---|---|---|
| INDSTORE | $775,21 (8 campañas con gasto, de 41) | $9.869,45 | 12,7x |
| MANDARINA | $572,06 (4 campañas) | $6.455,54 | 11,3x |

### 3.7 ⚠ Hay gasto en una cuenta publicitaria sin identificar

El anuncio `120249663261930600` ("Status ad") generó **368 conversaciones** desde
el 13-jul — la mayor fuente de leads de IND. **No aparece** en la cuenta
publicitaria `1500806130455765` (IndStore): los anuncios de esa cuenta en la
misma ventana suman $71 y ninguno pasa de 700 impresiones.

Hay 16 cuentas publicitarias, varias con nombres repetidos y forma de pago
activa, y dos DISABLED que la API ya no deja consultar. **Resolver el mapeo
cuenta→tienda es la primera tarea de la implementación.**

### 3.8 Campos que están muertos — no diseñar sobre ellos

| Campo | Lleno en | Conclusión |
|---|---|---|
| `inbox.conversaciones.id_venta` | 11 de 2.555 | Nadie lo llena |
| `inbox.conversaciones.temperatura` | 24 de 2.555 | Nadie lo llena |

Todo escalón del embudo se calcula **automáticamente**. Ninguno depende de que
alguien marque algo a mano.

---

## 4. Decisiones tomadas

| # | Decisión |
|---|---|
| D1 | Vive en MANDARINACRM, ruta `/dashboard/pauta`, solo ADMIN |
| D2 | Arquitectura híbrida: gasto cacheado a diario, embudo calculado en vivo |
| D3 | Se muestran los **tres** ROAS lado a lado (Meta, CRM, y la brecha) |
| D4 | El embudo es 100 % automático — nada depende de marcado manual |
| D5 | Análisis **separado** por INDSTORE y MANDARINA REPUBLIC, nunca mezclados |
| D6 | Lo no atribuible va en cubetas aparte, no se mezcla ni se resta |
| D7 | Se muestra el arte: foto archivada + texto del anuncio |

### Por qué híbrida (D2)

- El gasto de días pasados es casi inmutable (Meta ajusta ~3 días), así que
  cachearlo no cuesta frescura.
- El embudo se calcula en ~1 segundo sobre todo el histórico: precalcularlo sería
  inventar un caché que puede quedar desincronizado.
- El snapshot protege de dos cosas reales: **los renombres reescriben la
  historia** (renombrar una campaña cambia también el reporte de julio) y **las
  cuentas desactivadas dejan de responder** (ya hay dos así).

Nota: las campañas nunca se borran, solo se pausan. Por eso `pauta_dia` guarda
`estado`, para separar "lo que corre hoy" de "todo lo que corrió alguna vez".

---

## 5. Arquitectura

| Archivo | Responsabilidad |
|---|---|
| `lib/metaAds.js` | Lee la Marketing API. Hermano de `lib/metaCapi.js`, que solo escribe. Server-only. |
| `lib/pauta.js` | Atribución y armado del embudo. Funciones puras + consultas. Server-only. |
| `app/api/cron/pauta/route.js` | Cron diario: baja gasto, archiva artes nuevos. |
| `app/api/pauta/route.js` | Sirve el tablero. Protegido con `requireAdmin`. |
| `app/dashboard/pauta/page.js` | La pantalla. |
| `scripts/test-pauta.mjs` | Pruebas de la atribución. |

Cada archivo tiene un propósito y se puede entender solo. `lib/pauta.js` no sabe
de HTTP; `lib/metaAds.js` no sabe de atribución.

---

## 6. Modelo de datos

Dos tablas nuevas en el schema `crm`.

### `crm.pauta_cuentas`

El mapa que hoy no existe (ver 3.7). Es tabla y no código fijo porque va a
cambiar.

```
ad_account_id   text primary key
nombre          text
tienda_id       text        -- INDSTORE | MANDARINA
moneda          text
activa          boolean default true
notas           text
```

### `crm.pauta_dia`

Foto diaria del gasto. Llave `(fecha, ad_id)`.

```
fecha              date
ad_id              text
ad_account_id      text
tienda_id          text
campaign_id        text
campaign_nombre    text
adset_id           text
adset_nombre       text
ad_nombre          text
estado             text        -- ACTIVE | PAUSED | CAMPAIGN_PAUSED …
gasto              numeric
impresiones        bigint
clics              bigint
conversaciones_meta bigint
valor_meta         numeric     -- venta que Meta atribuye
roas_meta          numeric
creative_id        text
arte_url           text        -- ya archivada en Supabase Storage
arte_tipo          text        -- image | video
arte_texto         text        -- copy del anuncio
arte_titular       text
actualizado_at     timestamptz
```

Los nombres van **desnormalizados a propósito**: el reporte de julio debe seguir
diciendo lo que decía en julio, aunque después renombres la campaña.

El embudo **no se guarda**: se calcula en vivo.

### Bucket `pauta-artes` (Supabase Storage)

Las URLs de imagen que trae el referral son firmadas por Meta y **caducan**. El
cron archiva el arte una sola vez por `ad_id`, siguiendo el mismo patrón que
`lib/media-archive.js` usa hoy para las fotos entrantes del WhatsApp
(bucket `inbox-media`).

---

## 7. Regla de atribución

**R1 · De qué anuncio es una persona.** Si su conversación trae
`referral.source_id`, es de ese anuncio. Si llegó por varios, cuenta **el último
antes del pedido** — mismo criterio que Meta, para que las columnas sean
comparables.

**R2 · Ventana.** Una venta cuenta si el pedido cae dentro de **30 días** desde
el primer contacto. Configurable. Meta usa 7 días de clic; con 7 el ROAS-CRM se
vería peor de lo que es, porque el ciclo por WhatsApp es más largo (hay
confección de por medio).

**R3 · Fecha piso: 13-jul-2026.** El tablero **no muestra pauta anterior**, ni en
cero. Un cero ahí se leería como "la pauta no trajo nada" cuando la verdad es "no
estábamos mirando".

**R4 · Tres cubetas separadas.**

| Cubeta | Definición | Julio |
|---|---|---|
| De pauta | Chat con `source_id` identificado | 1.166 personas |
| Sin pauta | Chat sin anuncio: orgánico, recurrente, directo | 237 personas |
| Sin chat | Pedido sin conversación en el inbox | ~178 pedidos |

La tercera cubeta es grande y hoy es invisible: 98 pedidos de IND y 80 de
MANDARINA en julio. Son ventas de mostrador, web o teléfono. **No son fracaso de
la pauta y no deben restarle.**

### Cruce teléfono CRM ↔ inbox

Últimos 9 dígitos, igual que `lib/inbox-supabase.js`. Verificado: 85 de 183
pedidos de IND en julio encuentran su chat, 28 de 108 en MANDARINA.

---

## 8. Pantallas

Una sola ruta. La tienda es el interruptor principal arriba; nunca se mezclan.

### Cabecera

```
INDSTORE · 13–30 jul                          [INDSTORE] [MANDARINA]

  Gasto $775      Venta total $9.869      MER 12,7x
  ────────────────────────────────────────────────────────
  De pauta 1.166 · Sin pauta 237 · Sin chat 98 pedidos
```

### Embudo

De la cubeta seleccionada (por defecto, la de pauta), con el % de caída en cada
escalón y el escalón que más sangra marcado.

```
Impresiones      156.029
Clics              3.811   2,4 %
Llegaron al chat     876   23 %
Respondieron         511   58 %
Conversaron          125   24 %
Pedido                 9    7 %   ⚠ aquí sangra
Pagado           (por medir)
```

Cifras reales de IND (§3.3), salvo "Pagado", que todavía no se midió.

**Definición exacta de cada escalón** — todos automáticos, ninguno depende de
marcado manual:

| Escalón | Cómo se calcula |
|---|---|
| Impresiones / Clics | De `crm.pauta_dia` (Meta) |
| Llegaron al chat | Personas distintas con `referral.source_id` de ese anuncio |
| Respondieron | ≥ 2 mensajes ENTRANTES de esa persona |
| Conversaron | ≥ 5 mensajes ENTRANTES de esa persona |
| Pedido | Pedido en `crm.pedidos` dentro de la ventana (R2) |
| Pagado | `estado_pago` del pedido |

Los umbrales (2 y 5) son un punto de partida razonable, no una verdad. Quedan en
una constante nombrada de `lib/pauta.js` para poder moverlos.

### Tabla — campaña → conjunto → arte

Los números de este bosquejo y el de la ficha son **de ejemplo**, para mostrar la
forma. Las cifras medidas de verdad están en §3.

```
Campaña / Conjunto / Arte      Gasto  Conv  Resp  Ped   Venta   Meta    CRM   Brecha
─────────────────────────────────────────────────────────────────────────────────────
▼ INTERACCION VENTAS WHATSAPP  $149,9  412   240    3    $213   5,93x  1,42x   -76%
   ▼ Conjunto principal        $149,9  412   240    3    $213
      🖼 Status ad             $ 98,2  368   210    2    $142   —      1,45x   ⚠ sin gasto
      🖼 DUO PERFECTO          $  3,1   12     8    0      $0   —      0,00x
▶ CAMPAÑA XAVIER               $145,5  …
```

- **Orden por gasto, no alfabético.** En IND, 33 de 41 campañas gastaron $0; el
  orden las manda al fondo solas.
- **La brecha Meta-vs-CRM es columna**, no nota al pie.
- **`⚠ sin gasto` en vez de $0** cuando el `ad_id` del referral no aparece en
  ninguna cuenta mapeada. Un $0 daría ROAS infinito: sería la mentira más cara
  del tablero.

### Ficha del arte

```
🖼 [foto archivada]        Status ad · imagen · ACTIVE

"🥷🐢 Activa tu modo ninja
 Los nuevos hoodies de las Teenage Mutant Ninja Turtles…"

 Gasto $98,2 · 368 conversaciones · $0,27 por conversación
 368 llegaron → 210 respondieron → 51 conversaron → 2 pedidos → $142
```

El **texto** sale de `referral.body`, que es texto en la base y no caduca. El
**titular** (`referral.headline`) es poco confiable — a veces trae el botón
("Chatear con nosotros"), el dominio ("api.whatsapp.com") o el usuario de
Instagram ("mab.studioo"). Se muestra, pero nada se organiza alrededor de él.

---

## 9. Seguridad

- La API usa `requireAdmin` de `lib/auth.js`, que valida el rol contra la base y
  no confía en el navegador.
- La página valida **del lado servidor**. Esconder el botón del menú no es
  seguridad.
- Gobierna el permiso `'reportes'` que el ADMIN ya tiene en `lib/auth.js`. No se
  inventa un permiso nuevo.
- `META_ADS_TOKEN` (Usuario del Sistema, `ads_read`) es **solo server-side**,
  leído con el helper de `lib/env.js` para esquivar el BOM que PowerShell le mete
  a las variables de Vercel.
- El cron se protege con secreto propio.

## 10. Errores

Si el cron falla, se registra con `lib/eventos.js` y aparece en
`/dashboard/errores`, el mismo tablero donde ya se ven los CAPI caídos. No se
crea un lugar nuevo que revisar.

Casos que la pantalla debe mostrar explícitamente en vez de esconder:

| Caso | Qué muestra |
|---|---|
| `ad_id` sin cuenta mapeada | `⚠ sin gasto` — nunca $0 |
| Meta no devuelve ROAS | `—` — nunca 0,00x |
| Rango anterior al 13-jul | Aviso de que no hay datos de pauta, no un cero |
| Cron no corrió hoy | Fecha del último dato en la cabecera |

## 11. Pruebas

`scripts/test-pauta.mjs`, siguiendo la convención del repo (node directo, sin
framework, como `scripts/test-fechas.mjs`). Cubre la lógica que puede fallar en
silencio:

- R1: último anuncio antes del pedido cuando hay varios.
- R2: pedido dentro y fuera de la ventana de 30 días.
- R3: el piso del 13-jul excluye, no pone en cero.
- R4: las tres cubetas suman el total y no se solapan.
- Cruce de teléfono: `09xxxxxxxx` ↔ `593xxxxxxxxx` ↔ `xxxxxxxxx`.
- Fechas en hora de Ecuador, usando `lib/parseFecha` y corriendo con `TZ=UTC`
  a propósito.

## 12. Fuera de alcance

- **No cambia campañas.** Solo lectura.
- **No incluye YAW.** No pautea; sus $2.246 de julio ensuciarían el MER.
- **No atribuye ventas de la web.** Solo pedidos del CRM. Si alguien ve el
  anuncio y compra en Shopify sin escribir, el tablero no lo ve — y lo dice.
- **No reemplaza el Administrador de anuncios.** Responde "¿cuál de mis artes
  trae plata?", no "¿cómo está el reparto de mi anuncio?".

## 13. Riesgos y pendientes

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El mapeo cuenta→tienda no está resuelto** (3.7) | Primera tarea. Hasta resolverlo, esos artes salen `⚠ sin gasto` |
| 2 | La ventana de 30 días es un supuesto | Configurable; revisar con datos reales a los dos meses |
| 3 | Las URLs de arte de Meta caducan | Archivado propio en `pauta-artes` |
| 4 | El referral solo llega en el **primer** mensaje del chat | Ya es así hoy; por eso la persona se ata al anuncio, no el mensaje |
| 5 | `ctwa_clid` está guardado pero no se usa todavía | Es la llave para cerrar el circuito CAPI Purchase. Queda para después, mismo trabajo |

## 14. Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `META_ADS_TOKEN` | Usuario del Sistema con `ads_read` |
| `CRON_SECRET_PAUTA` | Proteger el cron |

Cargar en Vercel **sin BOM** (ver `lib/env.js`).
