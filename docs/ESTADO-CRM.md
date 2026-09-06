# ESTADO DEL CRM · al 1-sep-2026

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
| Pruebas | `npm test` → 526 pruebas |

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

**Filtros en Inicio (1-sep).** Tocar un vendedor en «Top vendedores» o una
tienda en «Ventas por tienda» acota **toda la hoja**: tarjetas, gráficos y
estados. Se combinan (vendedor Y tienda) y cada uno se quita por separado.

☠️ **El filtro solo puede ACOTAR, nunca ampliar.** El rol sigue saliendo de la
cookie firmada y `resumen_inicio` aplica el filtro DENTRO de lo que ese rol ya
permitía; además `/api/inicio` ni se lo pasa a quien no es ADMIN. Comprobado:
GRACE pidiendo el filtro de JACKELINE recibe **$0 y cero vendedores**.

☠️ **Un panel filtrado se ve igual de sano que uno completo.** Por eso el aviso
ámbar «No estás viendo todo» es obligatorio, y por eso el filtro **NO se
guarda** entre visitas: devolverle a alguien un filtro que no acaba de poner es
fabricar el engaño de que $3.768 son las ventas de la casa.

⚠️ **Las dos listas son selectores CRUZADOS**: la de vendedores obedece al
filtro de tienda pero no al de vendedor, y al revés. Si cada una se filtrara a
sí misma, al elegir un vendedor te quedarías sin forma de saltar a otro. Por lo
mismo, la fila seleccionada **nunca desaparece** aunque no tenga ventas: si
JACKELINE no vendió en INDSTORE, INDSTORE sigue en la lista en $0 — es el único
botón capaz de quitar ese filtro.

⚠️ Las dos listas son del **mes en curso**: el día 1, hasta la primera venta,
están vacías y no hay nada que clicar. No es una avería (medido el 1-sep:
`porTienda` y `porVendedor` llegaron `{}`), y el texto lo dice.

✅ **YAW ya aparece en «Ventas por tienda».** Eran dos claves escritas a mano y
YAW se caía: **$2.779 y 53 pedidos de agosto** que contaban en el total de
arriba y en ninguna barra. Ahora las filas salen de los DATOS y las tres suman
exacto la tarjeta. La tabla de nombres/colores es solo el vestuario, con salida
por defecto para una tienda nueva.

☠️ **`crm.resumen_inicio` es UNA sola función de 5 parámetros.** `CREATE OR
REPLACE` con más parámetros **no reemplaza: crea una sobrecarga**, y con la
nueva trayendo DEFAULTs la llamada de dos argumentos se volvió **ambigua**
(`42725: is not unique`) — el panel de Inicio se rompe en producción sin que
nadie toque nada. Si alguna vez se le agregan parámetros, hay que **borrar la
firma vieja EN LA MISMA MIGRACIÓN** (una transacción): separar el `DROP` del
`CREATE` abre esa misma ventana. Así se hizo al añadir `p_filtro_mes`. Para
comprobarlo, `pg_proc` tiene que devolver **una sola firma**.

**El histórico manda sobre el diario (1-sep).** Tocar un mes en «Ventas por
mes» acota **todo el panel** a ese mes: las cuatro tarjetas, las dos listas, el
gráfico diario y los estados. Volver a tocarlo devuelve al mes en curso. Los
meses pasados salen completos (día 1 al último); el actual, del 1 a hoy.

☠️ **Sin mes elegido el panel se comporta EXACTAMENTE como siempre**: «Por
cobrar» sigue siendo de toda la historia ($6.774 el 1-sep) y el subtítulo sigue
diciendo «838 total». Solo al elegir un mes se acota todo. Es a propósito:
cambiar en silencio cifras que se leen a diario es peor que no tener el filtro.

☠️ **«Ventas hoy» no se traduce a un mes pasado** — hoy no está en agosto, así
que valdría $0 y se leería como un día malo. Con un mes anterior elegido esa
caja pasa a **«Promedio por día»** (agosto $485/día, julio $648/día), que además
es lo que sirve para comparar meses. El divisor sale de `ventasPorDia`, que trae
justo los días del mes mirado, para que no se pueda desalinear del numerador.

