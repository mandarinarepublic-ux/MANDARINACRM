# Panel para cargar productos a Shopify con SEO y textos de anuncio

**Fecha:** 11-sep-2026
**Estado:** diseño aprobado, pendiente plan de implementación
**Alcance:** CRM (MANDARINACRM / mandarina-pro-sales), solo ADMIN

## El problema

Cargar un producto a Shopify a mano es tipear título, descripción, SEO, tags,
categoría, alt text de cada foto y las tallas una por una. En la práctica el SEO
se salta y el alt text nunca se llena.

**Lo que se quiere:** subir las fotos, escribir el precio, y que todo lo demás lo
redacte la IA y quede publicado.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Dónde vive | **CRM** | El inbox MANDI solo LEE `crm.productos_shopify` (`app/api/tienda/route.js`) y no tiene ni una credencial de Shopify. El CRM ya tiene las de las dos tiendas |
| Quién entra | **Solo ADMIN** | `requireAdmin` de `lib/auth.js`, el mismo de `api/eventos` |
| Alcance | Producto + SEO + campos de feed + **textos de anuncio** | Crear la campaña en Meta es otro subsistema: el CRM no tiene credenciales de la API de anuncios, solo de CAPI |
| Tallas | Las 7 del CRM, premarcadas por la IA, se destildan | `TALLAS` de `lib/cotizacion.js` |
| Publicación | **Activo**, con un solo botón | Decisión de Rodrigo. Se implementa como borrador → verificar → activar (ver §4) |
| Volumen | **Un producto a la vez**, varias fotos | Agrupar fotos con IA puede mezclar productos, y publicando en activo eso queda en la tienda |

El inbox lo hereda gratis: publicar en el CRM y correr el sync hace aparecer el
producto en la pestaña TIENDA de los DOS inbox. No se toca ni una línea del inbox.

## Hallazgos del spike (verificados contra la tienda real, 10-sep)

Estos NO son supuestos. Se probaron con llamadas reales a mandarinaec.com.

### `productCreate` deja el producto a medio hacer y devuelve `userErrors: []`

Se pidieron 5 tallas y precio $35. Respondió sin errores y dejó:

- **1 sola variante** de las 5
- **precio `0.00`**
- **`category: null`**

Un panel montado sobre `productCreate` publicaría chaquetas a $0.00 con una talla,
y publicando en activo eso queda comprable. **Un 200 sin errores no prueba nada.**

**La correcta es `productSet` con `synchronous: true`**: hace todo en una llamada
(title, handle, seo, category, tags, vendor, productType, files con alt,
productOptions y variants con price/sku). Probado: 5/5 tallas, $35.00, categoría y
alt text correctos.

### La taxonomía de Shopify está en español y falla en silencio

`taxonomy { categories(search:) }` devuelve **lista vacía, sin error**, si se busca
en inglés:

- `"jacket"` → `[]`
- `"Coats"` → *Congas*, *Capotas*
- `"Chaquetas"` → lo correcto (`aa-1-10-2-2`)

Sin categoría el producto no sirve para el feed de anuncios.

### Permisos

Solo hace falta **`write_products`**. `write_files` NO, porque las imágenes entran
por URL y Shopify las descarga él mismo.

La app que usa el CRM es **MANDI Token** (no MANDI Agent, que sigue en solo
lectura). El CRM no guarda token fijo: `lib/shopify.js` lo pide por
`client_credentials` en cada uso, así que toma el permiso nuevo solo. Verificado:
el token emitido trae `scope: read_inventory,write_products`.

## Diseño

### §1 — La pantalla

Una sola página, `app/dashboard/producto-nuevo/page.js`, con tres bloques.

**① Soltar.** Zona de arrastre para las fotos de UN producto; miniaturas
reordenables, la primera es la principal. Precio (obligatorio), precio tachado
(opcional), y selector de tienda MANDARINA / INDSTORE. YAW no aparece: no tiene
Shopify (`lib/auth.js`, `getTiendaConfig`).

**El precio es UNO solo y se aplica igual a todas las tallas.** No hay precio por
talla (se descartó al decidir el alcance).

**Una tienda por carga.** El selector es excluyente, no casillas: el producto va a
Mandarina **o** a INDSTORE, nunca a las dos de un tirón. Publicar en ambas a la vez
obligaría a decidir qué hacer cuando una sale bien y la otra falla, y además el
precio y el texto rara vez son iguales entre las dos marcas. Para tener el mismo
producto en las dos webs se carga dos veces.

**Inventario: sin seguimiento** (`inventoryItem.tracked: false`). Es lo correcto
para prendas que se fabrican bajo pedido: con seguimiento activado y stock en 0,
Shopify **bloquea la compra** y el producto quedaría publicado pero no vendible —
justo el fallo silencioso que este diseño busca evitar.

Las fotos suben **del navegador directo a Cloudinary** con `api/upload-sign`, que
ya existe y ya esquiva el tope de ~4,5 MB de Vercel.

**② Revisar.** Todo editable: título, handle (con vista previa de la URL real),
descripción, SEO título y descripción **con contador de caracteres**, tags como
chips, categoría con su ruta completa y buscador, tallas en casillas, y **alt text
por foto**. Arriba, una vista previa de cómo se verá en Google.

