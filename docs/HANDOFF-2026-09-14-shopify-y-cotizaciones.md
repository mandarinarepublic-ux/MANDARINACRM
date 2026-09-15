# HANDOFF · 12 al 14-sep-2026 · Panel de Shopify y opciones en cotizaciones

**Qué cuenta esto:** lo que pasó en la sesión. No se vuelve a tocar.
El estado presente vive en `ESTADO-CRM.md`; si algo de aquí lo contradice,
gana ese.

Dos frentes: **un panel nuevo para cargar productos a Shopify** y **opciones
(escenarios A/B) en las cotizaciones**. Más dos dominios mal que llevaban
meses impresos en el documento del cliente.

---

## 1. Panel para cargar productos a Shopify

`/dashboard/producto-nuevo` — **solo ADMIN**. Subes las fotos y el precio, la IA
redacta la ficha completa (título, descripción, SEO, tags, textos de anuncio) y
el CRM la publica en Shopify.

| pieza | qué hace |
|---|---|
| `lib/shopifyProducto.js` | **todo lo puro**: arma el input de `productSet` y verifica lo que Shopify devolvió. Sin red, sin `process.env` |
| `app/api/productos-shopify/redactar` | manda las fotos a Claude y devuelve la ficha |
| `app/api/productos-shopify/categorias` | busca en la taxonomía de Shopify |
| `app/api/productos-shopify/publicar` | DRAFT → verificar → ACTIVE → `publishablePublish` |
| `app/dashboard/producto-nuevo` + `components/producto-nuevo/` | la pantalla |

### ☠️ `productCreate` deja productos a medio armar y responde `userErrors: []`

Probado contra la tienda real el 10-sep: se pidieron **5 tallas a $35** y quedó
**1 variante a $0.00, sin categoría**, con la respuesta diciendo que todo salió
bien. Un producto así queda **comprable** porque el panel publica en ACTIVO.

Por eso se usa **`productSet`**, que es declarativo.

⚠️ **Pero `productSet` BORRA las listas que no le mandas.** Activar el producto
con `productSet` le habría quitado las fotos y los tags. La activación va por
**`productUpdate`**, que sí tiene semántica de mezcla. Son dos mutaciones
distintas a propósito.

### ☠️ La verificación fallaba ABIERTA

`verificarProducto` daba por buena una foto sin `status`. Se cambió a
`m?.status !== 'READY'`: **lo desconocido se trata como roto**.

Al arreglarlo apareció lo de verdad: **Shopify procesa las fotos de forma
asíncrona**. Justo después de crear el producto las fotos están en
`PROCESSING`, no en `READY`, y la verificación las daba por rotas. Se agregó un
reintento acotado, **decidido por el estado de los medios, nunca por el texto
del mensaje de error**.

### ☠️ `claude-opus-5` trae el pensamiento ENCENDIDO por defecto

La ruta `redactar` estaba **100% rota** y nadie lo sabía: `content[0]` es un
bloque de pensamiento vacío, así que `JSON.parse` reventaba en cada llamada.

```js
// mal: const texto = data.content[0].text
const texto = (data?.content || []).find((b) => b?.type === 'text')?.text || ''
```

Y `max_tokens` tuvo que subir a **16000**: el pensamiento sale de ahí, y con
2000 el JSON se cortaba a la mitad. Si `stop_reason === 'max_tokens'`, la ruta
responde 502 con un mensaje que se entiende, en vez de un JSON inválido.

### Lo que se borró

`app/api/shopify/auth/route.js` **imprimía un Admin token en HTML**. Cero
llamadores. Borrada, y `tests/shopify-auth-borrada.test.js` se cae si vuelve.

### Permisos de Shopify

MANDARINA ya tiene `write_products`, `read_publications` y `write_publications`
(versión `mandi-token-4` del Dev Dashboard).
⛔ **INDSTORE no los tiene**: publicar ahí falla hasta que se le den.

### Segunda vuelta: llenado a mano y tallas

Después de usarlo salieron dos cosas:

- **Los campos de precio eran invisibles.** No llevaban clase, así que el
  navegador los pintaba con caja blanca sobre el texto blanco que hereda la
  página. Se escribía a ciegas. Todo el panel pasó a usar las clases del CRM
  (`.input`, `.card`, `.btn-primary`) y las secciones numeradas de Cotización.
- **Dos caminos desde el paso 01**: `Redactar con IA` y `Llenar a mano`. El
  segundo arma la ficha en el navegador **sin tocar ninguna API**, así que
  funciona con la cuenta de Anthropic sin saldo.

☠️ **Las tallas ya no salen de `tallasSugeridas`.** Arrancan las **siete**
(XS a 3XL) marcadas en los dos caminos. Antes las elegía la IA y cuando se
quedaba corta el producto salía a la venta **sin variantes que sí hay en
bodega** — una venta perdida que no deja rastro en ningún lado.

---

## 2. Opciones en una cotización

Una cotización puede ofrecer **escenarios completos** entre los que el cliente
escoge: `Opción A: $920 · Opción B: $1.380`. Cada opción tiene sus productos,
sus cantidades y su tiempo de entrega. El descuento, el anticipo y las
condiciones son de toda la cotización.

**Si nunca agregas una segunda opción, la pantalla y el documento se ven
exactamente como antes.** Las pestañas aparecen solo cuando pides la segunda.

### La pieza que sostiene todo: `opcionesDe()`

Función pura en `lib/cotizacion.js`. Devuelve **siempre** una lista de opciones:
si la cotización trae `opciones`, esas; si no, una opción implícita armada con
`productos` y `entrega_dias` de la raíz.

