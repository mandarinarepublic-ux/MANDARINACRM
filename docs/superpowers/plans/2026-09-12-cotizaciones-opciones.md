# Opciones en una cotización — Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Goal:** Que una cotización pueda ofrecer varios escenarios completos ("Opción A: $920 · Opción B: $1.380") y que el precio por unidad muestre cuánto cuesta de verdad con IVA.

**Architecture:** Las opciones son una capa nueva y **opcional**. Una función pura, `opcionesDe()`, normaliza al leer y devuelve siempre una lista de opciones; las cotizaciones que ya existen producen una sola opción implícita. De ahí en adelante ningún otro archivo pregunta si la cotización es vieja o nueva.

**Tech Stack:** Next.js App Router (JS, no TS), React, Supabase (`crm.cotizaciones`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-12-cotizaciones-opciones-design.md`

## Global Constraints

- Todo el texto, comentarios y mensajes de commit en **español ecuatoriano con tuteo**. NADA de voseo (`vos`, `podés`, `decime`).
- Tests: `npm test` = `node --test tests/*.test.js`. ⚠️ `node --test` **no entiende `@/`** — en los tests, imports relativos.
- ⚠️ En este repo **NO se usa `git add -A`**. Archivos por ruta explícita.
- Se trabaja en `main`. NO crear ramas.
- JavaScript puro, módulos ES. Nada de TypeScript.
- ⚠️ `tests/pivot-areas.test.js` **falla por una razón preexistente y ajena** (usa una fecha fija que ya pasó). Ignorarlo; todo lo demás en verde.
- **El IVA es fijo, 15%** (`IVA_RATE` en `lib/cotizacion.js`). No hay excepciones ni interruptor.
- **El descuento es uno solo de toda la cotización**, no por opción.
- Varían por opción: **productos, cantidades, precios y `entrega_dias`**. Compartidos: descuento, anticipo, condiciones de pago, validez, cliente, beneficios, notas.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/cotizacion.js` | **Modificar.** Las funciones puras nuevas. Es donde vive todo el cálculo y lo único que se puede probar sin navegador |
| `lib/db/cotizaciones.js` | **Modificar.** Agregar `'opciones'` a la lista blanca `COLS` |
| `docs/sql/2026-09-12-cotizaciones-opciones.sql` | **Nuevo.** La migración aditiva |
| `components/cotizaciones/useCotizacion.js` | **Modificar.** El estado pasa a trabajar por opción activa |
| `components/cotizaciones/OpcionesTabs.js` | **Nuevo.** Las pestañas |
| `components/cotizaciones/CotizacionForm.js` | **Modificar.** Montar las pestañas |
| `components/cotizaciones/CotizacionPreview.js` | **Modificar.** Un bloque por opción + el precio con IVA |
| `components/cotizaciones/ResumenPanel.js` | **Modificar.** Mostrar el rango |
| `app/dashboard/historial/page.js` | **Modificar.** El badge con el rango |

---

### Task 1: El precio por unidad con IVA

**Files:**
- Modify: `lib/cotizacion.js` (agregar junto a `calcSubtotalProducto`)
- Test: `tests/cotizacion-precio-unitario.test.js`

**Interfaces:**
- Consumes: `IVA_RATE` (ya existe)
- Produces: `precioUnitarioConIva(p, ivaRate = IVA_RATE) -> number`

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
// tests/cotizacion-precio-unitario.test.js
//
// El documento mostraba «10 uds × $19.99» y abajo sumaba 15% de IVA. El cliente
// pagaba $22.99 por unidad y ese numero no salia en ninguna parte: tenia que
// sacar la cuenta para saber cuanto le costaba cada prenda.
import test from 'node:test'
import assert from 'node:assert'
import { precioUnitarioConIva, calcSubtotalProducto, IVA_RATE } from '../lib/cotizacion.js'

test('suma el IVA al precio de lista', () => {
  assert.equal(precioUnitarioConIva({ precio: 12 }), 13.8)
  assert.equal(precioUnitarioConIva({ precio: '19.99' }).toFixed(2), '22.99')
})

test('☠️ lee el precio IGUAL que calcSubtotalProducto', () => {
  // Si las dos no coinciden, la misma linea del documento mostraria un precio
  // por unidad y un subtotal que se contradicen mientras se escribe el precio.
  for (const precio of ['', '  ', null, undefined, 'abc', '12.5x']) {
    const p = { precio, cantidad: 1 }
    const porSubtotal = calcSubtotalProducto(p)             // cantidad 1 → es el precio
    const porUnidad = precioUnitarioConIva(p) / (1 + IVA_RATE)
    assert.equal(porUnidad.toFixed(4), porSubtotal.toFixed(4),
      `discrepan con precio ${JSON.stringify(precio)}`)
  }
})

test('un producto vacio o nulo no revienta', () => {
  for (const p of [null, undefined, {}]) assert.equal(precioUnitarioConIva(p), 0)
})

test('acepta otra tasa de IVA sin tocar la constante', () => {
  assert.equal(precioUnitarioConIva({ precio: 100 }, 0), 100)
  assert.equal(precioUnitarioConIva({ precio: 100 }, 0.12), 112)
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `node --test tests/cotizacion-precio-unitario.test.js`
Expected: FAIL — `precioUnitarioConIva is not a function`

- [ ] **Paso 3: Implementar**

Agregar en `lib/cotizacion.js`, justo debajo de `calcSubtotalProducto`:

```js
/**
 * Precio de UNA unidad con IVA incluido.
 *
 * Lee el precio igual que `calcSubtotalProducto` (`parseFloat`, y 0 si no es un
 * numero): el campo del formulario es texto libre y puede venir vacio o a medio
 * escribir. Si las dos funciones no coincidieran, la misma linea del documento
 * mostraria un precio por unidad y un subtotal que se contradicen.
 */
export function precioUnitarioConIva(p, ivaRate = IVA_RATE) {
  return (parseFloat(String(p?.precio)) || 0) * (1 + ivaRate)
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (salvo el fallo ajeno de `pivot-areas`)

- [ ] **Paso 5: Commit**

```bash
git add lib/cotizacion.js tests/cotizacion-precio-unitario.test.js
git commit -m "Precio por unidad con IVA en las cotizaciones"
```

---

### Task 2: `nuevaOpcion` y `opcionesDe` — el normalizador

**Files:**
- Modify: `lib/cotizacion.js`
- Test: `tests/cotizacion-opciones.test.js`

**Interfaces:**
- Consumes: `shortId()`, `nuevoProducto()` (ya existen)
- Produces: `nuevaOpcion(nombre = '', entregaDias = 15) -> opcion` y `opcionesDe(cotizacion) -> opcion[]`.
  Una opción es `{ id, nombre, entrega_dias, productos }`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
// tests/cotizacion-opciones.test.js
//
// opcionesDe() es el UNICO sitio que conoce las dos formas de una cotizacion:
// la vieja (un `productos` en la raiz) y la nueva (`opciones`). Si esta funcion
// se equivoca, se equivoca el modulo entero.
import test from 'node:test'
import assert from 'node:assert'
import { nuevaOpcion, opcionesDe, nuevaCotizacion } from '../lib/cotizacion.js'

test('una cotizacion VIEJA produce una sola opcion implicita', () => {
  const c = { productos: [{ id: 'p1', precio: 10 }], entrega_dias: 20 }
  const ops = opcionesDe(c)
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].productos, c.productos)
  assert.equal(ops[0].entrega_dias, 20, 'hereda los dias de la raiz')
  assert.equal(ops[0].nombre, '', 'sin nombre: el documento no debe mostrar encabezado')
})

