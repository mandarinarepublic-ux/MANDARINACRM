# ESTADO DEL CRM · al 31-ago-2026

**Qué es esto:** el único documento que dice en qué punto está el CRM **hoy**.
Los `HANDOFF-*.md` cuentan lo que pasó en una sesión y no se tocan más; este se
**actualiza al cerrar cada sesión** y siempre habla en presente.

**Cómo usarlo:** léelo antes de tocar el CRM, junto con la skill
`/crm-mandarina`. Si algo de aquí contradice a otro documento, **gana lo que
puedas comprobar contra el código o la base en 30 segundos** — y arregla el otro.

> Todo lo de aquí está **medido el 30-ago-2026**, no copiado de documentos
> anteriores. Varias cosas que se daban por ciertas ya no lo eran.
>
> ⚠️ **Este archivo nació incompleto y eso dice algo.** Se escribió el 30-ago sin
> la integración de Shopify, que llevaba dos días en el repo desde otra sesión.
> Si trabajas en paralelo, `git log --oneline -15` antes de darlo por bueno.

---

## Coordenadas

| cosa | valor |
|---|---|
| Repo local | `C:\Users\RodrigoWork\Desktop\MANDARINACRM` (⚠️ la carpeta con espacio NO es) |
| GitHub | `mandarinarepublic-ux/MANDARINACRM` — **público** |
| Vercel | `mandarina-pro-sales`, región `gru1` |
| Dominio | `crm.apps.mandarinaec.com` (el viejo `mandarina-pro-sales.vercel.app` sigue vivo) |
| Supabase | `piingkecjgoisnxccvaa` (mandarina-DATA), schema `crm`, `service_role` |
| Backend | `DATA_BACKEND=supabase` · Sheets **apagado** desde el 19-ago |
| Pruebas | `npm test` → 501 pruebas |

---

## ☠️ El tope de 1000 de PostgREST: DÓNDE ESTÁ HOY

Fue la causa raíz más cara del repo. **Ya no es un riesgo activo en ninguna de
las rutas que lo tenían.** `docs/../skills/crm-mandarina/tope-1000.md` predice
roturas que **ya no van a pasar**: se blindaron antes de la fecha prevista.

| tabla | filas hoy | ¿expuesta? |
|---|---|---|
| `crm.detalle_pedido` | **1510** | ✅ no — `joinSupabase` pagina en tandas de 120 pedidos |
| `crm.clientes` | **966** | ✅ no — todas las lecturas acotadas; `idsClientesQueCoinciden` avisa con el `count` si trunca |
| `crm.pagos` | 834 | ✅ no — siempre por `pedido_id` |
| `crm.pedidos` | 808 | ✅ no — `listPedidoIds()` **se borró**; el número sale de `siguienteNumeroPedido()`, que lee UNA fila |
| `crm.pauta_dia` | 749 (375 por tienda) | ⚠️ **el único frente abierto**, ver abajo |

### El único que queda: `pauta_dia`

`lib/pauta/consultas.js:29` (`gastoPorAnuncio`) lee con `.eq(tienda)` +
rango de fechas y **sin `.range()`**. Hoy son 375 filas por tienda, creciendo a
**8/día**: una tienda cruzaría las 1000 hacia el **~16-nov-2026**, y solo si el
tablero pide el rango completo.

No es urgente, pero es el que hay que vigilar. El síntoma sería un gasto de pauta
**subestimado en silencio** — no un error.

> **Cómo se comprueba, siempre:** `select count(*)` contra la tabla, no leer un
> documento. Las cifras de arriba caducan solas.

---

## Qué está en producción

**Pedidos y taller.** Colas propias por pantalla (`/api/produccion`, `/api/corte`,
`/api/despacho`, `/api/impresion`, `/api/historial`), cada una con su repositorio
en `lib/db/`. Ninguna pantalla usa ya la lista completa.

**Las ocho bandejas** guardan filtros, paginación, tarjetas abiertas y scroll
(`lib/useEstadoPantalla.js`). Caduca a las 12 h y **avisa** cuando restaura.
Cabecera compartida en cinco de ellas (`components/BarraFiltros.js`): una fila,
panel plegable, chips de lo que está filtrado.

**Historial** filtra por área (`?area=`), pagina de a 30 en el servidor y admite
el permiso `VER_TODAS_LAS_VENTAS`.