⚠️ **Esta regla ya fue al revés una vez.** Al principio el mes solo movía el
gráfico diario, y la nota de ese gráfico avisaba de que las tarjetas seguían en
el mes en curso. Al pasar a acotarlo todo, esa frase quedó FALSA y hubo que
cambiarla, igual que «Ver todo» pasó a limpiar también el mes. Si vuelve a
cambiar, las dos cosas van juntas — hay pruebas que lo sujetan.

⚠️ El mes es la única de las tres selecciones que **no pasa por la guardia de
ADMIN**, y es correcto: es una ventana de TIEMPO, no una identidad. Elegir
agosto no puede enseñar ni un pedido que el rol no dejara ver ya, así que un
vendedor también puede mirar su propio agosto. La base valida la forma
(`^\d{4}-(0[1-9]|1[0-2])$`) y cualquier otra cosa cae al mes en curso.

⚠️ El mes **cuenta para el aviso ámbar y «Ver todo» lo limpia**, como los otros
dos: desde que acota el panel entero, esconde tanto como ellos.

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

**Eventos por prenda (4-sep, RECIÉN DESPLEGADO).** `crm.prenda_eventos` guarda
cada movimiento con **`item_id`** — la llave que faltaba. `logs_pedidos` guarda
el `campo` como texto libre con el nombre del producto dentro (`"SUBESTADO HOODIE
PREMIUM"`, con erratas reales como `HODIE`) y sin `item_id`: dos hoodies iguales
en un pedido eran indistinguibles y por eso no se podía medir cuánto tarda un
área. La tabla nueva es **aditiva**: `logs_pedidos` se sigue escribiendo igual.

Se escribe desde UN solo sitio, `app/api/pedidos/item/[id]/route.js`, más el
trigger de cierre. Reglas puras y probadas en `lib/prendaEventos.js`.

**El corte se marca solo** cuando un área pasa la prenda a `EN_PROCESO` o
`LISTO`. ☠️ **`ENVIADO_APROBACION` NO cuenta**: mandar el arte al cliente no
exige tocar la tela. Medido el 4-sep: 42 de las 46 prendas vivas «en curso sin
marca de corte» estaban ahí, y marcarlas las habría **borrado de la bandeja de
Corte** teniendo que cortarse. El error barato es dejar una prenda de más en la
bandeja; el caro es sacarla. Lo vigila una prueba que lee el **bundle**
(`tests/corte-automatico-en-el-build.test.js`), no el fuente.

✅ Verificado con tráfico real el mismo día: 17 movimientos de Estampado y sus
17 marcas de corte automáticas, emparejadas al segundo.

**Tablero por SUB-ÁREA (4-sep, RECIÉN DESPLEGADO).** Reemplaza las tres columnas
CORTE → PRODUCCIÓN → DESPACHO, que metían **69 de 74 pedidos vivos en la
primera**: con el 93% en una columna no repartía trabajo, solo repetía que todo
seguía atascado. Ahora seis tarjetas —Corte, Estampado, Sublimación, Bordado, Sin
área, Por entregar— y clic para ver los pedidos, con orden y filtros de fecha.
Regla pura y probada en `lib/pivot-areas.js`; la pantalla solo pinta.

☠️ **El corte NO es una puerta.** La primera versión solo dejaba ver a un área lo
ya marcado `CORTADO` y **BORDADO salía en CERO teniendo 23 prendas suyas**. Estar
cortada o no es un **dato de la fila** (`✂ n sin marcar`), nunca un filtro. Una
prenda sin cortar sale a la vez en Corte y en su área: son dos pendientes
distintos sobre la misma prenda.

☠️ **Un pedido sin prendas que fabricar no desaparece**: va a «Por entregar». La
prueba `bandeja-tablero.test.js` cazó justo eso al reescribir, y de paso pasó de
mirar el código con una regex a comprobar el **comportamiento**.