test('☠️ con `opciones`, la RAIZ se ignora por completo', () => {
  // Escribir en los dos sitios es como terminan diciendo cosas distintas.
  const c = {
    productos: [{ id: 'viejo', precio: 999 }],
    entrega_dias: 99,
    opciones: [{ id: 'a', nombre: 'A', entrega_dias: 10, productos: [{ id: 'p1', precio: 10 }] }],
  }
  const ops = opcionesDe(c)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].nombre, 'A')
  assert.equal(ops[0].entrega_dias, 10)
  assert.equal(ops[0].productos[0].id, 'p1', 'no se colo el producto de la raiz')
})

test('devuelve las varias opciones en su orden', () => {
  const c = { opciones: [
    { id: 'a', nombre: 'A', entrega_dias: 15, productos: [] },
    { id: 'b', nombre: 'B', entrega_dias: 20, productos: [] },
  ] }
  assert.deepEqual(opcionesDe(c).map((o) => o.nombre), ['A', 'B'])
})

test('nunca devuelve una lista vacia', () => {
  // Toda pantalla asume que hay al menos una opcion que pintar.
  for (const c of [null, undefined, {}, { opciones: [] }, { opciones: null }, { productos: [] }]) {
    const ops = opcionesDe(c)
    assert.ok(Array.isArray(ops) && ops.length === 1, `fallo con ${JSON.stringify(c)}`)
    assert.ok(Array.isArray(ops[0].productos))
  }
})

test('☠️ el id de la opcion implicita es SIEMPRE el mismo', () => {
  // Es la `key` de React y el id de la pestaña: si cambiara en cada lectura,
  // React remontaria el formulario y se perderia lo que se esta escribiendo.
  const c = { productos: [{ id: 'p1' }] }
  assert.equal(opcionesDe(c)[0].id, opcionesDe(c)[0].id)
  assert.equal(opcionesDe(c)[0].id, 'op_unica')
})

test('una opcion nueva trae un producto vacio y su propio id', () => {
  const a = nuevaOpcion('Básica', 15)
  const b = nuevaOpcion('Premium', 20)
  assert.equal(a.nombre, 'Básica')
  assert.equal(a.entrega_dias, 15)
  assert.equal(a.productos.length, 1, 'arranca con un producto para poder escribir de una')
  assert.notEqual(a.id, b.id, 'dos opciones nunca comparten id')
})