**Gráficos de ventas en Inicio (31-ago, RECIÉN DESPLEGADO).** Dos cuadros de
barras: histórico por mes a la izquierda, día a día del mes en curso a la
derecha (`components/GraficosVentas.js` + `GraficoBarras.js`, helpers puros y
probados en `lib/grafico.js`). Los ve **ADMIN** con todo y cada **VENDEDOR** con
lo suyo; **YAW queda fuera a propósito** y hay una prueba que lo sostiene.

Las series las agrega la base: `crm.resumen_inicio` devuelve `ventasPorDia`,
`ventasPorMes`, `primerPedido` y `hoyEcuador`. El recorte por vendedor lo hace
**la función**, a partir de la cookie firmada — la pantalla no filtra nada.

☠️ **Las barras suman EXACTAMENTE lo que dicen las tarjetas de arriba** (sin
excluir CANCELADO, igual que ellas): medido, $15.025,14 contra $15.025,14. Si
algún día se cambia el criterio en un lado, hay que cambiarlo en los dos o la
diferencia se leerá como un bug del panel.

☠️ Tres trampas de lectura ya cerradas, cada una con su prueba: un día sin
ventas sale como **barra en cero** (marca gris al ras) y no desaparece · el
**primer mes va marcado como parcial** —el CRM arrancó el **18-jun-2026**, así
que junio son 13 días y no una caída— y a un vendedor la nota le habla de **su**
primer pedido, no del CRM · el **mes en curso** también va marcado, y la
advertencia se apaga sola el día que el mes cierra.

**Pedidos de Shopify → CRM (28/30-ago, RECIÉN DESPLEGADO).** Un webhook mete
solos los pedidos pagados de la tienda web: `POST /api/shopify/pedidos`, con
verificación **HMAC por tienda** (`lib/shopifyWebhook.js`) y mapeo puro en
`lib/shopifyPedido.js`. Entra como el usuario **TIENDA WEB**, firmando una sesión
con `SHOPIFY_VENDEDOR_USUARIO_ID`. Cuatro archivos de prueba.

- La ruta está **abierta en el middleware** a propósito: se defiende sola con el
  HMAC, no con la cookie.
- A Shopify se le devuelve **200 siempre que ya se hizo lo que había que hacer**.
  Si recibe un error reintenta 19 veces y acaba borrando la suscripción sola.
- ☠️ Shopify manda `orders/create` **y** `orders/paid` del mismo pedido con
  milisegundos de diferencia. Se ramifica por `x-shopify-topic`: sin eso los dos
  pasaban el `select` a la vez y creaban dos pedidos — el índice único llega un
  paso tarde.

**Variables (comprobadas el 30-ago):** `SHOPIFY_VENDEDOR_USUARIO_ID` ✅ (puesta
ese mismo día), `SESSION_SECRET` ✅, y los `CLIENT_SECRET`/`STORE`/`TOKEN` de las
dos tiendas ✅.

⚠️ **NO existe ningún `SHOPIFY_<TIENDA>_WEBHOOK_SECRET`.** No es un fallo por sí
solo: `secretoDeFirma()` cae al `CLIENT_SECRET`, que es el correcto **si el
webhook se creó desde la app**. Pero si se crea **a mano en el panel de Shopify**,
Shopify genera un secreto propio y **todas las firmas fallarán con 401** hasta que
se añada esa variable. Es exactamente para lo que existe el commit `792f6e70`.

⚠️ **Cero pedidos web en la base al 30-ago.** Está desplegado pero **no ha pasado
un solo pedido real todavía**: no está verificado de punta a punta. Ver pendientes.

**Facturación Dátil** emisión directa + botón manual de rescate.
**Pauta** tablero, artes y CAPI `Purchase` con atribución.
**Impresión** hoja de cliente + hoja de confección, con el pago correcto.

---

## Quién ve qué

Tres cosas **distintas**, y se confunden todo el rato:

| decide | de dónde sale | a quién aplica |
|---|---|---|
| Qué **pedidos** | el ROL (`VENDEDOR` → solo los suyos, por `vendedor_id`) | todos menos ADMIN |
| De qué **tienda** | `usuarios.tiendas` | solo roles de venta |
| De qué **área** | `usuarios.areas` | producción |

Permisos por persona en `usuarios.accesos`, marcables en la pantalla de Usuarios:
`VENTAS` · `INBOX_MANDARINA` · `INBOX_INDSTORE` · `VER_TODAS_LAS_VENTAS`
(hoy **solo JACKELINE**: ve las ventas de todos en MANDARINA e INDSTORE, 678; YAW
no). **Viajan en la cookie → hay que reentrar.**