Los textos de anuncio van en un bloque plegado aparte, con botón de copiar.

**③ Resultado.** Enlaces al producto en el admin y en la tienda, la lista de
verificación de §4, y un botón **Despublicar** que lo devuelve a borrador.

### §2 — Qué escribe la IA

Una llamada al servidor con las fotos y el precio devuelve un JSON estructurado.
Mismo patrón que `api/analyze-image`, que ya funciona en producción: la
`ANTHROPIC_API_KEY` nunca sale del servidor.

Genera: título, handle, descripción HTML, SEO título y descripción, tags, tipo de
producto, vendor, alt text por foto, tallas sugeridas, y los textos de anuncio
(Meta: texto principal ~125 y titular ~40 · Google: 3 titulares de hasta 30 y 2
descripciones de hasta 90, dentro de los límites de fábrica).

**Dos reglas anti-invención:**

1. **Prohibido escribir lo que no se ve en la foto.** Nada de composición de tela,
   gramaje, país de fabricación, medidas ni instrucciones de lavado.

2. **La IA no devuelve el ID de categoría**, se lo inventaría. Devuelve un
   **término de búsqueda en español**; el servidor consulta la taxonomía y la
   pantalla muestra los candidatos reales para elegir. Si la búsqueda vuelve
   vacía, se ve como un aviso en pantalla — no como un campo en blanco que pasa
   desapercibido.

### §3 — Archivos

Nuevos:

```
app/dashboard/producto-nuevo/page.js           la pantalla
app/api/productos-shopify/redactar/route.js    fotos -> IA -> JSON
app/api/productos-shopify/categorias/route.js  busca en la taxonomía
app/api/productos-shopify/publicar/route.js    productSet + verificación
lib/shopifyProducto.js                         arma el input y verifica
```

Las tres rutas empiezan con `requireAdmin`.

Reusados sin tocar: `api/upload-sign`, `lib/cotizacion.js`, `api/shopify/sync`.

Único cambio en lo existente: exportar el helper de GraphQL de `lib/shopify.js`,
hoy privado.

**Por qué `lib/shopifyProducto.js` es un archivo aparte:** `lib/shopify.js`
alimenta el sync, o sea el catálogo del CRM **y de los dos inbox**. Es camino de
lectura y funciona. La escritura va aislada para que un bug ahí no pueda tumbar el
catálogo. Además el armado y la verificación quedan como funciones puras,
probables con `node --test` (ojo: `node --test` no entiende `@/`).

Limpieza en la misma zona: **borrar `app/api/shopify/auth/route.js`**, ruta de
diagnóstico de un solo uso, sin ningún llamador, que imprime un token de Admin con
`write_products` en HTML a cualquiera de los ~14 usuarios del CRM.

### §4 — Fallos y verificación

**El botón publica en borrador, verifica, y recién ahí activa.** Un solo clic para
el usuario; por dentro:

1. `productSet` con `status: DRAFT`
2. **Se relee el producto de Shopify** y se comprueba campo por campo
3. Si todo cuadra, pasa a `ACTIVE` **y se publica al canal Tienda Online**. Si no,
   **se queda en borrador** y la pantalla dice qué falló

Así nunca existe un instante en que un producto a medio armar esté comprable.

### ☠️ `ACTIVE` no hace visible el producto

La documentación del esquema de Shopify lo dice textual: *"Products with an active
status aren't automatically published to sales channels, such as the online
store"*. Poner el producto en `ACTIVE` lo deja comprable por API pero **invisible
en mandarinaec.com**: ningún cliente lo ve.

Por eso después de activar hay un paso más, `publishablePublish` al canal Tienda
Online, y la confirmación no es que la mutation no falle sino que el producto
devuelva un **`onlineStoreUrl` real**. Si no lo devuelve, cuenta como fallo y el
producto no se da por publicado.

Lo que se verifica:

- tantas variantes como tallas marcadas
- **ninguna variante en $0.00**
- categoría asignada
- SEO título y descripción no vacíos
- tantas imágenes como fotos subidas, **todas con alt text y en estado `READY`**
  (Shopify descarga la foto desde Cloudinary; si falla queda en `FAILED` y el
  conteo igual daría bien)

Otros fallos:

| Falla | Comportamiento |
|---|---|
| 403 de Shopify | El aviso dice explícitamente que puede ser el token cacheado (`lib/shopify.js` lo guarda ~24 h en memoria) y ofrece reintentar |
| El sync falla | El producto SÍ está en Shopify. El aviso lo dice así: publicado, pero todavía no aparece en los inbox. Dos estados distintos |
| Doble clic | El botón se bloquea; si ya hay `productoId`, el segundo intento actualiza ese producto en vez de crear un duplicado |

## Fuera de alcance

- Crear campañas en Meta o Google (solo se generan los textos para copiar)
- Cargar varios productos de una, o que la IA agrupe fotos
- Editar productos que ya existen en Shopify
- Empujar el producto al catálogo de Meta (lo hace el canal de venta de Shopify)

## Prerrequisitos abiertos

- **INDSTORE** necesita `write_products` en su propia app si se va a cargar ahí.
  MANDARINA ya lo tiene. No bloquea arrancar con Mandarina.
