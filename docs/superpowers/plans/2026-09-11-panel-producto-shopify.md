# Panel de carga de productos a Shopify — Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para ir marcando.

**Goal:** Que un ADMIN suba fotos y un precio en el CRM, la IA redacte el producto completo (SEO, categoría, tags, alt text y textos de anuncio), y quede publicado en Shopify.

**Architecture:** Pantalla nueva en `dashboard/` + tres rutas de API protegidas con `requireAdmin`. Las fotos suben del navegador directo a Cloudinary (firma existente). La escritura a Shopify usa `productSet` y vive en un archivo aparte del camino de lectura, que alimenta el catálogo del CRM y de los dos inbox. Publicar es siempre borrador → verificar contra Shopify → activar.

**Tech Stack:** Next.js App Router (JS, no TS), Shopify Admin GraphQL `2024-10`, Cloudinary, Anthropic Messages API, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-11-panel-producto-shopify-design.md`

## Global Constraints

- **Solo ADMIN.** Toda ruta nueva empieza con `requireAdmin(req)` de `lib/auth.js`. Nunca se lee el rol de la URL ni de una cabecera.
- **Tests:** `npm test` = `node --test tests/*.test.js`. ⚠️ `node --test` **no entiende `@/`** — en los tests se importa con ruta relativa (`../lib/...`).
- **Idioma:** todo el texto de la app, comentarios y mensajes de commit en **español ecuatoriano con tuteo**. Nada de voseo (`vos`, `podés`, `decime`).
- **Rama:** se trabaja siempre en `main`. No se crean ramas.
- **⚠️ En este repo NO se usa `git add -A`.** Cada commit agrega archivos por ruta explícita.
- **Tallas:** las 7 de `TALLAS` en `lib/cotizacion.js:14` → `['XS','S','M','L','XL','XXL','XXXL']`.
- **Tiendas:** solo `MANDARINA` e `INDSTORE`. `YAW` no tiene Shopify.
- **Un producto por carga, una tienda por carga.** El selector de tienda es excluyente.
- **Precio único** para todas las tallas. **Inventario sin seguimiento** (`inventoryItem.tracked: false`).
- **Versión de la API de Shopify:** `2024-10`, la misma constante `API_VERSION` que ya usa `lib/shopify.js`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/shopifyProducto.js` | **Nuevo.** Funciones puras: armar el `ProductSetInput` y verificar el producto que devolvió Shopify. Sin red, sin `process.env` |
| `lib/shopify.js` | **Modificar.** Exportar un helper de GraphQL por tienda. El camino de lectura no se toca |
| `app/api/productos-shopify/categorias/route.js` | **Nueva.** Busca en la taxonomía de Shopify |
| `app/api/productos-shopify/redactar/route.js` | **Nueva.** Fotos + precio → JSON redactado por la IA |
| `app/api/productos-shopify/publicar/route.js` | **Nueva.** `productSet` borrador → verificar → activar → disparar el sync |
| `app/api/shopify/auth/route.js` | **BORRAR.** Ruta muerta que imprime un token de Admin |
| `components/producto-nuevo/SoltarFotos.js` | **Nueva.** Zona de arrastre, subida a Cloudinary, reordenar |
| `components/producto-nuevo/RevisionProducto.js` | **Nueva.** El formulario de revisión editable |
| `components/producto-nuevo/ResultadoPublicacion.js` | **Nueva.** Resultado, verificación y despublicar |
| `app/dashboard/producto-nuevo/page.js` | **Nueva.** Orquesta los tres bloques y el estado |

La escritura va en `lib/shopifyProducto.js` y **no dentro de `lib/shopify.js`** a propósito: ese archivo alimenta el sync, o sea el catálogo del CRM y de los dos inbox. Es camino de lectura y funciona. Un bug en la escritura no puede tumbarlo.

---

### Task 1: Armar el `ProductSetInput`

**Files:**
- Create: `lib/shopifyProducto.js`
- Test: `tests/shopify-producto-input.test.js`

**Interfaces:**
- Consumes: `TALLAS` de `lib/cotizacion.js`
- Produces: `construirProductSetInput(datos) -> object` y `TALLA_UNICA -> string`.
  `datos` = `{ titulo, handle, descripcionHtml, seoTitulo, seoDescripcion, tags, tipoProducto, vendor, categoriaId, tallas, precio, precioTachado, fotos, status }`.
  `fotos` = `[{ url, alt }]`. `tallas` = `['S','M',...]`. `status` = `'DRAFT'|'ACTIVE'`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
// tests/shopify-producto-input.test.js
//
// ☠️ La razon de existir de este archivo: productCreate acepta un producto a
// medio armar y devuelve userErrors: []. Se probo contra la tienda real el
// 10-sep-2026: se pidieron 5 tallas a $35 y quedo 1 variante a 0.00 sin
// categoria. Como el panel publica en ACTIVO, eso queda comprable.
// Aqui se blinda el paso previo: el input que se le manda a productSet.
import test from 'node:test'
import assert from 'node:assert'
import { construirProductSetInput, TALLA_UNICA } from '../lib/shopifyProducto.js'

const BASE = {
  titulo: 'Chaqueta Dragon Ball Z Goku',
  handle: 'chaqueta-dragon-ball-z-goku',
  descripcionHtml: '<p>Chaqueta con estampado de Goku.</p>',
  seoTitulo: 'Chaqueta Dragon Ball Z Goku | Mandarina Republic',
  seoDescripcion: 'Chaqueta con estampado de Goku a todo color. Envios a todo Ecuador.',
  tags: ['anime', 'goku'],
  tipoProducto: 'Chaquetas',
  vendor: 'Mandarina Republic',
  categoriaId: 'gid://shopify/TaxonomyCategory/aa-1-10-2-2',
  tallas: ['S', 'M', 'L'],
  precio: 35,
  fotos: [{ url: 'https://res.cloudinary.com/x/goku.png', alt: 'Chaqueta de Goku, frente' }],
  status: 'DRAFT',
}

test('crea UNA variante por talla, todas al mismo precio', () => {
  const input = construirProductSetInput(BASE)
  assert.equal(input.variants.length, 3, 'tres tallas, tres variantes')
  assert.deepEqual(input.variants.map((v) => v.optionValues[0].name), ['S', 'M', 'L'])
  for (const v of input.variants) assert.equal(v.price, '35.00')
})

test('☠️ un precio de cero o vacio no se puede armar', () => {
  for (const malo of [0, '0', null, undefined, '', -5, 'abc']) {
    assert.throws(() => construirProductSetInput({ ...BASE, precio: malo }),
      /precio/i, `dejo pasar el precio ${JSON.stringify(malo)}`)
  }
})

test('el inventario NO se rastrea: con stock 0 Shopify bloquearia la compra', () => {
  const input = construirProductSetInput(BASE)
  for (const v of input.variants) assert.equal(v.inventoryItem.tracked, false)
})

test('sin ninguna talla marcada sale UNA variante de talla unica, no cero', () => {
  const input = construirProductSetInput({ ...BASE, tallas: [] })
  assert.equal(input.variants.length, 1, 'Shopify exige al menos una variante')
  assert.equal(input.variants[0].optionValues[0].name, TALLA_UNICA)
  assert.equal(input.productOptions[0].values[0].name, TALLA_UNICA)
})

test('las tallas van en el orden del CRM, no en el que llegaron', () => {
  const input = construirProductSetInput({ ...BASE, tallas: ['XL', 'S', 'M'] })
  assert.deepEqual(input.variants.map((v) => v.optionValues[0].name), ['S', 'M', 'XL'])
})

test('cada foto viaja con su alt text y como IMAGE', () => {
  const input = construirProductSetInput(BASE)
  assert.equal(input.files.length, 1)
  assert.equal(input.files[0].originalSource, BASE.fotos[0].url)
  assert.equal(input.files[0].alt, BASE.fotos[0].alt)
  assert.equal(input.files[0].contentType, 'IMAGE')
})

test('☠️ una foto sin alt no se puede armar: el alt es la mitad del SEO', () => {
  assert.throws(() => construirProductSetInput({
    ...BASE, fotos: [{ url: 'https://res.cloudinary.com/x/a.png', alt: '  ' }],
  }), /alt/i)
})

test('el precio tachado solo aparece si es mayor que el precio', () => {
  const con = construirProductSetInput({ ...BASE, precioTachado: 45 })
  assert.equal(con.variants[0].compareAtPrice, '45.00')
  const sin = construirProductSetInput({ ...BASE, precioTachado: 30 })
  assert.equal(sin.variants[0].compareAtPrice, undefined, 'un tachado menor es un error de dedo')
})

test('el SEO y la categoria viajan con la forma que pide Shopify', () => {
  const input = construirProductSetInput(BASE)
  assert.deepEqual(input.seo, { title: BASE.seoTitulo, description: BASE.seoDescripcion })
  assert.equal(input.category, BASE.categoriaId)
  assert.equal(input.status, 'DRAFT')
})

test('id solo aparece cuando se esta actualizando un producto que ya existe', () => {
  assert.equal(construirProductSetInput(BASE).id, undefined)
  const conId = construirProductSetInput({ ...BASE, id: 'gid://shopify/Product/1' })
  assert.equal(conId.id, 'gid://shopify/Product/1')
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `npm test -- --test-name-pattern="variante|precio|inventario|talla|foto|SEO|id solo"`
Expected: FAIL — `Cannot find module '../lib/shopifyProducto.js'`

- [ ] **Paso 3: Escribir la implementación mínima**

```js
// lib/shopifyProducto.js
// Arma lo que se le manda a productSet y verifica lo que Shopify devolvio.
//
// ☠️ Existe aparte de lib/shopify.js a proposito: ese archivo alimenta el sync,
// o sea el catalogo del CRM y de los DOS inbox. Es camino de lectura y funciona.
// La escritura es logica nueva y vive aislada para no poder tumbarlo.
//
// Todo lo de aqui es PURO: sin red, sin process.env. Por eso se puede probar.
import { TALLAS } from './cotizacion.js'

/** Nombre de la opcion de Shopify. El cliente lo ve en la ficha. */
export const OPCION_TALLA = 'Talla'