☠️ **Antes de tocar permisos, mira `crm.usuarios` PRIMERO.** El 29-ago se pidió
que JACKELINE viera las dos tiendas y `tiendas` **ya tenía las dos**: lo que
limitaba era el ROL. Cambiar `tiendas` no habría hecho nada.

✅ Las APIs están blindadas (ago-2026): la identidad sale de la cookie firmada y
`/api/pedidos` ignora `?rol`/`?vendedor`/`?scope`. `?all=1` ya no existe.

⚠️ `VER_TODAS_LAS_VENTAS` **no toca los gráficos de Inicio**: levanta el filtro
por vendedor del Historial **y solo ese**. JACKELINE ve ahí sus propias ventas.
Es lo documentado, no un descuido.

---

## Pendientes vivos

| # | qué | cómo se cierra |
|---|---|---|
| 1 | **El refresco silencioso de Producción y Corte no se probó en vivo** | Abrir Producción, bajar, cambiar de pestaña, volver. Si no parpadea el spinner y sigues donde estabas, cerrado |
| 2 | Corte (23%) e Impresión (19%) siguen con la cabecera alta | Decidir si los contadores encogen a píldoras. **No decidido** |
| 3 | El desplegable de Área cae solo en una 2.ª fila del panel | Cosmético |
| 4 | `AREAS` desincronizada entre `lib/pedidos.js` y `lib/pedidos-client.js` (`PREMIUM - SIN DISEÑO`) | Bomba, no incendio: hoy no rompe nada |
| 5 | `lib/useNuevosPedidos.js` avisa mal | Compara `PEDIDO_ID` como texto: **96% de silencio** medido sobre 531 pedidos |
| 6 | `pauta_dia` sin `.range()` | Ver arriba. ~16-nov-2026 |
| 7 | `todosItemsListos` usa `.every()` | Un pedido **sin ítems** devuelve `true` y se auto-despacha. Mina armada, hoy no se dispara |
| 8 | **El webhook de Shopify no ha procesado ni un pedido real** | Compra de prueba en la tienda web → tiene que aparecer en el CRM como TIENDA WEB. Si da **401**, es el secreto: añadir `SHOPIFY_<TIENDA>_WEBHOOK_SECRET` |

---

## Las reglas que más han costado

1. **Build limpio + pruebas en verde + deploy `Ready` NO prueban que la pantalla
   abra.** Después de desplegar una pantalla, ábrela. (Costó 8 min de Historial
   caído el 26-ago, y media jornada de taller parado el 19-ago.)
2. **Mira el BUNDLE, no el fuente.** El build se comió una coma en un `select` y
   dio tres síntomas distintos. Los `select` se arman con `array.join(',')`.
3. **Un endpoint acotado hereda traer TODO lo que su componente pinta.** Olvidar
   dos columnas hizo que la hoja del cliente cobrara dos veces (82 de 83).
4. **"Sin texto" nunca significa "no pasó nada"**, y una lista filtrada se ve
   igual de sana que una completa. Por eso los avisos y los chips.
5. **Las capturas de pantalla mienten en este entorno.** Medir con
   `getBoundingClientRect()`, no con los ojos.
6. **Siempre `main`.** Preview no sirve: Supabase solo está en Production.
7. ⚠️ **NUNCA `git add -A` ni `git add .`** — hay trabajo sin commitear.
8. Español ecuatoriano con **tuteo**, también en commits y comentarios.

---

## Dónde está cada cosa

| documento | para qué |
|---|---|
| **este archivo** | en qué punto está el CRM hoy |
| `/crm-mandarina` (skill) | arquitectura, roles, trampas, mapa del código y de la base |
| `docs/HANDOFF-2026-08-28-...md` | bandejas, filtro de área, el pago en la hoja, permisos |
| `docs/HANDOFF-2026-08-02-pauta.md` | pauta, atribución y señales a Meta |

---

## Al cerrar una sesión

1. Actualizar **este archivo**: pendientes, lo que entró en producción, cifras que
   hayan cambiado.
2. Si la sesión dejó una lección reusable, a la **skill** (no aquí).
3. Si fue una sesión larga con contexto que se pierde, un `HANDOFF-<fecha>-<tema>.md`.
4. Volver a medir lo que este documento afirme con números. **Las cifras caducan.**