test('una cotizacion nueva NO trae `opciones`: la forma vieja sigue siendo el default', () => {
  assert.equal(nuevaCotizacion().opciones, undefined)
  assert.equal(opcionesDe(nuevaCotizacion()).length, 1)
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `node --test tests/cotizacion-opciones.test.js`
Expected: FAIL — `nuevaOpcion is not a function`

- [ ] **Paso 3: Implementar**

Agregar en `lib/cotizacion.js`, después de `nuevaCotizacion`:

```js
/** Id fijo de la opcion implicita de una cotizacion sin `opciones`. */
export const ID_OPCION_UNICA = 'op_unica'

/** Una opcion vacia, lista para escribir. */
export function nuevaOpcion(nombre = '', entregaDias = 15) {
  return {
    id: shortId(),
    nombre,
    entrega_dias: Number(entregaDias) || 15,
    productos: [nuevoProducto()],
  }
}

/**
 * Las opciones de una cotizacion, SIEMPRE como lista y nunca vacia.
 *
 * Es el unico sitio del codigo que conoce las dos formas posibles:
 *   · la vieja — un `productos` en la raiz (todas las cotizaciones existentes);
 *   · la nueva — un arreglo `opciones`.
 *
 * ☠️ Cuando hay `opciones`, la RAIZ SE IGNORA por completo y no se mantiene
 * sincronizada. Parece imprudente y es a proposito: escribiendo en los dos
 * sitios, tarde o temprano dicen cosas distintas y nadie sabe cual manda.
 *
 * El id de la opcion implicita es FIJO porque es la `key` de React y el id de la
 * pestaña: si cambiara en cada lectura, React remontaria el formulario y se
 * perderia lo que se esta escribiendo.
 */
export function opcionesDe(c) {
  const ops = Array.isArray(c?.opciones) ? c.opciones.filter(Boolean) : []
  if (ops.length) return ops
  return [{
    id: ID_OPCION_UNICA,
    nombre: '',
    entrega_dias: Number(c?.entrega_dias) || 15,
    productos: Array.isArray(c?.productos) ? c.productos : [],
  }]
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (salvo `pivot-areas`)

- [ ] **Paso 5: Commit**

```bash
git add lib/cotizacion.js tests/cotizacion-opciones.test.js
git commit -m "opcionesDe(): el unico sitio que conoce las dos formas de una cotizacion"
```

---

### Task 3: `rangoTotales` — el rango y los tres valores que se guardan

**Files:**
- Modify: `lib/cotizacion.js`
- Test: `tests/cotizacion-rango.test.js`

**Interfaces:**
- Consumes: `opcionesDe()` (Task 2), `calcTotales()` (ya existe)
- Produces: `rangoTotales(cotizacion) -> { porOpcion, min, max, varias, guardar }`.
  `porOpcion` = `[{ opcion, totales }]`. `min`/`max` son objetos de `calcTotales`.
  `guardar` = `{ subtotal, iva_monto, total }` redondeados a 2 decimales.

- [ ] **Paso 1: Escribir las pruebas que fallan**

```js
// tests/cotizacion-rango.test.js
import test from 'node:test'
import assert from 'node:assert'
import { rangoTotales } from '../lib/cotizacion.js'

const prod = (precio, cantidad = 1) => ({ id: String(Math.random()), precio, cantidad })
const conOpciones = (...listas) => ({
  descuento: 0,
  opciones: listas.map((ps, i) => ({ id: `o${i}`, nombre: `O${i}`, entrega_dias: 15, productos: ps })),
})

test('una sola opcion: min y max son el mismo y `varias` es false', () => {
  const r = rangoTotales({ productos: [prod(100)], descuento: 0 })
  assert.equal(r.varias, false)
  assert.equal(r.min.total, r.max.total)
  assert.equal(r.min.total.toFixed(2), '115.00')
})

test('varias opciones: el rango va de la mas barata a la mas cara', () => {
  const r = rangoTotales(conOpciones([prod(1200)], [prod(800)], [prod(1000)]))
  assert.equal(r.varias, true)
  assert.equal(r.min.total.toFixed(2), '920.00')   // 800 + 15%
  assert.equal(r.max.total.toFixed(2), '1380.00')  // 1200 + 15%
  assert.equal(r.porOpcion.length, 3, 'devuelve el total de CADA opcion, en su orden')
  assert.equal(r.porOpcion[0].totales.total.toFixed(2), '1380.00', 'porOpcion respeta el orden original')
})

test('☠️ los tres valores que se guardan salen de la MISMA opcion', () => {
  // Tomando el minimo de cada uno por separado saldria el subtotal de una
  // opcion con el IVA de otra: tres numeros que no cuadran entre si.
  const r = rangoTotales(conOpciones([prod(800)], [prod(1200)]))
  const g = r.guardar
  assert.equal(g.subtotal.toFixed(2), '800.00')
  assert.equal(g.iva_monto.toFixed(2), '120.00')
  assert.equal(g.total.toFixed(2), '920.00')
  assert.equal((g.subtotal + g.iva_monto).toFixed(2), g.total.toFixed(2), 'los tres cuadran entre si')
})

test('el descuento es de toda la cotizacion y se aplica a cada opcion', () => {
  const c = conOpciones([prod(800)], [prod(1200)])
  c.descuento = 100
  const r = rangoTotales(c)
  assert.equal(r.min.total.toFixed(2), '805.00')   // (800-100) × 1.15
  assert.equal(r.max.total.toFixed(2), '1265.00')  // (1200-100) × 1.15
})

test('no revienta con una cotizacion vacia o nula', () => {
  for (const c of [null, undefined, {}, { opciones: [] }]) {
    const r = rangoTotales(c)
    assert.equal(r.min.total, 0)
    assert.equal(r.varias, false)
  }
})

test('una opcion sin productos cuenta como cero, no rompe el rango', () => {
  const r = rangoTotales(conOpciones([], [prod(800)]))
  assert.equal(r.min.total, 0)
  assert.equal(r.max.total.toFixed(2), '920.00')
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `node --test tests/cotizacion-rango.test.js`
Expected: FAIL — `rangoTotales is not a function`

- [ ] **Paso 3: Implementar**

Agregar en `lib/cotizacion.js`, después de `calcTotales`:

```js
/**
 * Los totales de CADA opcion, mas el rango de la cotizacion.
 *
 * El descuento es uno solo de toda la cotizacion, asi que se aplica igual a cada
 * opcion: son $50 sobre la que el cliente escoja, sea cual sea.
 *
 * ☠️ `guardar` sale de UNA sola opcion (la mas barata), como conjunto. Tomar el
 * minimo de subtotal, iva y total por separado daria el subtotal de una opcion
 * con el IVA de otra: tres numeros que no cuadran y que nadie sabria explicar.
 */
export function rangoTotales(c) {
  const porOpcion = opcionesDe(c).map((opcion) => ({
    opcion,
    totales: calcTotales(opcion.productos, c?.descuento),
  }))
  const ordenadas = [...porOpcion].sort((a, b) => a.totales.total - b.totales.total)
  const min = ordenadas[0].totales
  const max = ordenadas[ordenadas.length - 1].totales
  return {
    porOpcion,
    min,
    max,
    varias: porOpcion.length > 1,
    guardar: {
      subtotal: +min.subtotal.toFixed(2),
      iva_monto: +min.iva.toFixed(2),
      total: +min.total.toFixed(2),
    },
  }
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (salvo `pivot-areas`)

- [ ] **Paso 5: Commit**

```bash
git add lib/cotizacion.js tests/cotizacion-rango.test.js
git commit -m "rangoTotales(): el rango de la cotizacion y que triple se guarda"
```

---

### Task 4: La columna nueva y la lista blanca que la deja pasar

**Files:**
- Create: `docs/sql/2026-09-12-cotizaciones-opciones.sql`
- Modify: `lib/db/cotizaciones.js` (el arreglo `COLS`)
- Test: `tests/cotizacion-guardado.test.js`

**Interfaces:**
- Produces: la columna `crm.cotizaciones.opciones` (jsonb) y `'opciones'` dentro de `COLS`

☠️ **Por qué esta tarea existe sola:** `lib/db/cotizaciones.js` filtra lo que se guarda con una lista blanca. Sin agregar `'opciones'`, el campo **se descarta en silencio**: la pantalla mostraría las opciones, el guardado diría que salió bien, y al recargar no habría nada. Es un fallo que no da ningún error.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// tests/cotizacion-guardado.test.js
//
// ☠️ lib/db/cotizaciones.js filtra lo que se escribe con una lista blanca de
// columnas. Un campo que no este ahi se descarta SIN ERROR: la pantalla lo
// muestra, el guardado responde ok, y al recargar no esta.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('../lib/db/cotizaciones.js', import.meta.url), 'utf8')
const cols = fuente.slice(fuente.indexOf('const COLS'), fuente.indexOf(']', fuente.indexOf('const COLS')))

test('☠️ `opciones` esta en la lista blanca de columnas', () => {
  assert.ok(/'opciones'/.test(cols), 'sin esto las opciones se pierden al guardar, en silencio')
})

test('las columnas que ya estaban siguen ahi', () => {
  for (const c of ['productos', 'descuento', 'subtotal', 'iva_monto', 'total', 'entrega_dias']) {
    assert.ok(new RegExp(`'${c}'`).test(cols), `se perdio la columna ${c}`)
  }
})

test('la migracion agrega la columna sin transformar datos', () => {
  const sql = readFileSync(new URL('../docs/sql/2026-09-12-cotizaciones-opciones.sql', import.meta.url), 'utf8')
  assert.ok(/add column if not exists\s+opciones/i.test(sql), 'falta el ADD COLUMN idempotente')
  assert.ok(!/\bupdate\b|\bdelete\b|\bdrop\b/i.test(sql), 'la migracion NO debe tocar ni una fila existente')
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `node --test tests/cotizacion-guardado.test.js`
Expected: FAIL — no está `'opciones'` y el archivo SQL no existe

- [ ] **Paso 3: Implementar**

Crear `docs/sql/2026-09-12-cotizaciones-opciones.sql`:

```sql
-- Opciones en una cotizacion.
--
-- Migracion ADITIVA: agrega una columna y NO toca ni una fila existente. Las
-- cotizaciones que ya existen quedan con `opciones` en NULL y las lee
-- opcionesDe() como una sola opcion implicita, igual que antes.
alter table crm.cotizaciones
  add column if not exists opciones jsonb;

comment on column crm.cotizaciones.opciones is
  'Escenarios completos, cada uno con sus productos y su entrega_dias. NULL o vacio = cotizacion de una sola opcion, que usa productos/entrega_dias de la raiz. Cuando tiene contenido, esas dos columnas de la raiz SE IGNORAN y no se mantienen sincronizadas: ver lib/cotizacion.js opcionesDe().';
```

En `lib/db/cotizaciones.js`, agregar `'opciones'` al arreglo `COLS`, junto a `'productos'`:

```js
  'productos', 'opciones',
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (salvo `pivot-areas`)

- [ ] **Paso 5: Aplicar la migración**

⚠️ **La migración hay que correrla contra Supabase.** El SQL es idempotente (`if not exists`), así que se puede correr dos veces sin daño. Déjalo anotado en tu informe: **el código no sirve hasta que la columna exista.**

- [ ] **Paso 6: Commit**

```bash
git add docs/sql/2026-09-12-cotizaciones-opciones.sql lib/db/cotizaciones.js tests/cotizacion-guardado.test.js
git commit -m "Columna opciones y su lista blanca: sin ella se perdian en silencio"
```

---

### Task 5: El mensaje de WhatsApp con el rango

**Files:**
- Modify: `lib/cotizacion.js` (`textoWhatsAppCotizacion`)
- Test: `tests/cotizacion-salida.test.js` (agregar al final)

**Interfaces:**
- Produces: `textoWhatsAppCotizacion(c, total, totalMax)` — el tercer parámetro es **opcional**; si viene y es mayor que `total`, el mensaje muestra un rango.

⚠️ **La firma tiene que seguir aceptando dos argumentos**: `tests/cotizacion-salida.test.js` ya la prueba así y el hook la llama así.

- [ ] **Paso 1: Agregar las pruebas que fallan**

```js
// al final de tests/cotizacion-salida.test.js
test('con varias opciones el mensaje manda un RANGO', () => {
  // Si el chat dijera un solo total y el PDF adjunto mostrara tres, el cliente
  // no sabria a cual hacerle caso.
  const t = textoWhatsAppCotizacion({ numero: 'MAN-COT-0042', validez_dias: 15 }, 920, 1380)
  assert.ok(t.includes('$920.00'), `falta el minimo: ${t}`)
  assert.ok(t.includes('$1380.00'), `falta el maximo: ${t}`)
})

test('con una sola opcion el mensaje NO cambia', () => {
  const dos = textoWhatsAppCotizacion({ numero: 'X', validez_dias: 15 }, 920)
  const tres = textoWhatsAppCotizacion({ numero: 'X', validez_dias: 15 }, 920, 920)
  assert.equal(dos, tres, 'un maximo igual al minimo no es un rango')
  assert.ok(dos.includes('Total: $920.00'))
})
```

- [ ] **Paso 2: Correr y verificar que fallan**

Run: `node --test tests/cotizacion-salida.test.js`
Expected: FAIL — el mensaje no incluye `$1380.00`

- [ ] **Paso 3: Implementar**

En `lib/cotizacion.js`, cambiar la línea del total de `textoWhatsAppCotizacion`:

```js
export function textoWhatsAppCotizacion(c, total, totalMax) {
  const nombre = String(c?.cliente_nombre ?? '').trim()
  const saludo = nombre ? `Hola ${nombre} 👋` : 'Hola 👋'
  const validez = Number(c?.validez_dias) || 0
  // Con varias opciones va un rango: si el chat dijera un solo total y el PDF
  // adjunto mostrara tres, el cliente no sabria a cual hacerle caso.
  const hayRango = Number(totalMax) > Number(total)
  const montoLinea = hayRango
    ? `💰 Desde ${fmtUSD(total)} hasta ${fmtUSD(totalMax)}`
    : `💰 Total: ${fmtUSD(total)}`
  const lineas = [saludo, '', `Te comparto la cotización *${c?.numero ?? ''}*.`, '', montoLinea]
  if (validez > 0) lineas.push(`📅 Válida por ${validez} días`)
  lineas.push('', 'Cualquier duda me escribes y la ajustamos.')
  return lineas.join('\n')
}
```

- [ ] **Paso 4: Correr y verificar que pasan**

Run: `npm test`
Expected: PASS (salvo `pivot-areas`)

- [ ] **Paso 5: Commit**

```bash
git add lib/cotizacion.js tests/cotizacion-salida.test.js
git commit -m "El mensaje de WhatsApp manda el rango cuando hay varias opciones"
```

---

### Task 6: El hook trabaja por opción activa

**Files:**
- Modify: `components/cotizaciones/useCotizacion.js`

**Interfaces:**
- Consumes: `opcionesDe()`, `nuevaOpcion()`, `rangoTotales()` (Tasks 2-3)
- Produces: el hook devuelve además `opciones`, `opcionActiva`, `setOpcionActiva`, `addOpcion`, `removeOpcion`, `updOpcion(id, campo, valor)`, y `rango`. `totales` sigue existiendo y pasa a ser los totales de la **opción activa**.

☠️ **El cambio delicado:** hoy `updProducto`, `updTalla`, `toggleTallas`, `addProducto`, `removeProducto` y `duplicateProducto` escriben en `cotizacion.productos`. Ahora tienen que escribir en los productos de la **opción activa**. Se hace con un ayudante único para no repetir la misma lógica seis veces.

- [ ] **Paso 1: Normalizar al cargar**

En el `useState` inicial, después del spread de `initial`, dejar `opciones` siempre presente:

```js
  const [cotizacion, setCotizacion] = useState(() => {
    const base = { ...nuevaCotizacion(), ...(initial || {}) }
    // Se normaliza UNA vez, al cargar. De aqui en adelante el estado SIEMPRE
    // tiene `opciones` y ninguna otra parte del hook pregunta por la forma vieja.
    return { ...base, opciones: opcionesDe(base) }
  })
  const [opcionActiva, setOpcionActiva] = useState(0)
```

- [ ] **Paso 2: El ayudante que escribe en la opción activa**

```js
  /**
   * Cambia los productos de la opcion activa.
   *
   * ☠️ Existe para que las seis operaciones de producto no repitan el mismo
   * recorrido: repetirlo es como una de ellas termina escribiendo en la opcion
   * equivocada sin que nadie lo note.
   */
  const setProductosActiva = useCallback((fn) => {
    setCotizacion((c) => {
      const opciones = c.opciones.map((o, i) =>
        i === opcionActiva ? { ...o, productos: fn(o.productos) } : o)
      return { ...c, opciones }
    })
  }, [opcionActiva])
```

- [ ] **Paso 3: Reescribir las seis operaciones con el ayudante**

```js
  const updProducto = useCallback((id, field, value) => {
    setProductosActiva((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }, [setProductosActiva])

  const updTalla = useCallback((id, talla, qty) => {
    setProductosActiva((ps) => ps.map((p) => {
      if (p.id !== id) return p
      const tallas = { ...p.tallas, [talla]: Math.max(0, Number(qty) || 0) }
      return { ...p, tallas, cantidad: sumaTallas(tallas) }
    }))
  }, [setProductosActiva])

  const toggleTallas = useCallback((id, on) => {
    setProductosActiva((ps) => ps.map((p) => {
      if (p.id !== id) return p
      if (on) return { ...p, conTallas: true, cantidad: sumaTallas(p.tallas) }
      return { ...p, conTallas: false }
    }))
  }, [setProductosActiva])

  const addProducto = useCallback(() => {
    setProductosActiva((ps) => [...ps, nuevoProducto()])
  }, [setProductosActiva])

  const removeProducto = useCallback((id) => {
    setProductosActiva((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps))
  }, [setProductosActiva])

  const duplicateProducto = useCallback((id) => {
    setProductosActiva((ps) => {
      const idx = ps.findIndex((p) => p.id === id)
      if (idx < 0) return ps
      const copia = { ...ps[idx], tallas: { ...ps[idx].tallas }, id: shortId() }
      const out = [...ps]
      out.splice(idx + 1, 0, copia)
      return out
    })
  }, [setProductosActiva])
```

- [ ] **Paso 4: Las operaciones de opción**

```js
  const addOpcion = useCallback(() => {
    setCotizacion((c) => {
      const letra = String.fromCharCode(65 + c.opciones.length)  // A, B, C…
      const opciones = [...c.opciones, nuevaOpcion(`Opción ${letra}`, c.entrega_dias)]
      // La primera vez que se agrega una segunda, la que ya estaba tambien
      // necesita nombre: si no, el documento pintaria «Opción B» junto a un
      // bloque sin titulo.
      if (opciones[0] && !opciones[0].nombre) opciones[0] = { ...opciones[0], nombre: 'Opción A' }
      setOpcionActiva(opciones.length - 1)
      return { ...c, opciones }
    })
  }, [])

  const removeOpcion = useCallback((id) => {
    setCotizacion((c) => {
      if (c.opciones.length <= 1) return c    // siempre queda al menos una
      const opciones = c.opciones.filter((o) => o.id !== id)
      setOpcionActiva((i) => Math.min(i, opciones.length - 1))
      return { ...c, opciones }
    })
  }, [])

  const updOpcion = useCallback((id, campo, valor) => {
    setCotizacion((c) => ({
      ...c,
      opciones: c.opciones.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)),
    }))
  }, [])
```

- [ ] **Paso 5: Totales y guardado**

```js
  const rango = rangoTotales(cotizacion)
  // `totales` sigue existiendo: es lo que mira el panel lateral mientras editas,
  // y ahi lo que importa es la opcion en la que estas parado.
  const totales = rango.porOpcion[opcionActiva]?.totales || rango.min
```

Y en `save`, reemplazar las tres líneas de totales por lo que devuelve `rango`:

```js
      const payload = {
        ...cotizacion,
        ...rango.guardar,
        created_by: cotizacion.created_by || user?.id || null,
        created_by_nombre: cotizacion.created_by_nombre || user?.nombre || null,
      }
```

⚠️ En la llamada de WhatsApp, pasar el rango:

```js
      const texto = textoWhatsAppCotizacion(cotizacion, rango.min.total, rango.max.total)
```

- [ ] **Paso 6: Bloquear el guardado de una opción vacía**

☠️ Sin esto, una opción sin productos llega al cliente mostrando **$0**. Al principio de `save`, antes de armar el payload:

```js
    // Una opcion sin productos con cantidad y precio saldria en el documento
    // como un bloque de $0. Mejor no dejar guardar que mandarle eso al cliente.
    const vacias = cotizacion.opciones
      .map((o, i) => ({ nombre: o.nombre || `Opción ${String.fromCharCode(65 + i)}`, o }))
      .filter(({ o }) => !o.productos.some((p) =>
        (Number(p.cantidad) || 0) > 0 && (parseFloat(String(p.precio)) || 0) > 0))
    if (cotizacion.opciones.length > 1 && vacias.length) {
      showToast(`Sin guardar: ${vacias.map((v) => v.nombre).join(', ')} no tiene productos con cantidad y precio.`)
      setSaving(false)
      return null
    }
```

⚠️ **Solo aplica cuando hay más de una opción.** Con una sola, la cotización a medio llenar se tiene que poder guardar como borrador, que es como se trabaja hoy.

- [ ] **Paso 7: Devolver lo nuevo**

Agregar al objeto que retorna el hook: `opciones: cotizacion.opciones`, `opcionActiva`, `setOpcionActiva`, `addOpcion`, `removeOpcion`, `updOpcion`, `rango`.

- [ ] **Paso 8: Verificar**

Run: `npm test` y `npm run build`
Expected: PASS y build limpio. ⚠️ **No levantes un servidor de desarrollo**: la comprobación visual se hace al final, con una persona.

- [ ] **Paso 9: Commit**

```bash
git add components/cotizaciones/useCotizacion.js
git commit -m "El estado de la cotizacion trabaja por opcion activa"
```

---

### Task 7: Las pestañas de opciones

**Files:**
- Create: `components/cotizaciones/OpcionesTabs.js`
- Modify: `components/cotizaciones/CotizacionForm.js`

**Interfaces:**
- Consumes: del hook — `opciones`, `opcionActiva`, `setOpcionActiva`, `addOpcion`, `removeOpcion`, `updOpcion`
- Produces: `<OpcionesTabs opciones activa onActiva onAdd onRemove onUpd />`

- [ ] **Paso 1: Crear el componente**

```jsx
'use client'

// Las pestañas de opciones de una cotizacion.
//
// ☠️ Con UNA sola opcion no se pinta NADA. La cotizacion de siempre —que es la
// mayoria— tiene que verse y usarse exactamente igual que antes; las pestañas
// aparecen recien cuando alguien pide la segunda.
export default function OpcionesTabs({ opciones, activa, onActiva, onAdd, onRemove, onUpd }) {
  const varias = opciones.length > 1
  const op = opciones[activa]

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        {varias && opciones.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onActiva(i)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              i === activa ? 'bg-mandarina-500 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {o.nombre || `Opción ${String.fromCharCode(65 + i)}`}
          </button>
        ))}
        <button type="button" onClick={onAdd} className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300">
          + Agregar opción
        </button>
      </div>

      {varias && op && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-400">
            Nombre
            <input
              value={op.nombre || ''}
              onChange={(e) => onUpd(op.id, 'nombre', e.target.value)}
              className="ml-2 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </label>
          <label className="text-sm text-gray-400">
            Entrega (días)
            <input
              type="number" min="0"
              value={op.entrega_dias ?? ''}
              onChange={(e) => onUpd(op.id, 'entrega_dias', Number(e.target.value) || 0)}
              className="ml-2 w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => onRemove(op.id)}
            className="text-sm text-red-400"
          >
            Quitar esta opción
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: Montarlo en el formulario**

En `components/cotizaciones/CotizacionForm.js`, importar `OpcionesTabs` y montarlo **justo encima de la lista de productos** (la sección `02`), pasándole lo que el hook ahora devuelve. Los `ProductoCard` siguen recibiendo exactamente lo mismo que hoy: el hook ya los alimenta con los productos de la opción activa.

- [ ] **Paso 3: Verificar**

Run: `npm run build`
Expected: compila limpio. ⚠️ No levantes un servidor de desarrollo.

- [ ] **Paso 4: Commit**

```bash
git add components/cotizaciones/OpcionesTabs.js components/cotizaciones/CotizacionForm.js
git commit -m "Pestañas de opciones: invisibles hasta que pides la segunda"
```

---

### Task 8: El documento — un bloque por opción y el precio con IVA

**Files:**
- Modify: `components/cotizaciones/CotizacionPreview.js`

**Interfaces:**
- Consumes: `rangoTotales()`, `precioUnitarioConIva()` (Tasks 1 y 3)

☠️ **Este es el archivo que ve el cliente.** Dos reglas:
1. **Con una sola opción el documento tiene que verse EXACTAMENTE como hoy** — sin encabezado de opción y sin nombre. Lo único nuevo es el precio con IVA.
2. **El precio con IVA va en la MISMA línea que ya existe**, no en una nueva. El documento se auto-ajusta a una hoja A4 (`encajeEnA4`); una línea más por producto puede empujar una cotización de una hoja a encogerse o partirse.

- [ ] **Paso 1: La línea del producto**

Reemplazar la línea que hoy muestra `{p.cantidad || 0} uds × {fmtUSD(...)}` por:

```jsx
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {p.cantidad || 0} uds × {fmtUSD(parseFloat(String(p.precio)) || 0)} + IVA
                    {'  ·  '}
                    <b style={{ color: '#111' }}>{fmtUSD(precioUnitarioConIva(p))} c/u con IVA</b>
                    {totales.desc > 0 && ' (antes del descuento)'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: th.accent }}>{fmtUSD(calcSubtotalProducto(p))}</span>
                </div>
```

- [ ] **Paso 2: Los bloques por opción**

Hoy el componente pinta **una** lista de productos y **un** bloque de totales. Los dos pasan a estar dentro de un recorrido sobre `rango.porOpcion`, con esta forma:

```jsx
        {rango.porOpcion.map(({ opcion, totales }) => (
          <div key={opcion.id}>
            {/* encabezado: solo si hay varias (ver abajo) */}
            {/* la lista de productos que YA EXISTE, recorriendo opcion.productos
                en vez de cot.productos, con la linea del Paso 1 */}
            {/* el bloque de totales que YA EXISTE, alimentado con este `totales` */}
          </div>
        ))}
```

⚠️ **Dentro del recorrido, `totales` es el de ESA opción**, no el de la cotización. De ahí sale también el `totales.desc` que usa la línea del Paso 1 para decidir si escribe «(antes del descuento)».

Por cada opción, si `rango.varias`, pintar un encabezado con el nombre y sus días de entrega:

```jsx
              {rango.varias && (
                <div style={{ marginTop: 18, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #111', paddingBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800 }}>
                    {opcion.nombre || 'Opción'}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>entrega {opcion.entrega_dias} días</span>
                </div>
              )}
```

- Los productos de esa opción, con la línea del Paso 1.
- El bloque de totales **de esa opción** (el mismo que ya existe, alimentado con `totales` de esa opción en vez de los de la cotización).

⚠️ El encabezado de la cotización (línea ~58) muestra hoy `totales.total`. Con varias opciones tiene que mostrar el rango: `{fmtUSD(rango.min.total)} – {fmtUSD(rango.max.total)}`.

- [ ] **Paso 3: Verificar**

Run: `npm run build`
Expected: compila limpio.

- [ ] **Paso 4: Commit**

```bash
git add components/cotizaciones/CotizacionPreview.js
git commit -m "El documento muestra un bloque por opcion y el precio con IVA"
```

---

### Task 9: El panel lateral y el Historial

**Files:**
- Modify: `components/cotizaciones/ResumenPanel.js`
- Modify: `app/dashboard/historial/page.js` (la línea del badge, ~395)

**Interfaces:**
- Consumes: `rangoTotales()` (Task 3)

- [ ] **Paso 1: El panel lateral**

`ResumenPanel.js` muestra hoy `totales.total`. Con varias opciones, mostrar debajo el rango de la cotización completa, para que quien cotiza vea lo que va a recibir el cliente:

```jsx
        {rango.varias && (
          <div className="text-xs text-gray-400 mt-1">
            Toda la cotización: {fmtUSD(rango.min.total)} – {fmtUSD(rango.max.total)}
          </div>
        )}
```

- [ ] **Paso 2: El badge del Historial**

En `app/dashboard/historial/page.js`, la línea que hoy pinta `${parseFloat(c.total||0).toFixed(2)}`. El rango **se calcula al leer**, desde el JSON que ya viene en la fila:

```jsx
{(() => {
  // El rango se calcula AQUI, no se guarda: tenerlo en dos sitios es como esos
  // dos numeros terminan diciendo cosas distintas. El JSON ya viene en la fila.
  const r = rangoTotales(c)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full text-gray-300 bg-gray-800">
      {r.varias
        ? `${fmtUSD(r.min.total)} – ${fmtUSD(r.max.total)}`
        : fmtUSD(parseFloat(c.total || 0))}
    </span>
  )
})()}
```

⚠️ Importar `rangoTotales` y `fmtUSD` desde `@/lib/cotizacion` en ese archivo.

⚠️ **Con una sola opción se sigue usando `c.total` de la columna, no el recalculado.** Es lo que se guardó al crear la cotización y es lo que el resto del CRM ya muestra; recalcularlo podría dar un número distinto si alguna vez cambia el IVA, y el Historial empezaría a contradecir al documento que el cliente ya recibió.

- [ ] **Paso 3: Verificar**

Run: `npm test` y `npm run build`
Expected: PASS (salvo `pivot-areas`) y build limpio.

- [ ] **Paso 4: Commit**

```bash
git add components/cotizaciones/ResumenPanel.js app/dashboard/historial/page.js
git commit -m "El rango de la cotizacion en el panel y en el Historial"
```

---

## Después de terminar

- ⚠️ **Correr la migración SQL contra Supabase.** Sin la columna, guardar una cotización con opciones las pierde en silencio.
- ⚠️ **Un push a `main` no siempre dispara build en Vercel**: confirmar con `vercel ls --prod` que el despliegue nuevo está arriba antes de dar nada por hecho.
- **Prueba de punta a punta, con una persona**: crear una cotización con dos opciones, verla en el documento, exportar el PDF (⚠️ va a ocupar más de una hoja), mandarla por WhatsApp y confirmar que el mensaje trae el rango. Después abrir una cotización **vieja** y comprobar que se ve exactamente como antes.