/** Lo que se usa cuando el producto no tiene tallas (una gorra, un llavero). */
export const TALLA_UNICA = 'Única'

/** Dinero de Shopify: siempre string con dos decimales. */
function dinero(valor, campo) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`El ${campo} tiene que ser un número mayor que cero (llegó ${JSON.stringify(valor)})`)
  }
  return n.toFixed(2)
}

export function construirProductSetInput(datos) {
  const {
    id, titulo, handle, descripcionHtml, seoTitulo, seoDescripcion, tags,
    tipoProducto, vendor, categoriaId, tallas, precio, precioTachado, fotos, status,
  } = datos || {}

  const precioStr = dinero(precio, 'precio')

  // Un tachado MENOR que el precio no es un descuento, es un error de dedo:
  // se ignora en vez de publicar un "descuento" que sube el precio.
  let tachadoStr
  if (precioTachado !== undefined && precioTachado !== null && precioTachado !== '') {
    const t = dinero(precioTachado, 'precio tachado')
    if (Number(t) > Number(precioStr)) tachadoStr = t
  }

  // Se ordenan por el orden del CRM (XS -> XXXL), no por como llegaron del
  // navegador: el cliente ve las tallas en ese orden en la ficha.
  const elegidas = TALLAS.filter((t) => (tallas || []).includes(t))
  const valores = elegidas.length ? elegidas : [TALLA_UNICA]

  const archivos = (fotos || []).map((f, i) => {
    if (!String(f?.alt || '').trim()) {
      throw new Error(`La foto ${i + 1} no tiene alt text, y el alt es la mitad del SEO de imágenes`)
    }
    return { originalSource: f.url, alt: f.alt.trim(), contentType: 'IMAGE' }
  })

  const input = {
    title: titulo,
    handle,
    descriptionHtml: descripcionHtml,
    seo: { title: seoTitulo, description: seoDescripcion },
    productType: tipoProducto,
    vendor,
    tags: tags || [],
    status: status || 'DRAFT',
    productOptions: [{ name: OPCION_TALLA, values: valores.map((name) => ({ name })) }],
    variants: valores.map((name) => ({
      optionValues: [{ optionName: OPCION_TALLA, name }],
      price: precioStr,
      ...(tachadoStr ? { compareAtPrice: tachadoStr } : {}),
      // Sin seguimiento a proposito: con seguimiento y stock 0, Shopify BLOQUEA
      // la compra y el producto queda publicado pero no vendible.
      inventoryItem: { tracked: false },
    })),
    files: archivos,
  }

  if (categoriaId) input.category = categoriaId
  if (id) input.id = id
  return input
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS — 9 pruebas nuevas en verde, y el resto del repo intacto.

- [ ] **Paso 5: Commit**

```bash
git add lib/shopifyProducto.js tests/shopify-producto-input.test.js
git commit -m "Armar el producto de Shopify a partir de fotos, precio y tallas"
```

---

### Task 2: Verificar lo que Shopify devolvió

**Files:**
- Modify: `lib/shopifyProducto.js` (agregar al final)
- Test: `tests/shopify-producto-verificacion.test.js`

**Interfaces:**
- Consumes: nada de tareas anteriores
- Produces: `verificarProducto(producto, esperado) -> { ok: boolean, fallos: string[] }`.
  `producto` es lo que devuelve la consulta a Shopify. `esperado` = `{ tallas, fotos }`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
// tests/shopify-producto-verificacion.test.js
//
// ☠️ El caso real del 10-sep-2026: productCreate devolvio userErrors: [] y
// habia dejado 1 variante de 5, a 0.00 y sin categoria. Esta funcion es lo que
// impide que un producto asi pase de borrador a ACTIVO.
import test from 'node:test'
import assert from 'node:assert'
import { verificarProducto } from '../lib/shopifyProducto.js'

const SANO = {
  seo: { title: 'Chaqueta Goku | Mandarina', description: 'Chaqueta con estampado de Goku.' },
  category: { id: 'gid://shopify/TaxonomyCategory/aa-1-10-2-2' },
  variants: { nodes: [
    { title: 'S', price: '35.00' },
    { title: 'M', price: '35.00' },
  ] },
  media: { nodes: [{ alt: 'Chaqueta de Goku, frente', status: 'READY' }] },
}
const ESPERADO = { tallas: ['S', 'M'], fotos: 1 }

test('un producto completo pasa', () => {
  const r = verificarProducto(SANO, ESPERADO)
  assert.equal(r.ok, true, `no deberia fallar: ${r.fallos.join(' | ')}`)
  assert.deepEqual(r.fallos, [])
})

test('☠️ una variante a 0.00 no pasa NUNCA', () => {
  const roto = { ...SANO, variants: { nodes: [
    { title: 'S', price: '0.00' }, { title: 'M', price: '35.00' },
  ] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /0\.00|precio/i.test(f)), `fallos: ${r.fallos}`)
})

test('☠️ faltan variantes: se pidieron 2 y vino 1', () => {
  const roto = { ...SANO, variants: { nodes: [{ title: 'S', price: '35.00' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /variante/i.test(f)))
})

test('sin categoria no pasa: sin ella no sirve para el feed de anuncios', () => {
  const r = verificarProducto({ ...SANO, category: null }, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /categor/i.test(f)))
})

test('sin SEO titulo o descripcion no pasa', () => {
  for (const seo of [{ title: '', description: 'x' }, { title: 'x', description: '  ' }, null]) {
    const r = verificarProducto({ ...SANO, seo }, ESPERADO)
    assert.equal(r.ok, false, `paso con seo ${JSON.stringify(seo)}`)
    assert.ok(r.fallos.some((f) => /SEO/i.test(f)))
  }
})

test('☠️ una foto que no esta READY no cuenta aunque el numero cuadre', () => {
  // Shopify descarga y procesa la imagen DESPUES de responder. Mientras tanto
  // la media existe pero NO esta lista: contar no alcanza.
  for (const status of ['FAILED', 'PROCESSING', 'UPLOADED']) {
    const roto = { ...SANO, media: { nodes: [{ alt: 'x', status }] } }
    const r = verificarProducto(roto, ESPERADO)
    assert.equal(r.ok, false, `dejo pasar una foto en ${status}`)
    assert.ok(r.fallos.some((f) => /imagen|foto/i.test(f)))
  }
})

test('☠️ una foto SIN campo status tampoco pasa: se falla cerrado', () => {
  // MediaImage.status es NON_NULL en el esquema de Shopify: si no viene, algo
  // anda mal. Tratar "no se si esta lista" como "esta lista" es fallar ABIERTO
  // en la unica funcion que separa un producto roto de la tienda publica.
  const roto = { ...SANO, media: { nodes: [{ alt: 'Chaqueta de Goku, frente' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false, 'una foto sin status se colo como buena')
  assert.ok(r.fallos.some((f) => /imagen|foto/i.test(f)))
})

test('una foto sin alt no pasa', () => {
  const roto = { ...SANO, media: { nodes: [{ alt: '', status: 'READY' }] } }
  const r = verificarProducto(roto, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.some((f) => /alt/i.test(f)))
})

test('acumula TODOS los fallos, no solo el primero', () => {
  const r = verificarProducto({ seo: null, category: null, variants: { nodes: [] }, media: { nodes: [] } }, ESPERADO)
  assert.equal(r.ok, false)
  assert.ok(r.fallos.length >= 4, `deberia listar todo lo roto, listo: ${r.fallos.length}`)
})

test('no revienta si Shopify devuelve un producto vacio o nulo', () => {
  for (const p of [null, undefined, {}]) {
    const r = verificarProducto(p, ESPERADO)
    assert.equal(r.ok, false)
    assert.ok(Array.isArray(r.fallos) && r.fallos.length > 0)
  }
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `npm test -- --test-name-pattern="verificar|variante|categoria|SEO|foto|acumula|revienta"`
Expected: FAIL — `verificarProducto is not a function`

- [ ] **Paso 3: Escribir la implementación mínima**

```js
// ── al final de lib/shopifyProducto.js ──────────────────────────────────────

/**
 * Comprueba que el producto que Shopify DEVOLVIO sea el que se pidió.
 *
 * ☠️ Esto existe porque `userErrors: []` no prueba nada. Verificado el
 * 10-sep-2026: productCreate respondio sin errores habiendo dejado 1 variante
 * de 5, a 0.00 y sin categoria. Mientras esta funcion no diga ok, el producto
 * se queda en BORRADOR y no lo ve ningun cliente.
 *
 * Devuelve TODOS los fallos, no el primero: si hay tres cosas mal, quien lo
 * arregla quiere verlas de una vez y no descubrirlas de a una.
 */
export function verificarProducto(producto, esperado) {
  const fallos = []
  const p = producto || {}
  const tallasPedidas = esperado?.tallas?.length ? esperado.tallas.length : 1
  const fotosPedidas = Number(esperado?.fotos) || 0

  const variantes = p.variants?.nodes || []
  if (variantes.length !== tallasPedidas) {
    fallos.push(`Se pidieron ${tallasPedidas} variantes y Shopify dejó ${variantes.length}`)
  }
  const enCero = variantes.filter((v) => !(Number(v?.price) > 0))
  if (enCero.length) {
    fallos.push(`${enCero.length} variante(s) quedaron sin precio (0.00): ${enCero.map((v) => v.title).join(', ')}`)
  }

  if (!p.category?.id) fallos.push('El producto quedó sin categoría, así no sirve para el feed de anuncios')

  if (!String(p.seo?.title || '').trim()) fallos.push('El producto quedó sin título SEO')
  if (!String(p.seo?.description || '').trim()) fallos.push('El producto quedó sin descripción SEO')

  const medios = p.media?.nodes || []
  if (medios.length !== fotosPedidas) {
    fallos.push(`Se subieron ${fotosPedidas} fotos y Shopify dejó ${medios.length}`)
  }
  // Shopify descarga y procesa la imagen DESPUES de responder: contar no alcanza.
  //
  // ☠️ Se exige READY, no "distinto de FAILED". `MediaImage.status` es NON_NULL
  // en el esquema, asi que un status ausente significa que algo anda mal — y esta
  // funcion tiene que fallar CERRADA: ante la duda, no se publica.
  // La ESPERA de que el procesamiento termine no es problema de aqui: esta
  // funcion es pura. La resuelve la ruta de publicar, releyendo con reintentos.
  const rotas = medios.filter((m) => m?.status !== 'READY')
  if (rotas.length) fallos.push(`${rotas.length} imagen(es) todavía no están listas (estado ${rotas.map((m) => m?.status || 'desconocido').join(', ')})`)
  const sinAlt = medios.filter((m) => !String(m?.alt || '').trim())
  if (sinAlt.length) fallos.push(`${sinAlt.length} imagen(es) quedaron sin alt text`)

  return { ok: fallos.length === 0, fallos }
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS — todo verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/shopifyProducto.js tests/shopify-producto-verificacion.test.js
git commit -m "Verificar contra Shopify que el producto quedo completo"
```

---

### Task 3: Abrir el camino de escritura a Shopify y borrar la ruta que reparte tokens

**Files:**
- Modify: `lib/shopify.js`
- Delete: `app/api/shopify/auth/route.js`
- Test: `tests/shopify-auth-borrada.test.js`

**Interfaces:**
- Consumes: `getTiendasConfig()` y `getAccessToken()`, ya en `lib/shopify.js`
- Produces: `shopifyGraphQLPorTienda(tiendaId, query, variables) -> Promise<data>`. Lanza si la tienda no está configurada.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// tests/shopify-auth-borrada.test.js
//
// 🔒 /api/shopify/auth era un endpoint de diagnostico de UN SOLO USO que
// imprimia en HTML un token de Admin con write_products. No lo llamaba nadie,
// pero se lo mostraba a cualquiera de los ~14 usuarios del CRM, incluido un
// VENDEDOR. Esta prueba existe para que no vuelva.
import test from 'node:test'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { shopifyGraphQLPorTienda } from '../lib/shopify.js'

test('🔒 la ruta que imprimia un token de Admin no existe', () => {
  const ruta = new URL('../app/api/shopify/auth/route.js', import.meta.url)
  assert.equal(existsSync(ruta), false, 'volvio la ruta que reparte tokens')
})

test('se puede hablar con Shopify por id de tienda', () => {
  assert.equal(typeof shopifyGraphQLPorTienda, 'function')
})

test('una tienda que no existe falla con un mensaje que se entiende', async () => {
  await assert.rejects(
    () => shopifyGraphQLPorTienda('YAW', 'query { shop { name } }'),
    /YAW/,
    'el error tiene que nombrar la tienda')
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- --test-name-pattern="token de Admin|por id de tienda|no existe falla"`
Expected: FAIL — `shopifyGraphQLPorTienda is not exported` y la ruta todavía existe.

- [ ] **Paso 3: Implementar**

Agregar al final de `lib/shopify.js`:

```js
/**
 * Habla con la Admin API de una tienda por su id, resolviendo el token sola.
 *
 * Es la puerta de ESCRITURA. La lectura (fetchShopifyProducts) sigue igual.
 *
 * ⚠️ getAccessToken cachea el token ~24 h en memoria. Al cambiar los permisos
 * de la app en Shopify, una instancia tibia de Vercel puede seguir usando el
 * token VIEJO y devolver 403 aunque el permiso ya este puesto. Quien llame
 * tiene que decir eso en el aviso al usuario.
 */
export async function shopifyGraphQLPorTienda(tiendaId, query, variables) {
  const tienda = getTiendasConfig().find((t) => t.id === tiendaId)
  if (!tienda) {
    throw new Error(`La tienda ${tiendaId} no tiene Shopify configurado en este entorno`)
  }
  const token = await getAccessToken(tienda.id, tienda.store, tienda.clientId, tienda.clientSecret)
  return shopifyGraphQL(tienda.store, token, query, variables)
}
```

Y borrar la ruta:

```bash
git rm app/api/shopify/auth/route.js
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS. Además `npm run build` tiene que compilar sin referencias rotas.

- [ ] **Paso 5: Commit**

```bash
git add lib/shopify.js tests/shopify-auth-borrada.test.js
git commit -m "Abrir la escritura a Shopify y borrar la ruta que imprimia un token"
```

---

### Task 4: Ruta que busca la categoría en la taxonomía

**Files:**
- Create: `app/api/productos-shopify/categorias/route.js`
- Test: `tests/api-productos-shopify-blindada.test.js`

**Interfaces:**
- Consumes: `shopifyGraphQLPorTienda` (Task 3), `requireAdmin` de `lib/auth.js`
- Produces: `GET /api/productos-shopify/categorias?q=<texto>&tienda=<id>` → `{ categorias: [{ id, nombre, ruta }] }`

- [ ] **Paso 1: Escribir la prueba que falla**

Sigue el patrón de `tests/api-cotizaciones-blindada.test.js`: se lee el **texto fuente** de la ruta y se afirma sobre él.

```js
// tests/api-productos-shopify-blindada.test.js
//
// Las rutas del panel de productos son SOLO ADMIN: crean y publican cosas en
// la tienda real. Esta prueba vigila que ninguna se abra por descuido.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const leer = (p) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))

const categorias = leer('../app/api/productos-shopify/categorias/route.js')

test('la busqueda de categorias exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(categorias), 'falta requireAdmin')
  assert.ok(/auth\.ok/.test(categorias), 'llama a requireAdmin pero no mira el resultado')
})

test('☠️ no se lee el rol ni el usuario de la url ni de una cabecera', () => {
  for (const p of ['rol', 'usuario', 'usuarioId', 'admin']) {
    assert.ok(!new RegExp(`searchParams\\.get\\('${p}'\\)`).test(categorias), `lee ?${p}= del navegador`)
  }
  assert.ok(!/headers\.get\('x-mp-usuario-id'\)/.test(categorias), 'confia en una cabecera')
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- --test-name-pattern="categorias exige|no se lee el rol"`
Expected: FAIL — `ENOENT` porque la ruta todavía no existe.

- [ ] **Paso 3: Implementar**

```js
// app/api/productos-shopify/categorias/route.js
export const dynamic = 'force-dynamic'
import { requireAdmin } from '@/lib/auth'
import { shopifyGraphQLPorTienda } from '@/lib/shopify'

// Busca categorias en la taxonomia de Shopify — SOLO ADMIN.
//
// ⚠️ La taxonomia viene EN ESPAÑOL (el idioma de la tienda) y falla en
// SILENCIO: probado el 10-sep-2026, "jacket" devuelve [] sin error y "Coats"
// devuelve Congas y Capotas. Solo "Chaquetas" trae lo correcto. Por eso la IA
// nunca inventa un id: propone un TERMINO en español y aqui se busca de verdad.
const TAXONOMIA = `
query BuscarCategoria($search: String!) {
  taxonomy {
    categories(first: 10, search: $search) {
      nodes { id name fullName isLeaf }
    }
  }
}`

export async function GET(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const tienda = searchParams.get('tienda') || 'MANDARINA'
    if (!q) return Response.json({ categorias: [] })

    const data = await shopifyGraphQLPorTienda(tienda, TAXONOMIA, { search: q })
    const categorias = (data?.taxonomy?.categories?.nodes || [])
      .filter((c) => c.isLeaf)   // solo hojas: Shopify no acepta ramas
      .map((c) => ({ id: c.id, nombre: c.name, ruta: c.fullName }))

    return Response.json({ categorias })
  } catch (e) {
    console.error('categorias error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS.

Verificación manual (con sesión de ADMIN en el navegador):
`/api/productos-shopify/categorias?q=Chaquetas` → tiene que traer `Chaquetas bomber` con su ruta. `?q=jacket` → `{ categorias: [] }`.

- [ ] **Paso 5: Commit**

```bash
git add app/api/productos-shopify/categorias/route.js tests/api-productos-shopify-blindada.test.js
git commit -m "Buscar la categoria de Shopify desde el CRM (solo ADMIN)"
```

---

### Task 5: Ruta que redacta el producto con IA

**Files:**
- Create: `app/api/productos-shopify/redactar/route.js`
- Modify: `tests/api-productos-shopify-blindada.test.js`

**Interfaces:**
- Consumes: `requireAdmin`
- Produces: `POST /api/productos-shopify/redactar` con body `{ fotos: [url], precio, tienda }` → `{ titulo, handle, descripcionHtml, seoTitulo, seoDescripcion, tags, tipoProducto, vendor, altTextos, tallasSugeridas, categoriaBusqueda, anuncios }`.
  `anuncios` = `{ metaTexto, metaTitular, googleTitulares: [3], googleDescripciones: [2] }`.

- [ ] **Paso 1: Agregar la prueba que falla**

Al final de `tests/api-productos-shopify-blindada.test.js`:

```js
const redactar = leer('../app/api/productos-shopify/redactar/route.js')

test('redactar exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(redactar))
  assert.ok(/auth\.ok/.test(redactar))
})

test('🔒 la clave de Anthropic no sale del servidor', () => {
  assert.ok(/process\.env\.ANTHROPIC_API_KEY/.test(redactar), 'la clave se lee del entorno')
  assert.ok(!/NEXT_PUBLIC_/.test(redactar), 'una clave con NEXT_PUBLIC_ viaja al navegador')
})

test('☠️ el prompt prohibe inventar lo que no se ve en la foto', () => {
  // Vigila DOS cosas: que la lista de prohibidos siga ahi, y que siga siendo
  // una PROHIBICION y no una sugerencia.
  //
  // Lo que esta prueba NO puede hacer, y conviene saberlo: si alguien reescribe
  // el prompt invirtiendo el sentido pero conservando el vocabulario ("si puedes
  // mencionar la composicion..."), una comparacion de texto no lo detecta.
  // Contra eso no hay prueba automatica, hay revision humana.
  assert.ok(/PROHIBIDO INVENTAR/.test(redactar), 'se perdio la prohibicion explicita')
  assert.ok(/Nunca menciones/.test(redactar), 'se perdio la forma imperativa de la regla')
  for (const palabra of ['composición', 'lavado', 'medidas']) {
    assert.ok(redactar.includes(palabra), `el prompt no menciona ${palabra} en la lista de prohibidos`)
  }
})

test('☠️ lo que devuelve la IA se comprueba de TIPO, no solo de existencia', () => {
  // `|| []` no protege de un string: `.filter` no existiria (500 mudo) y
  // `altTextos?.[i]` sobre un string devuelve letras sueltas.
  assert.ok(/Array\.isArray\(ficha\.altTextos\)/.test(redactar), 'altTextos no se comprueba de tipo')
  assert.ok(/Array\.isArray\(ficha\.tallasSugeridas\)/.test(redactar), 'tallasSugeridas no se comprueba de tipo')
})

test('☠️ la IA no devuelve el id de categoria, devuelve un termino de busqueda', () => {
  assert.ok(/categoriaBusqueda/.test(redactar), 'falta el campo de termino de busqueda')
  assert.ok(!/TaxonomyCategory/.test(redactar), 'si el prompt conoce el formato del id, se lo inventa')
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- --test-name-pattern="redactar exige|Anthropic|prohibe inventar|termino de busqueda"`
Expected: FAIL — `ENOENT`.

- [ ] **Paso 3: Implementar**

```js
// app/api/productos-shopify/redactar/route.js
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { requireAdmin } from '@/lib/auth'
import { TALLAS } from '@/lib/cotizacion'

// Mira las fotos y redacta el producto entero — SOLO ADMIN.
// Mismo patron que /api/analyze-image: la clave vive SOLO en el servidor.

const INSTRUCCIONES = `Eres quien redacta las fichas de producto de una marca ecuatoriana de ropa.
Miras las fotos de UN producto y devuelves su ficha lista para Shopify, en español de Ecuador.

PROHIBIDO INVENTAR. Escribe solo lo que se ve en las fotos. Nunca menciones:
composición de la tela, gramaje, país de fabricación, medidas, ni instrucciones de lavado.
Si no está en la imagen, no se escribe.

Devuelve SOLO un objeto JSON, sin texto alrededor, con estas claves:
- titulo: máximo 70 caracteres, sin el nombre de la marca
- handle: minúsculas, sin tildes ni espacios, separado por guiones
- descripcionHtml: 2 párrafos <p> y una lista <ul> de 3 a 5 <li>
- seoTitulo: máximo 60 caracteres
- seoDescripcion: entre 120 y 155 caracteres
- tags: 5 a 8 palabras clave en minúsculas
- tipoProducto: una o dos palabras (por ejemplo "Chaquetas")
- altTextos: un texto descriptivo por cada foto, EN EL MISMO ORDEN, máximo 120 caracteres
- tallasSugeridas: subconjunto de ${JSON.stringify(TALLAS)} típico de esa prenda; [] si no lleva tallas
- categoriaBusqueda: UNA o DOS palabras EN ESPAÑOL para buscar la categoría (por ejemplo "Chaquetas")
- anuncios: { metaTexto (máx 125), metaTitular (máx 40), googleTitulares (3, máx 30 cada uno), googleDescripciones (2, máx 90 cada una) }`

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

    const { fotos, precio } = await req.json().catch(() => ({}))
    if (!Array.isArray(fotos) || !fotos.length) {
      return Response.json({ error: 'Hacen falta las fotos' }, { status: 400 })
    }

    const contenido = fotos.map((url) => ({ type: 'image', source: { type: 'url', url } }))
    contenido.push({ type: 'text', text: `${INSTRUCCIONES}\n\nPrecio de venta: $${precio}. Son ${fotos.length} foto(s).` })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 2000, messages: [{ role: 'user', content: contenido }] }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('redactar Anthropic error:', data)
      return Response.json({ error: data?.error?.message || 'Error de Anthropic' }, { status: 502 })
    }

    const texto = data?.content?.[0]?.text || ''
    const crudo = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)
    let ficha
    try {
      ficha = JSON.parse(crudo)
    } catch {
      return Response.json({ error: 'La IA no devolvió un JSON válido, vuelve a intentar' }, { status: 502 })
    }

    // ⚠️ Lo que devuelve la IA es texto libre, no un contrato: CUALQUIER campo
    // puede llegar con el tipo equivocado, y `|| []` no protege de eso.
    //   · si `tallasSugeridas` viene como string, `.filter` no existe y la ruta
    //     muere con un 500 mudo en vez de un aviso que se entienda;
    //   · si `altTextos` viene como string, `altTextos?.[i]` devuelve LETRAS
    //     SUELTAS, y el alt de cada foto acabaría siendo una letra.
    // Por eso se comprueba el tipo antes de tocarlos.
    const alts = Array.isArray(ficha.altTextos) ? ficha.altTextos : []
    const tallas = Array.isArray(ficha.tallasSugeridas) ? ficha.tallasSugeridas : []

    // Un alt por foto, sí o sí: construirProductSetInput rechaza los vacíos y
    // es mejor que el hueco se vea en pantalla que reventar al publicar.
    ficha.altTextos = fotos.map((_, i) => String(alts[i] || ''))
    ficha.tallasSugeridas = tallas.filter((t) => TALLAS.includes(t))

    return Response.json(ficha)
  } catch (e) {
    console.error('redactar error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add app/api/productos-shopify/redactar/route.js tests/api-productos-shopify-blindada.test.js
git commit -m "Redactar la ficha del producto mirando las fotos"
```

---

### Task 6: Ruta que publica (borrador → verificar → activar)

**Files:**
- Create: `app/api/productos-shopify/publicar/route.js`
- Modify: `tests/api-productos-shopify-blindada.test.js`

**Interfaces:**
- Consumes: `construirProductSetInput` y `verificarProducto` (Tasks 1-2), `shopifyGraphQLPorTienda` (Task 3)
- Produces: `POST /api/productos-shopify/publicar` → `{ ok, productoId, handle, urlAdmin, urlTienda, activado, fallos, sync }`

- [ ] **Paso 1: Agregar la prueba que falla**

```js
const publicar = leer('../app/api/productos-shopify/publicar/route.js')

test('publicar exige ser ADMIN', () => {
  assert.ok(/requireAdmin\(req\)/.test(publicar))
  assert.ok(/auth\.ok/.test(publicar))
})

test('☠️ se publica con productSet, NUNCA con productCreate', () => {
  assert.ok(/productSet/.test(publicar), 'falta productSet')
  assert.ok(!/productCreate/.test(publicar),
    'productCreate deja el producto a medio hacer devolviendo userErrors: []')
})

test('☠️ nace en DRAFT y solo se activa despues de verificar', () => {
  const iDraft = publicar.indexOf("'DRAFT'")
  // 'verificarProducto(' con paréntesis: así se agarra la LLAMADA, no el import
  // de arriba del archivo (que también dice "verificarProducto" y adelantaría
  // el índice de forma artificial, haciendo fallar la prueba con codigo CORRECTO).
  const iVerif = publicar.indexOf('verificarProducto(')
  const iActive = publicar.indexOf("'ACTIVE'")
  assert.ok(iDraft > -1 && iVerif > -1 && iActive > -1, 'faltan DRAFT, verificarProducto o ACTIVE')
  assert.ok(iDraft < iVerif && iVerif < iActive,
    'el orden tiene que ser DRAFT -> verificar -> ACTIVE, o hay una ventana con el producto roto a la venta')
})

test('un 403 avisa que puede ser el token cacheado', () => {
  assert.ok(/cacheado|caché|cache/i.test(publicar),
    'sin ese aviso se diagnostica mal un permiso que ya esta puesto')
})

test('☠️ se reintenta mientras las fotos siguen procesandose', () => {
  // Shopify procesa las imagenes async. Sin reintento, verificar una sola vez
  // dejaria en borrador casi toda publicacion legitima.
  assert.ok(/for \(let intento/.test(publicar), 'falta el bucle de reintento')
  assert.ok(/soloFaltanFotos/.test(publicar),
    'el reintento tiene que ser SOLO por fotos: si esta roto por otra cosa, no se insiste')
})

test('☠️ ACTIVE no basta: tambien se publica al canal Tienda Online', () => {
  // La doc del esquema de Shopify lo dice: "Products with an active status
  // aren't automatically published to sales channels". Sin este paso el
  // producto queda ACTIVO y NINGUN cliente lo ve en la web.
  assert.ok(/publishablePublish/.test(publicar), 'falta publicar al canal de venta')
  assert.ok(/onlineStoreUrl/.test(publicar), 'sin onlineStoreUrl no hay como comprobar que se ve')
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- --test-name-pattern="publicar exige|productSet|DRAFT|token cacheado"`
Expected: FAIL — `ENOENT`.

- [ ] **Paso 3: Implementar**

```js
// app/api/productos-shopify/publicar/route.js
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { requireAdmin } from '@/lib/auth'
import { shopifyGraphQLPorTienda } from '@/lib/shopify'
import { construirProductSetInput, verificarProducto } from '@/lib/shopifyProducto'

// Publica el producto en Shopify — SOLO ADMIN.
//
// ☠️ Nace en BORRADOR, se VUELVE A LEER de Shopify, y solo si todo cuadra pasa
// a ACTIVO. Verificado el 10-sep-2026: productCreate devolvio userErrors: [] con
// 1 variante de 5 a 0.00 y sin categoria. Un 200 no prueba nada. Con este orden
// nunca existe un instante en que un producto a medio armar este comprable.

const CAMPOS = `
  id handle status onlineStoreUrl
  seo { title description }
  category { id }
  variants(first: 20) { nodes { id title price } }
  media(first: 20) { nodes { alt status } }`

const SET = `
mutation FijarProducto($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) {
    product { ${CAMPOS} }
    userErrors { field message code }
  }
}`

const LEER = `query LeerProducto($id: ID!) { product(id: $id) { ${CAMPOS} } }`

// ☠️ Poner el producto en ACTIVE **no** lo hace visible en la web. Lo dice la
// documentacion del propio esquema: "Products with an active status aren't
// automatically published to sales channels, such as the online store".
// Sin este paso el producto queda activo y comprable por API, pero NINGUN
// cliente lo ve en mandarinaec.com. Hay que publicarlo al canal a mano.
const CANALES = `query Canales { publications(first: 20) { nodes { id name } } }`

const PUBLICAR_CANAL = `
mutation PublicarEnCanal($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    publishable { ... on Product { id onlineStoreUrl } }
    userErrors { field message }
  }
}`

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({}))
    const tienda = body.tienda || 'MANDARINA'

    // 1) Crear (o actualizar, si ya hay id de un intento anterior) en BORRADOR.
    const input = construirProductSetInput({ ...body, status: 'DRAFT' })
    const creado = await shopifyGraphQLPorTienda(tienda, SET, { input })
    const errores = creado?.productSet?.userErrors || []
    if (errores.length) {
      return Response.json({ error: errores.map((e) => e.message).join(' · ') }, { status: 400 })
    }
    const producto = creado?.productSet?.product
    if (!producto?.id) return Response.json({ error: 'Shopify no devolvió el producto' }, { status: 502 })

    // 2) Releer de Shopify y verificar. NO se confia en la respuesta de arriba.
    //
    // ☠️ Shopify procesa las imagenes de forma ASINCRONA: "images might not be
    // immediately available after upload". Recien creado el producto, las fotos
    // estan en UPLOADED o PROCESSING, no en READY — verificar una sola vez
    // dejaria en borrador casi toda publicacion legitima. Por eso se reintenta
    // mientras lo UNICO que falta sea que las fotos terminen de procesarse.
    const esperado = {
      tallas: body.tallas || [],
      fotos: (body.fotos || []).length,
    }
    const espera = (ms) => new Promise((r) => setTimeout(r, ms))
    const soloFaltanFotos = (f) => f.length > 0 && f.every((x) => /imagen/i.test(x))

    let ok = false
    let fallos = []
    for (let intento = 0; intento < 6; intento++) {
      const leido = await shopifyGraphQLPorTienda(tienda, LEER, { id: producto.id })
      ;({ ok, fallos } = verificarProducto(leido?.product, esperado))
      if (ok || !soloFaltanFotos(fallos)) break   // listo, o roto por otra cosa
      await espera(2000)                          // hasta ~12 s de procesado
    }

    // 3) Solo si esta sano, se activa Y se publica al canal Tienda Online.
    //    `soloBorrador` es el boton Despublicar: se salta este paso entero.
    let activado = false
    let urlTienda = null
    if (ok && !body.soloBorrador) {
      const act = await shopifyGraphQLPorTienda(tienda, SET, {
        input: { id: producto.id, status: 'ACTIVE' },
      })
      activado = act?.productSet?.product?.status === 'ACTIVE'

      // ☠️ ACTIVE no basta: hay que publicarlo al canal o nadie lo ve en la web.
      const canales = await shopifyGraphQLPorTienda(tienda, CANALES)
      const online = (canales?.publications?.nodes || [])
        .find((c) => /online store|tienda online/i.test(c.name || ''))
      if (online) {
        const pub = await shopifyGraphQLPorTienda(tienda, PUBLICAR_CANAL, {
          id: producto.id, input: [{ publicationId: online.id }],
        })
        urlTienda = pub?.publishablePublish?.publishable?.onlineStoreUrl || null
      }
      // Si no hay URL publica, el producto NO se ve aunque diga ACTIVO.
      if (!urlTienda) {
        ok = false
        fallos.push('El producto está activo pero no quedó visible en la tienda online')
      }
    }

    // 4) Refrescar el catalogo para que aparezca en los DOS inbox. Si falla, el
    //    producto SIGUE publicado: son dos estados distintos y se informan aparte.
    let sync = 'ok'
    try {
      const r = await fetch(new URL('/api/shopify/sync', req.url), {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
      })
      if (!r.ok) sync = 'falló'
    } catch { sync = 'falló' }

    const numerico = String(producto.id).split('/').pop()
    return Response.json({
      ok, activado, fallos, sync, urlTienda,
      productoId: producto.id,
      handle: producto.handle,
      urlAdmin: `https://admin.shopify.com/store/${tienda.toLowerCase()}/products/${numerico}`,
    })
  } catch (e) {
    const msg = String(e.message || e)
    // ⚠️ El token se cachea ~24 h en memoria (lib/shopify.js). Tras cambiar los
    // permisos en Shopify, una instancia tibia sigue con el token VIEJO.
    if (/403/.test(msg)) {
      return Response.json({
        error: 'Shopify rechazó la escritura (403). Puede ser el token cacheado de hasta 24 h: espera un momento y vuelve a intentar. Si sigue, revisa que la app tenga write_products.',
      }, { status: 403 })
    }
    console.error('publicar error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test` y `npm run build`
Expected: PASS y build limpio.

- [ ] **Paso 5: Commit**

```bash
git add app/api/productos-shopify/publicar/route.js tests/api-productos-shopify-blindada.test.js
git commit -m "Publicar en Shopify: borrador, verificar y recien ahi activar"
```

---

### Task 7: Zona de fotos

**Files:**
- Create: `components/producto-nuevo/SoltarFotos.js`

**Interfaces:**
- Consumes: `POST /api/upload-sign` (ya existe) → `{ cloudName, apiKey, timestamp, folder, publicId, signature }`
- Produces: componente `<SoltarFotos fotos={[]} onCambio={(fotos) => {}} />`. `fotos` = `[{ url, alt }]`

- [ ] **Paso 1: Implementar el componente**

```jsx
'use client'
import { useState } from 'react'

// Zona para soltar las fotos de UN producto.
//
// Suben del navegador DIRECTO a Cloudinary con la firma de /api/upload-sign:
// asi no pasan por la funcion serverless y no las frena el tope de ~4,5 MB de
// Vercel. La PRIMERA foto es la principal del producto.
export default function SoltarFotos({ fotos, onCambio }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function subirUna(file) {
    const firmaRes = await fetch('/api/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'producto', filename: file.name }),
    })
    if (!firmaRes.ok) throw new Error('No se pudo firmar la subida')
    const f = await firmaRes.json()

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', f.apiKey)
    form.append('timestamp', f.timestamp)
    form.append('folder', f.folder)
    form.append('public_id', f.publicId)
    form.append('signature', f.signature)

    const subida = await fetch(`https://api.cloudinary.com/v1_1/${f.cloudName}/auto/upload`, {
      method: 'POST', body: form,
    })
    if (!subida.ok) throw new Error(`Cloudinary rechazó ${file.name}`)
    const { secure_url } = await subida.json()
    return { url: secure_url, alt: '' }
  }

  async function agregar(lista) {
    const imagenes = Array.from(lista).filter((f) => f.type.startsWith('image/'))
    if (!imagenes.length) return
    setSubiendo(true); setError('')
    try {
      const nuevas = []
      for (const f of imagenes) nuevas.push(await subirUna(f))
      onCambio([...fotos, ...nuevas])
    } catch (e) {
      setError(e.message)
    } finally {
      setSubiendo(false)
    }
  }

  const mover = (i, salto) => {
    const j = i + salto
    if (j < 0 || j >= fotos.length) return
    const copia = [...fotos]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onCambio(copia)
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); agregar(e.dataTransfer.files) }}
        style={{ border: '2px dashed #ccc', borderRadius: 8, padding: 32, textAlign: 'center' }}
      >
        <p>{subiendo ? 'Subiendo…' : 'Arrastra aquí las fotos de un producto'}</p>
        <input type="file" accept="image/*" multiple disabled={subiendo}
          onChange={(e) => agregar(e.target.files)} />
      </div>

      {error && <p style={{ color: '#c00' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {fotos.map((f, i) => (
          <div key={f.url} style={{ width: 110 }}>
            <img src={f.url} alt="" style={{ width: '100%', borderRadius: 6 }} />
            <small>{i === 0 ? '★ principal' : `#${i + 1}`}</small>
            <div>
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}>←</button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1}>→</button>
              <button type="button" onClick={() => onCambio(fotos.filter((_, j) => j !== i))}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar en el navegador**

Run: `npm run dev`, entrar como ADMIN, y montar el componente temporalmente en `app/dashboard/producto-nuevo/page.js` con un `useState`.
Expected: se sueltan 3 fotos, se ven las miniaturas, la primera dice "★ principal", las flechas reordenan y la ✕ quita.

- [ ] **Paso 3: Commit**

```bash
git add components/producto-nuevo/SoltarFotos.js
git commit -m "Zona para soltar y ordenar las fotos del producto"
```

---

### Task 8: Formulario de revisión

**Files:**
- Create: `components/producto-nuevo/RevisionProducto.js`

**Interfaces:**
- Consumes: `GET /api/productos-shopify/categorias` (Task 4), `TALLAS` de `lib/cotizacion`
- Produces: `<RevisionProducto ficha={} onCambio={} tienda="" />`. `ficha` lleva todos los campos de Task 5 más `tallas`, `categoriaId` y `categoriaRuta`.

- [ ] **Paso 1: Implementar**

```jsx
'use client'
import { useState } from 'react'
import { TALLAS } from '@/lib/cotizacion'

const Contador = ({ texto, tope }) => (
  <small style={{ color: (texto || '').length > tope ? '#c00' : '#888' }}>
    {(texto || '').length}/{tope}
  </small>
)

// Revision antes de publicar. Como el producto sale ACTIVO, esta pantalla es la
// unica red: todo tiene que poder corregirse aqui.
export default function RevisionProducto({ ficha, onCambio, tienda }) {
  const [buscando, setBuscando] = useState(false)
  const [candidatas, setCandidatas] = useState([])
  const [termino, setTermino] = useState(ficha.categoriaBusqueda || '')

  const set = (campo, valor) => onCambio({ ...ficha, [campo]: valor })

  async function buscarCategoria() {
    setBuscando(true)
    try {
      const r = await fetch(`/api/productos-shopify/categorias?q=${encodeURIComponent(termino)}&tienda=${tienda}`)
      const { categorias } = await r.json()
      setCandidatas(categorias || [])
    } finally { setBuscando(false) }
  }

  const alternarTalla = (t) => set('tallas',
    ficha.tallas?.includes(t) ? ficha.tallas.filter((x) => x !== t) : [...(ficha.tallas || []), t])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <label>Título
        <input value={ficha.titulo || ''} onChange={(e) => set('titulo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>URL del producto
        <input value={ficha.handle || ''} onChange={(e) => set('handle', e.target.value)} style={{ width: '100%' }} />
        <small>mandarinaec.com/products/{ficha.handle || '…'}</small>
      </label>

      <label>Descripción
        <textarea rows={8} value={ficha.descripcionHtml || ''}
          onChange={(e) => set('descripcionHtml', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>Título SEO <Contador texto={ficha.seoTitulo} tope={60} />
        <input value={ficha.seoTitulo || ''} onChange={(e) => set('seoTitulo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>Descripción SEO <Contador texto={ficha.seoDescripcion} tope={155} />
        <textarea rows={2} value={ficha.seoDescripcion || ''}
          onChange={(e) => set('seoDescripcion', e.target.value)} style={{ width: '100%' }} />
      </label>

      {/* Vista previa de Google: se juzga el SEO de un vistazo, no campo por campo */}
      <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
        <div style={{ color: '#1a0dab', fontSize: 18 }}>{ficha.seoTitulo || ficha.titulo}</div>
        <div style={{ color: '#006621', fontSize: 13 }}>mandarinaec.com › products › {ficha.handle}</div>
        <div style={{ color: '#545454', fontSize: 13 }}>{ficha.seoDescripcion}</div>
      </div>

      <div>
        <strong>Categoría</strong>
        {ficha.categoriaRuta
          ? <p style={{ color: '#060' }}>✓ {ficha.categoriaRuta}</p>
          : <p style={{ color: '#c00' }}>⚠️ Sin categoría. Sin ella el producto no sirve para los anuncios.</p>}
        <input value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Buscar en español (ej: Chaquetas)" />
        <button type="button" onClick={buscarCategoria} disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
        {!buscando && candidatas.length === 0 && termino && (
          <p><small>Sin resultados. ⚠️ La taxonomía de Shopify está en español: prueba con &quot;Chaquetas&quot; en vez de &quot;jacket&quot;.</small></p>
        )}
        <ul>
          {candidatas.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onCambio({ ...ficha, categoriaId: c.id, categoriaRuta: c.ruta })}>
                {c.ruta}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <strong>Tallas</strong>
        {TALLAS.map((t) => (
          <label key={t} style={{ marginRight: 12 }}>
            <input type="checkbox" checked={ficha.tallas?.includes(t) || false} onChange={() => alternarTalla(t)} /> {t}
          </label>
        ))}
        {!ficha.tallas?.length && <p><small>Sin tallas marcadas se publica como talla Única.</small></p>}
      </div>

      <div>
        <strong>Texto alternativo de cada foto</strong>
        {(ficha.fotos || []).map((f, i) => (
          <div key={f.url} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <img src={f.url} alt="" width={48} />
            <input style={{ flex: 1 }} value={f.alt || ''} placeholder="Describe la foto"
              onChange={(e) => {
                const copia = [...ficha.fotos]
                copia[i] = { ...copia[i], alt: e.target.value }
                onCambio({ ...ficha, fotos: copia })
              }} />
          </div>
        ))}
      </div>

      <details>
        <summary>Textos de anuncio</summary>
        {Object.entries(ficha.anuncios || {}).map(([clave, valor]) => (
          <div key={clave} style={{ marginTop: 8 }}>
            <small>{clave}</small>
            <div style={{ display: 'flex', gap: 8 }}>
              <code style={{ flex: 1 }}>{Array.isArray(valor) ? valor.join(' · ') : valor}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(
                Array.isArray(valor) ? valor.join('\n') : String(valor))}>Copiar</button>
            </div>
          </div>
        ))}
      </details>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar en el navegador**

Expected: los contadores se ponen rojos al pasar de 60/155, la vista previa de Google refleja lo que escribes, buscar "Chaquetas" trae opciones y elegir una deja el ✓ verde, buscar "jacket" muestra el aviso del idioma.

- [ ] **Paso 3: Commit**

```bash
git add components/producto-nuevo/RevisionProducto.js
git commit -m "Formulario de revision del producto antes de publicar"
```

---

### Task 9: La pantalla y el resultado

**Files:**
- Create: `components/producto-nuevo/ResultadoPublicacion.js`
- Create: `app/dashboard/producto-nuevo/page.js`
- Modify: `app/dashboard/page.js` (agregar la tarjeta de acceso, solo visible para ADMIN)

**Interfaces:**
- Consumes: `SoltarFotos` (7), `RevisionProducto` (8), las tres rutas (4-6)
- Produces: la pantalla completa en `/dashboard/producto-nuevo`

- [ ] **Paso 1: Implementar el resultado**

```jsx
'use client'
// components/producto-nuevo/ResultadoPublicacion.js
export default function ResultadoPublicacion({ res, onDespublicar, onOtro }) {
  return (
    <div>
      {res.activado
        ? <h3 style={{ color: '#060' }}>✓ Publicado y activo en la tienda</h3>
        : <h3 style={{ color: '#c60' }}>⚠️ Quedó en BORRADOR: la verificación encontró problemas</h3>}

      {!res.ok && (
        <ul style={{ color: '#c00' }}>{res.fallos.map((f) => <li key={f}>{f}</li>)}</ul>
      )}

      {res.sync !== 'ok' && (
        <p>El producto <strong>sí</strong> está en Shopify, pero el catálogo no se refrescó:
          todavía no aparece en los inbox. Se corrige solo en el próximo sync.</p>
      )}

      <p><a href={res.urlAdmin} target="_blank" rel="noreferrer">Abrir en Shopify</a></p>
      {res.urlTienda
        ? <p><a href={res.urlTienda} target="_blank" rel="noreferrer">Ver en la tienda →</a></p>
        : <p><small>Todavía no tiene página pública en la tienda.</small></p>}
      <button type="button" onClick={onDespublicar}>Despublicar</button>
      <button type="button" onClick={onOtro}>Cargar otro producto</button>
    </div>
  )
}
```

- [ ] **Paso 2: Implementar la pantalla**

```jsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import SoltarFotos from '@/components/producto-nuevo/SoltarFotos'
import RevisionProducto from '@/components/producto-nuevo/RevisionProducto'
import ResultadoPublicacion from '@/components/producto-nuevo/ResultadoPublicacion'

export default function ProductoNuevoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [fotos, setFotos] = useState([])
  const [precio, setPrecio] = useState('')
  const [precioTachado, setPrecioTachado] = useState('')
  const [ficha, setFicha] = useState(null)
  const [res, setRes] = useState(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')

  // El guardia de pantalla. El de verdad esta en el servidor (requireAdmin).
  useEffect(() => {
    const guardado = localStorage.getItem('mp_user')
    if (!guardado) { router.push('/'); return }
    const u = JSON.parse(guardado)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
  }, [])

  async function redactar() {
    setCargando('redactando'); setError('')
    try {
      const r = await fetch('/api/productos-shopify/redactar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotos: fotos.map((f) => f.url), precio, tienda }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFicha({
        ...d,
        fotos: fotos.map((f, i) => ({ ...f, alt: d.altTextos?.[i] || '' })),
        tallas: d.tallasSugeridas || [],
        vendor: d.vendor || (tienda === 'MANDARINA' ? 'Mandarina Republic' : 'Indstore'),
      })
    } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  async function publicar() {
    setCargando('publicando'); setError('')
    try {
      const r = await fetch('/api/productos-shopify/publicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ficha, tienda, precio, precioTachado,
          // Si ya hubo un intento, se ACTUALIZA ese producto en vez de duplicar.
          id: res?.productoId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setRes(d)
    } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  if (!user) return null

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <h1>Cargar producto a Shopify</h1>

      {!ficha && !res && (
        <>
          <div>
            <strong>Tienda</strong>
            {['MANDARINA', 'INDSTORE'].map((t) => (
              <label key={t} style={{ marginLeft: 12 }}>
                <input type="radio" name="tienda" checked={tienda === t} onChange={() => setTienda(t)} /> {t}
              </label>
            ))}
          </div>
          <SoltarFotos fotos={fotos} onCambio={setFotos} />
          <label>Precio $
            <input type="number" min="0.01" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <label>Precio tachado $ (opcional)
            <input type="number" min="0" step="0.01" value={precioTachado} onChange={(e) => setPrecioTachado(e.target.value)} />
          </label>
          <button type="button" onClick={redactar} disabled={!fotos.length || !(Number(precio) > 0) || !!cargando}>
            {cargando === 'redactando' ? 'Redactando…' : 'Redactar con IA'}
          </button>
        </>
      )}

      {ficha && !res && (
        <>
          <RevisionProducto ficha={ficha} onCambio={setFicha} tienda={tienda} />
          <button type="button" onClick={publicar}
            disabled={!!cargando || !ficha.categoriaId || (ficha.fotos || []).some((f) => !f.alt?.trim())}>
            {cargando === 'publicando' ? 'Publicando…' : 'Publicar en Shopify'}
          </button>
        </>
      )}

      {res && <ResultadoPublicacion res={res}
        onDespublicar={async () => {
          await fetch('/api/productos-shopify/publicar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...ficha, tienda, precio, id: res.productoId, soloBorrador: true }),
          })
          setRes({ ...res, activado: false })
        }}
        onOtro={() => { setFotos([]); setPrecio(''); setPrecioTachado(''); setFicha(null); setRes(null) }} />}

      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </main>
  )
}
```

- [ ] **Paso 3: Agregar el acceso en el dashboard**

En `app/dashboard/page.js`, dentro de `DashboardAdmin` (la rejilla que hoy tiene 4 accesos, alrededor de la línea 320), agregar una quinta entrada al arreglo. Queda dentro del bloque de ADMIN, así que ningún otro rol lo ve:

```jsx
        {[
          {href:'/dashboard/nuevo-pedido',icon:'➕',label:'Nueva Venta'},
          {href:'/dashboard/impresion',   icon:'🖨️',label:'Imprimir'},
          {href:'/dashboard/despacho',    icon:'🚚',label:'Despachos'},
          {href:'/dashboard/usuarios',    icon:'👥',label:'Usuarios'},
          {href:'/dashboard/producto-nuevo',icon:'🏷️',label:'Subir producto'},
        ].map(a=>(
```

La rejilla es `grid-cols-2 md:grid-cols-4`: con cinco, el quinto pasa a la fila de abajo sin tocar estilos.

- [ ] **Paso 4: Prueba de punta a punta**

Run: `npm run dev`, entrar como ADMIN.
1. Elegir MANDARINA, soltar 2 fotos reales, precio 35 → **Redactar con IA**
2. Revisar que el título, SEO, tags y alt text vengan llenos y en español
3. Buscar la categoría y elegirla
4. **Publicar**
5. Abrir el producto en Shopify y confirmar a mano: tantas variantes como tallas, **ninguna en $0.00**, categoría puesta, SEO lleno, las 2 fotos con su alt
6. **Despublicar** y confirmar que vuelve a borrador
7. Borrar el producto de prueba en Shopify

Run: `npm test` y `npm run build`
Expected: PASS y build limpio.

- [ ] **Paso 5: Commit**

```bash
git add components/producto-nuevo/ResultadoPublicacion.js app/dashboard/producto-nuevo/page.js app/dashboard/page.js
git commit -m "Pantalla para cargar un producto a Shopify desde el CRM"
```

---

## Después de terminar

- **Desplegar y verificar en producción.** ⚠️ Un push a `main` **no siempre dispara build** en Vercel: confirmar con `vercel ls --prod` que el despliegue nuevo está arriba antes de dar nada por hecho. Un panel que dice `Ready` puede ser el despliegue viejo.
- **INDSTORE** necesita `write_products` en su propia app de Shopify. Verificar el `scope` que devuelve su token antes de cargar ahí.
- Actualizar `docs/ESTADO-CRM.md` con el panel nuevo.