☠️ **Cuando hay `opciones`, la raíz se IGNORA por completo.** Es a propósito: si
se escribiera en los dos sitios, tarde o temprano dirían cosas distintas y nadie
sabría cuál manda.

### Migración

```sql
alter table crm.cotizaciones add column if not exists opciones jsonb;
```

Aplicada a producción el 12-sep (`docs/sql/2026-09-12-cotizaciones-opciones.sql`).
Verificada después: 5 filas, ninguna tocada.

⚠️ **`lib/db/cotizaciones.js` tiene una lista blanca de columnas (`COLS`)** y
hubo que agregarle `'opciones'`. Sin eso el campo se descartaba **en silencio**:
la pantalla mostraba las opciones, el guardado decía que salió bien, y al
recargar no había nada.

### El precio por unidad con IVA

El documento mostraba `10 uds × $19.99` y sumaba el IVA abajo. El cliente paga
**$22.99** por unidad y ese número no aparecía. Ahora la línea dice las dos
cosas, **en el mismo renglón** — una línea nueva por producto podría empujar la
cotización fuera de la hoja A4.

### ☠️ `entrega_dias` vivía en dos sitios y se desincronizaba

El caso que dolía: el vendedor escribía «Entrega: 30», agregaba una opción, y el
documento salía con **dos plazos que nunca escribió** (A: 15 días, B: 30). Y al
borrar la opción A, el 30 quedaba guardado, invisible y sin forma de editarlo.

Se arregló manteniendo el invariante *«con exactamente una opción, la raíz y la
opción dicen lo mismo»*.

⚠️ **Ese arreglo introdujo dos regresiones** que las pruebas no vieron y una
segunda revisión sí: `addOpcion` pisaba `entrega_dias` cada vez, y
`Number.isFinite(Number(null))` es `true`, así que un `null` se convertía en 0.

### Sombra de solo escritura

El payload de guardado escribe `productos` y `entrega_dias` en la raíz **aunque
nadie los lea**. Es una desviación deliberada del spec: existe para que una
marcha atrás del despliegue no muestre las cotizaciones **como estaban antes de
editarlas**, sin error y sin aviso.

---

## 3. Los dos dominios mal en el documento del cliente

`lib/tiendaTheme.js` imprimía la web **dos veces** en cada cotización — el pie de
la firma y el pie de página — y las dos tiendas estaban mal:

| tienda | decía | es |
|---|---|---|
| Mandarina Republic | `www.mandarinarepublic.com` (no existe) | `www.mandarinaec.com` |
| Ind Store | `www.indstore.ec` | `www.indlovers.com` |

El CRM **ya tenía el dato correcto en otros tres sitios**: el cupón de la hoja de
pedido, el panel de productos y la propia tienda de Shopify. La cotización era el
único que decía otra cosa.

☠️ **Un dominio muerto no da error en el CRM.** Falla en el navegador del
cliente, callado, semanas después de que mandaste la cotización. Lo vigila
`tests/cotizacion-dominios.test.js`.

⚠️ Las cotizaciones **ya enviadas** llevan el dominio viejo impreso en el PDF.
Eso no se arregla solo.

---

## 4. El menú tiene DOS superficies

El panel de productos no aparecía. La primera hipótesis —que la cuenta fuera
VENDEDOR— **era falsa**: Rodrigo es ADMIN.

La causa real: **el CRM tiene dos sitios donde se declara la navegación** y solo
se había tocado uno.

| superficie | archivo |
|---|---|
| La rejilla de tarjetas del dashboard | `app/dashboard/page.js` |
| **El menú lateral declarado** | `app/dashboard/layout.js` |

⚠️ **Un 307 en una ruta no prueba nada**: una ruta que no existe devuelve 307
igual que una que sí.

---

## Lo que quedó pendiente

| # | qué | cómo se cierra |
|---|---|---|
| 1 | **El panel no se ha probado de punta a punta con un producto real** | Subir uno a MANDARINA y mirarlo en la tienda |
| 2 | **Anthropic sin saldo** | Recargar. También afecta a `/api/analyze-image`. El camino «Llenar a mano» funciona igual |
| 3 | INDSTORE sin `write_products` / `read_publications` / `write_publications` | Darle los permisos en su app de Shopify |
| 4 | Las opciones no se han probado con una cotización real de dos opciones | Crear una, mirar el PDF (pasa de una hoja), mandarla por WhatsApp, y abrir una VIEJA para confirmar que se ve igual |
| 5 | `tests/pivot-areas.test.js` falla | Preexistente y ajeno: fecha fija `HOY = 2026-09-04` |
| 6 | `crm.prenda_eventos` y `crm.clientes_email_respaldo_21ago` con RLS desactivado | Decidir si se activa |

---

## Lo que esta sesión enseñó

**Un `userErrors: []` no prueba que el producto quedó bien.** Ni un HTTP 200, ni
un `● Ready`, ni las pruebas en verde. Los tres peores fallos de esta sesión
—el producto a medio armar, la ruta de la IA rota al 100%, y la verificación que
fallaba abierta— **eran invisibles para las pruebas** y se encontraron leyendo el
código y preguntándole al sistema real.

**El buscador de Shopify también miente.** Después de cambiar precios, la
búsqueda `price:25` seguía devolviendo productos ya cambiados: es el índice, que
va con retraso. Y peor: **un campo de filtro que Shopify no reconoce se ignora en
silencio y te devuelve todo el catálogo como si hubiera filtrado.** La verdad
está en leer las variantes del producto.