**Tres columnas de tiempo**: `Venta→taller`, `En taller` y **`Quieto`** (días
desde el último evento). Cuando «Quieto» se acerca a «En taller», nadie tocó ese
pedido desde que entró. Sale de la vista `crm.pedido_ultimo_movimiento`, que
**agrupa en la base**: leer `logs_pedidos` en crudo cruzaría el tope de 1000 filas
en silencio. ⚠️ **NO usar `detalle_pedido.fecha_modificacion`** para esto: nunca
se actualiza (ver la tabla de más abajo).

⚠️ Las áreas salen del **servidor**, no de la url. Con áreas asignadas se ven las
suyas + Corte; **un rol transversal sin áreas (CORTE, DESPACHO, ADMIN) ve TODO** —
recortarlo a «sus áreas» lo dejaría con la pantalla vacía.

**Cuadro de errores (4-sep).** Cada error de bandeja guarda ahora `detalle` con
código, ruta, usuario y parámetros (`lib/detalle-evento.js`), y la pantalla pinta
**todas** las claves por regla. ☠️ Antes mostraba UNA (`detalle.telefono`, y solo
del inbox): de 745 eventos, **634 traían contexto invisible**.

**Facturas que no se van a emitir (4-sep).** Botón «no facturar» en el cuadro de
errores y en el pedido, con **motivo de lista corta + nota** (`lib/motivos-factura.js`)
y reversible. ☠️ No apaga `factura_solicitada`: que el cliente la pidió es un
HECHO y no emitirla una DECISIÓN; se guardan las dos.

### ☠️ El trigger de cierre: lo que hay que saber

`crm.pedidos` tiene `pedidos_marcar_cortado` (19-ago) que, al entrar el pedido a
`COMPLETADO`/`ENTREGADO`/`DESPACHO`, marca sus prendas `CORTADO` y `LISTO`.
**Escribe directo a la tabla, sin pasar por la app.** Tres consecuencias que ya
hicieron sacar conclusiones falsas:

- **`subestado_corte = CORTADO` no significa «alguien cortó esto»**, significa
  «este pedido se cerró». Que 1.403 de 1.449 prendas completadas estén marcadas
  **no prueba** disciplina de registro: lo hizo el trigger y dos backfills.
- **El registro de CORTE en `logs_pedidos` no se apagó en agosto** (98 pedidos en
  julio → 5 en agosto → 0 en septiembre). Se mudó a un sitio que no registra.
- ⚠️ Los respaldos que prometen aquellas migraciones —`crm.respaldo_corte_20260818`
  (759 prendas) y `crm.respaldo_corte_20260819` (22)— **NO EXISTEN en la base**.
  Lo que se sobrescribió entonces no se puede reconstruir.

**Arreglado el 4-sep** (`docs/sql/2026-09-04-cierre-no-aplana-y-deja-rastro.sql`):
el trigger ya **no aplana** el subestado compuesto —`ESTAMPADO:X|BORDADO:Y` pasa a
`ESTAMPADO:LISTO|BORDADO:LISTO`, no a `LISTO` a secas— y **deja rastro** en
`prenda_eventos` con `origen = 'AUTO_CIERRE'`. Antes aplanaba **136 de 136**
prendas multi-área cerradas, así que el desglose por área se borraba al cerrar
aunque se midiera perfecto todo el camino.

Cuántas prendas se cierran a medias, ahora se puede contar:

```sql
select count(*) from crm.prenda_eventos where origen = 'AUTO_CIERRE';
```

⚠️ **Sigue forzando `LISTO`** a prendas que no lo estaban (la migración de agosto
volteó 475 así). Es a propósito —mantiene limpias las bandejas— pero ahora queda
contado en vez de borrado.

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

⚠️ Los **filtros de Inicio son solo de ADMIN**. Un vendedor que los mande a mano
no consigue nada: se ignoran en el route y, aun pasando, caerían dentro de lo
suyo.

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
