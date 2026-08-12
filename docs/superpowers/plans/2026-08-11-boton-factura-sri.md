# Botón "Generar FACTURA SRI" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revivir el botón de emitir factura de la pantalla del pedido —hoy muerto porque lee una columna que nadie escribe— y hacer que aparezca únicamente cuando falta la factura, con un candado en el servidor que impida emitir una segunda al SRI.

**Architecture:** Toda la decisión de "¿se muestra el botón?" y "¿ya está facturado?" se saca a un módulo puro (`lib/facturas-visibilidad.js`) que se prueba con `node --test`. La pantalla y la ruta de emisión solo consumen ese módulo. La protección real vive en el servidor: `/api/factura/emitir` relee el pedido antes de hablar con Dátil.

**Tech Stack:** Next.js App Router (JS, no TypeScript), Supabase vía `lib/db/*`, pruebas con `node --test` (nativo, sin framework).

## Global Constraints

- **Se trabaja siempre en `main`.** Nada de ramas: Preview no sirve porque Supabase solo está en Production.
- **Nunca `git add -A` ni `git add .` en este repo.** Cada commit lista sus archivos explícitamente.
- **Español ecuatoriano con tuteo** en commits, comentarios y textos de la app. Nada de voseo (`vos`, `podés`, `decime`).
- **`node --test` no entiende el alias `@/`.** En archivos bajo `tests/` se importa con ruta relativa (`../lib/...`).
- Comando de pruebas: `npm test` (= `node --test tests/*.test.js`).
- **Emitir al SRI es irreversible.** Ningún paso de este plan emite una factura real. La prueba de emisión la hace Rodrigo a mano.
- Los comentarios explican **por qué**, no qué. Este repo documenta las trampas en el código.

---

### Task 1: Módulo puro de visibilidad de la factura

**Files:**
- Create: `lib/facturas-visibilidad.js`
- Test: `tests/facturas-visibilidad.test.js`

**Interfaces:**
- Consumes: nada. Recibe el pedido en el shape MAYÚSCULAS que devuelve `getPedidoById` (`lib/db/pedidos.js:320`), o sea con `FACTURA_ID`, `FACTURA_PDF_URL`, `FACTURA_SOLICITADA`.
- Produces:
  - `yaFacturado(pedido) -> boolean`
  - `pidioFactura(pedido) -> boolean`
  - `botonFactura(pedido, rol) -> 'PENDIENTE' | 'OPCIONAL' | null`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/facturas-visibilidad.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert'
import { yaFacturado, pidioFactura, botonFactura } from '../lib/facturas-visibilidad.js'

// El botón de emitir factura llevaba meses escrito en la pantalla del pedido y
// NO SE DIBUJÓ NI UNA VEZ: preguntaba por `pedido.EMITIR_FACTURA` y la API
// devuelve `FACTURA_SOLICITADA`. `undefined === 'TRUE'` es falso siempre.
//
// Misma familia que el bug de las fotos entrantes y el de los audios: la
// pantalla mirando un campo que nadie llena. Por eso la decisión vive acá,
// donde se puede probar, y no suelta en el JSX.

function pedido(over = {}) {
  return {
    PEDIDO_ID: 'MAN-AND-9000',
    FACTURA_SOLICITADA: 'TRUE',
    FACTURA_ID: '',
    FACTURA_PDF_URL: '',
    ...over,
  }
}

test('sin FACTURA_ID no está facturado', () => {
  assert.equal(yaFacturado(pedido()), false)
})

test('con FACTURA_ID está facturado', () => {
  assert.equal(yaFacturado(pedido({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })), true)
})

test('con solo FACTURA_PDF_URL también está facturado', () => {
  // Los pedidos viejos de Make guardaron la URL sin el id de Dátil. Si no se
  // miraran las dos, el botón reaparecería en pedidos YA facturados y apretarlo
  // emitiría una SEGUNDA factura al SRI.
  assert.equal(yaFacturado(pedido({ FACTURA_PDF_URL: 'https://link.datil.co/invoices/x/ride' })), true)
})

test('sin pedido no hay botón', () => {
  // Un pedido que todavía no cargó no puede ofrecer emitir al SRI. Ante la
  // duda, el que NO se puede deshacer no se ofrece.
  assert.equal(yaFacturado(null), false)
  assert.equal(pidioFactura(null), false)
  assert.equal(botonFactura(null, 'ADMIN'), null)
  assert.equal(botonFactura(undefined, 'ADMIN'), null)
})

test('pidioFactura acepta TRUE, true y minúsculas', () => {
  // boolStr (lib/db/_backend.js:74) devuelve 'TRUE'/'FALSE' hoy. Se tolera el
  // booleano real y la minúscula para que el día que cambie el backend la
  // pantalla no se apague EN SILENCIO otra vez, que es justo lo que pasó.
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'TRUE' })), true)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'true' })), true)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: true })), true)
})

test('pidioFactura es falso con FALSE, vacío o ausente', () => {
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: 'FALSE' })), false)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: '' })), false)
  assert.equal(pidioFactura(pedido({ FACTURA_SOLICITADA: undefined })), false)
})

test('pidió factura y no la tiene -> botón PENDIENTE', () => {
  assert.equal(botonFactura(pedido(), 'ADMIN'), 'PENDIENTE')
})

test('no pidió factura y no la tiene -> botón OPCIONAL', () => {
  // No falta nada: facturar o no es una decisión del negocio. Se ofrece, pero
  // apagado, para no pintar como pendiente algo que nadie pidió.
  assert.equal(botonFactura(pedido({ FACTURA_SOLICITADA: 'FALSE' }), 'ADMIN'), 'OPCIONAL')
})

test('ya facturado -> NO hay botón, haya pedido factura o no', () => {
  // Esta es la regla que evita la factura duplicada al SRI.
  const conId = pedido({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })
  assert.equal(botonFactura(conId, 'ADMIN'), null)
  assert.equal(botonFactura({ ...conId, FACTURA_SOLICITADA: 'FALSE' }, 'ADMIN'), null)
})

test('solo ADMIN ve el botón', () => {
  // Emitir al SRI no se deshace.
  assert.equal(botonFactura(pedido(), 'VENDEDOR'), null)
  assert.equal(botonFactura(pedido(), 'PRODUCCION'), null)
  assert.equal(botonFactura(pedido(), undefined), null)
})
```

- [ ] **Step 2: Correr la prueba y verificar que FALLA**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/facturas-visibilidad.js'`

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/facturas-visibilidad.js`:

```js
// lib/facturas-visibilidad.js
// ¿Se muestra el botón de emitir factura, y de qué color?
//
// Esto vivía suelto en el JSX de la pantalla del pedido y preguntaba por
// `pedido.EMITIR_FACTURA`, un campo que NADIE escribe: la API devuelve
// `FACTURA_SOLICITADA`. Resultado: `undefined === 'TRUE'` es falso siempre y el
// botón no se dibujó ni una vez desde que existe. Acá se puede probar.

/** ¿El pedido YA tiene factura? Mirar las DOS columnas. */
export function yaFacturado(pedido) {
  return Boolean(pedido?.FACTURA_ID || pedido?.FACTURA_PDF_URL)
}

/**
 * ¿Se pidió factura al crear el pedido?
 *
 * Se compara en mayúsculas y pasando por String a propósito: hoy `boolStr`
 * devuelve 'TRUE'/'FALSE', pero si mañana llega un booleano real o un 'true'
 * en minúscula, una comparación cruda apagaría la pantalla sin avisar.
 */
export function pidioFactura(pedido) {
  return String(pedido?.FACTURA_SOLICITADA ?? '').toUpperCase() === 'TRUE'
}

/**
 * Qué botón corresponde:
 *   'PENDIENTE' → pidió factura y falta. Amarillo, visible: algo falta.
 *   'OPCIONAL'  → no pidió factura y no la tiene. Gris: es una decisión nueva.
 *   null        → ya está facturado, o el usuario no es ADMIN.
 *
 * Que devuelva null cuando ya hay factura es lo que impide emitir una SEGUNDA
 * al SRI desde la pantalla. El candado de verdad igual está en el servidor
 * (app/api/factura/emitir/route.js): esconder un botón no protege de un doble
 * toque ni de una pestaña vieja.
 */
export function botonFactura(pedido, rol) {
  if (!pedido) return null
  if (rol !== 'ADMIN') return null
  if (yaFacturado(pedido)) return null
  return pidioFactura(pedido) ? 'PENDIENTE' : 'OPCIONAL'
}
```

- [ ] **Step 4: Correr las pruebas y verificar que PASAN**

Run: `npm test`
Expected: PASS — las 10 pruebas nuevas de `facturas-visibilidad`, y las de los otros archivos sin romperse.

- [ ] **Step 5: Commit**

```bash
git add lib/facturas-visibilidad.js tests/facturas-visibilidad.test.js
git commit -m "feat(factura): sacar a un modulo probable la decision de mostrar el boton

El boton de emitir factura preguntaba por pedido.EMITIR_FACTURA, un campo
que nadie escribe (la API devuelve FACTURA_SOLICITADA). undefined === 'TRUE'
es falso siempre: el boton no se dibujo ni una vez desde que existe.

Suelto en el JSX eso no se podia probar. Aca si, y de paso queda escrita la
regla que evita la factura duplicada: si ya hay FACTURA_ID, no hay boton."
```

---

### Task 2: Candado anti-duplicado en el servidor

**Files:**
- Modify: `app/api/factura/emitir/route.js`

**Interfaces:**
- Consumes: `yaFacturado(pedido)` de `lib/facturas-visibilidad.js` (Task 1). `getPedidoById(id)` de `lib/db/pedidos.js:320`, que devuelve el pedido en shape MAYÚSCULAS o `null`.
- Produces: la ruta pasa a poder contestar `{ ok: true, yaFacturado: true, datilId, rideUrl }` sin emitir nada, y `404 { ok: false, error }` si el pedido no existe.

**Por qué:** esconder el botón no alcanza. Un doble toque, una pestaña abierta desde ayer, o dos personas a la vez emiten dos facturas al SRI. Una factura duplicada es un problema tributario real, no un bug de pantalla.

- [ ] **Step 1: Agregar los imports**

En `app/api/factura/emitir/route.js`, después de la línea 3 (`import { registrarEvento } from '@/lib/eventos'`), agregar:

```js
import { getPedidoById } from '@/lib/db/pedidos'
import { yaFacturado } from '@/lib/facturas-visibilidad'
```

- [ ] **Step 2: Insertar la relectura antes de emitir**

En la misma ruta, entre el bloque `if (!datilDirectoActivo()) {...}` (termina en la línea 31) y la llamada a `emitirFacturaDatil` (línea 35), insertar:

```js
    // Releer el pedido ANTES de emitir. El botón de la pantalla ya se esconde
    // cuando hay factura, pero esconder un botón no protege de un doble toque,
    // de una pestaña vieja, ni de dos personas a la vez. Y una factura
    // duplicada ante el SRI no se deshace apretando "deshacer".
    const actual = await getPedidoById(pedidoId)
    if (!actual) {
      return Response.json({ ok: false, error: `El pedido ${pedidoId} no existe` }, { status: 404 })
    }
    if (yaFacturado(actual)) {
      // No es un error: es que alguien llegó primero. Se contesta con el id que
      // YA existe para que la pantalla recargue y muestre el RIDE real.
      const datilId = actual.FACTURA_ID || ''
      return Response.json({
        ok: true,
        yaFacturado: true,
        datilId,
        rideUrl: datilId ? `https://link.datil.co/invoices/${datilId}/ride` : actual.FACTURA_PDF_URL,
      })
    }
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `npm run build`
Expected: build exitoso. Si falla por el import de `@/lib/db/pedidos` dentro de una ruta, revisar que `jsconfig.json` tenga el alias `@/*` (ya lo usan las demás rutas, p. ej. `app/api/pedidos/[id]/route.js:7`).

- [ ] **Step 4: Correr las pruebas**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add app/api/factura/emitir/route.js
git commit -m "fix(factura): el servidor relee el pedido antes de emitir

Esconder el boton no protege de un doble toque, de una pestana abierta
desde ayer ni de dos personas a la vez. El candado tiene que estar donde
se habla con Datil.

Si el pedido ya tiene factura contesta ok con el id que YA existe, sin
emitir: no es un error, es que alguien llego primero. Y un pedido que no
existe ahora da 404 en vez de intentar facturar el aire."
```

---

### Task 3: La pantalla del pedido

**Files:**
- Modify: `app/dashboard/pedido/[id]/page.js` (líneas 169-218, 446-452, 796-808)

**Interfaces:**
- Consumes: `botonFactura(pedido, rol)` de `lib/facturas-visibilidad.js` (Task 1). La respuesta `{ ok, yaFacturado?, datilId, numero? }` de `/api/factura/emitir` (Task 2). `loadPedido()`, que ya existe en este componente (se pasa a `ItemDetalle` en la línea 405).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Agregar el import**

En `app/dashboard/pedido/[id]/page.js`, junto a los demás imports de `@/lib`, agregar:

```js
import { botonFactura } from '@/lib/facturas-visibilidad'
```

- [ ] **Step 2: Poner la confirmación y la recarga en `emitirFactura()`**

En la función `emitirFactura()` (línea 169), después de las tres validaciones que ya existen (`cliente`, `EMAIL`, `CEDULA`, líneas 170-172) y ANTES de `setEnviandoFactura(true)` (línea 174), insertar:

```js
    // Emitir al SRI NO se deshace. Se confirma con los datos reales, mismo
    // patrón que al crear el pedido (nuevo-pedido/page.js:479).
    const total = parseFloat(pedido.MONTO_TOTAL || 0)
    const ok = window.confirm(
      '🧾 Se emitirá FACTURA ELECTRÓNICA al SRI\n\n' +
      `Pedido: ${pedido.PEDIDO_ID}\n` +
      `Cliente: ${cliente.NOMBRE || '(sin nombre)'}\n` +
      `${String(cliente.CEDULA).trim().length === 13 ? 'RUC' : 'Cédula'}: ${cliente.CEDULA}\n` +
      `Total: $${total.toFixed(2)}\n\n` +
      'Esto NO se puede deshacer.'
    )
    if (!ok) return
```

En la línea 176 hay ya un `const total = parseFloat(pedido.MONTO_TOTAL || 0)` dentro del `try`. **Borrar esa línea.**

Ojo con esto: NO es un error de compilación. El `try` es un ámbito propio, así que el `const` de adentro **sombrea** al de afuera sin quejarse. Hoy los dos valen lo mismo y no pasa nada; el día que alguien cambie uno de los dos, el diálogo de confirmación mostraría un total y a Dátil le llegaría otro. Se borra justamente porque el problema sería mudo.

- [ ] **Step 3: Recargar el pedido tras el éxito**

En la misma función, reemplazar la línea 206:

```js
      setFacturaEnviada(true)
```

por:

```js
      setFacturaEnviada(true)
      // Recargar para que se vea el RIDE de verdad, no un cartel que dice que
      // salió. Un "✅ emitida" sin la prueba al lado es exactamente lo que dejó
      // pasar 13 días de facturación muerta.
      await loadPedido()
```

- [ ] **Step 4: Borrar el aviso "en proceso"**

Borrar completo el bloque de las líneas 446-452:

```js
          {/* Factura pendiente — si emitir_factura=TRUE pero aún no llega el callback */}
          {pedido.EMITIR_FACTURA === 'TRUE' && !pedido.FACTURA_PDF_URL && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-xl">⏳</span>
              <div className="text-gray-400 text-sm">Factura en proceso… (llega en 5–30 seg)</div>
            </div>
          )}
```

Era cierto cuando emitía Make y el callback tardaba. Hoy la factura sale en ~4 segundos o no sale sola nunca, así que ese cartel diría "espera" para siempre. Además nunca se dibujó, por el mismo campo muerto.

- [ ] **Step 5: Reemplazar el bloque del botón**

Reemplazar las líneas 796-808 completas:

```js
        {/* Fila 2: factura (solo si aplica) */}
        {(user?.rol==='ADMIN'||user?.rol==='VENDEDOR') && pedido.EMITIR_FACTURA === 'TRUE' && (
          <div className="flex gap-2">
            {!facturaEnviada ? (
              <button onClick={emitirFactura} disabled={enviandoFactura}
                className="w-full py-2 rounded-xl text-sm font-medium border border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                {enviandoFactura ? '⏳ Enviando factura...' : '🧾 Emitir factura'}
              </button>
            ) : (
              <div className="w-full text-center text-sm text-green-400 font-medium py-2">✅ Factura emitida</div>
            )}
          </div>
        )}
```

por:

```js
        {/* Fila 2: factura. Solo aparece si FALTA la factura — si ya existe, el
            botón no se dibuja y arriba se ve la tarjeta azul con el RIDE.
            La regla vive en lib/facturas-visibilidad.js, donde se puede probar. */}
        {botonFactura(pedido, user?.rol) && (
          <div className="flex gap-2">
            <button onClick={emitirFactura} disabled={enviandoFactura}
              className={botonFactura(pedido, user?.rol) === 'PENDIENTE'
                ? 'w-full py-2 rounded-xl text-sm font-medium border border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                : 'w-full py-2 rounded-xl text-sm font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all'}>
              {enviandoFactura ? '⏳ Emitiendo...' : '🧾 Generar FACTURA SRI'}
            </button>
          </div>
        )}
```

El estado `facturaEnviada` deja de gobernar este bloque: quien manda ahora es el pedido recargado. Se conserva la variable porque sigue pintando el mensaje verde de la línea 411 mientras la recarga termina.

- [ ] **Step 6: Verificar que compila y que las pruebas siguen pasando**

Run: `npm run build && npm test`
Expected: build exitoso y todas las pruebas en PASS.

Revisar a mano que ya no quede ninguna mención a `EMITIR_FACTURA`:

Run: `grep -rn "EMITIR_FACTURA" app/ lib/`
Expected: sin resultados.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/pedido/[id]/page.js
git commit -m "feat(factura): boton GENERAR FACTURA SRI que solo sale si falta la factura

El boton ya existia y nunca se dibujo: preguntaba por EMITIR_FACTURA, que
nadie escribe. Ahora usa botonFactura() y distingue tres casos donde antes
habia uno: ya facturado (sin boton, se ve el RIDE), pidio factura y falta
(amarillo), no pidio y no tiene (gris, porque no falta nada).

Antes de emitir pide confirmacion con los datos reales, que al SRI no se le
manda una factura sin querer. Y al salir bien recarga el pedido: se ve el
RIDE de verdad y no un cartel que dice que salio, que es justo lo que dejo
pasar 13 dias de facturacion muerta.

Se va el aviso 'Factura en proceso... (llega en 5-30 seg)': era cierto con
Make, hoy sale en 4 segundos o no sale sola nunca."
```

---

### Task 4: Verificar contra producción sin emitir nada

**Files:** ninguno. Es una tarea de verificación.

**Interfaces:**
- Consumes: el despliegue de producción tras las tareas 1-3.

**Por qué:** el código en `main` puede no ser el que sirve el dominio, y un `ok` no vale si nunca se probó qué devuelve cuando debe fallar.

- [ ] **Step 1: Confirmar que lo desplegado es esto**

Run: `vercel ls --prod`
Expected: el despliegue más reciente de `mandarina-pro-sales` apunta al commit de la Task 3. Un push a `main` **no siempre dispara build**; si el commit no aparece, forzar el redespliegue antes de seguir.

- [ ] **Step 2: Control del candado — un pedido YA facturado**

`MAN-AND-5602` ya tiene factura (`51b3f2a1bae045bfbdae9b52ed40982e`). La ruta exige sesión o `CRM_API_TOKEN`, así que este paso lo corre Rodrigo desde una pestaña con sesión de ADMIN, en la consola del navegador:

```js
await (await fetch('/api/factura/emitir', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pedidoId: 'MAN-AND-5602', montoTotal: 35, cliente: {} }),
})).json()
```

Expected: `{ ok: true, yaFacturado: true, datilId: '51b3f2a1bae045bfbdae9b52ed40982e', ... }`

**Y la prueba de que no emitió nada:** el secuencial de Dátil no se movió. Verificar en `crm.eventos_sistema` que el último evento `datil` sigue siendo el mismo número de antes de correr esto:

```sql
select mensaje, fecha from crm.eventos_sistema
where fuente = 'datil' order by fecha desc limit 1;
```

Si apareció un secuencial nuevo, el candado no sirvió: **parar y revisar antes de seguir.**

- [ ] **Step 3: Control negativo — un pedido que no existe**

Mismo método, con un id inventado:

```js
await (await fetch('/api/factura/emitir', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pedidoId: 'NO-EXISTE-9999', montoTotal: 35, cliente: {} }),
})).json()
```

Expected: `404` con `{ ok: false, error: 'El pedido NO-EXISTE-9999 no existe' }`.

Si contesta `ok: true`, la señal de éxito de esta ruta no vale nada y hay que arreglarlo antes de confiar en el paso anterior.

- [ ] **Step 4: Ver el botón en la puerta real**

Rodrigo abre en el CRM, con su cuenta ADMIN:

| Pedido | Qué debe verse |
|---|---|
| `MAN-AND-5601` | Botón **amarillo** `🧾 Generar FACTURA SRI` |
| `MAN-AND-5602` | **Sin botón.** Tarjeta azul con el Dátil ID y `📄 Ver RIDE` |
| Cualquiera sin factura solicitada y sin factura | Botón **gris** |

- [ ] **Step 5: La emisión real — la hace Rodrigo**

Apretar el botón en `MAN-AND-5601`, confirmar el diálogo, y comprobar que:
1. el botón desaparece solo,
2. sale la tarjeta azul con el Dátil ID,
3. `📄 Ver RIDE` abre el PDF de verdad,
4. en `crm.eventos_sistema` queda un evento `datil` nivel `ok` con el secuencial nuevo.

**Este paso NO lo ejecuta el agente:** emite una factura real al SRI y no se deshace.

- [ ] **Step 6: Dejar constancia**

Actualizar la memoria `datil-facturacion-crm.md` con el resultado: si el botón quedó vivo, si el candado aguantó, y si `MAN-AND-5601` se emitió o quedó pendiente.

---

### Task 5: Pruebas del candado

**Files:**
- Modify: `lib/facturas-visibilidad.js`
- Modify: `app/api/factura/emitir/route.js`
- Modify: `tests/facturas-visibilidad.test.js`

**Interfaces:**
- Consumes: `yaFacturado(pedido)` del mismo módulo.
- Produces: `decidirEmision(pedido) -> { accion: 'NO_EXISTE' | 'YA_FACTURADA' | 'EMITIR', datilId?, rideUrl? }`

**Por qué:** el candado de la Task 2 quedó sin una sola prueba propia, y es el camino más sensible tributariamente del sistema. No se puede probar la ruta directamente sin hablar con Dátil —y emitir una factura de prueba al SRI no es una opción—, así que la decisión sale a una función pura y la ruta queda como puro cableado.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/facturas-visibilidad.test.js`:

```js
import { decidirEmision } from '../lib/facturas-visibilidad.js'

// El candado de /api/factura/emitir no tenía ni una prueba propia. Es el
// camino que emite al SRI: si se equivoca, o queda un pedido sin factura o
// sale una factura duplicada, y ninguna de las dos se deshace.

test('un pedido que no existe no se factura', () => {
  // Antes, un UPDATE que no encontraba filas devolvía error: null y eso se
  // reportaba como éxito. Un pedido inexistente tiene que FALLAR, no pasar.
  assert.deepEqual(decidirEmision(null), { accion: 'NO_EXISTE' })
  assert.deepEqual(decidirEmision(undefined), { accion: 'NO_EXISTE' })
})

test('un pedido con FACTURA_ID no se vuelve a facturar, y devuelve su RIDE', () => {
  const r = decidirEmision({ FACTURA_ID: '51b3f2a1bae045bfbdae9b52ed40982e' })
  assert.equal(r.accion, 'YA_FACTURADA')
  assert.equal(r.datilId, '51b3f2a1bae045bfbdae9b52ed40982e')
  assert.equal(r.rideUrl, 'https://link.datil.co/invoices/51b3f2a1bae045bfbdae9b52ed40982e/ride')
})

test('un pedido viejo con solo FACTURA_PDF_URL tampoco se refactura', () => {
  // Los pedidos que emitió Make guardaron la URL sin el id de Dátil. Si este
  // caso se colara, se emitiría una SEGUNDA factura de algo ya facturado.
  const r = decidirEmision({ FACTURA_PDF_URL: 'https://link.datil.co/invoices/abc/ride' })
  assert.equal(r.accion, 'YA_FACTURADA')
  assert.equal(r.rideUrl, 'https://link.datil.co/invoices/abc/ride')
})

test('un pedido sin factura sí se emite', () => {
  // El camino normal no puede haberse roto por poner el candado.
  assert.deepEqual(decidirEmision({ PEDIDO_ID: 'MAN-AND-9000', FACTURA_ID: '', FACTURA_PDF_URL: '' }), { accion: 'EMITIR' })
})
```

- [ ] **Step 2: Correr y verificar que FALLA**

Run: `npm test`
Expected: FAIL — `decidirEmision` no existe.

- [ ] **Step 3: Agregar la función pura**

Al final de `lib/facturas-visibilidad.js`:

```js
/**
 * Qué hacer cuando alguien pide emitir la factura de un pedido.
 *
 * Vive acá y no suelta en la ruta porque acá se puede probar sin hablar con
 * Dátil: emitir una factura de prueba al SRI no es una opción, así que la
 * única forma de tener cobertura del camino más delicado es que la decisión
 * sea una función pura.
 */
export function decidirEmision(pedido) {
  if (!pedido) return { accion: 'NO_EXISTE' }
  if (yaFacturado(pedido)) {
    const datilId = pedido.FACTURA_ID || ''
    return {
      accion: 'YA_FACTURADA',
      datilId,
      rideUrl: datilId ? `https://link.datil.co/invoices/${datilId}/ride` : pedido.FACTURA_PDF_URL,
    }
  }
  return { accion: 'EMITIR' }
}
```

- [ ] **Step 4: Correr y verificar que PASA**

Run: `npm test`
Expected: PASS, las 4 nuevas y todas las anteriores.

- [ ] **Step 5: Cablear la ruta a la función pura**

En `app/api/factura/emitir/route.js`, cambiar el import de `yaFacturado` por `decidirEmision`:

```js
import { decidirEmision } from '@/lib/facturas-visibilidad'
```

y reemplazar el bloque del candado que puso la Task 2 por:

```js
    // Releer el pedido ANTES de emitir. El botón de la pantalla ya se esconde
    // cuando hay factura, pero esconder un botón no protege de un doble toque,
    // de una pestaña vieja, ni de dos personas a la vez. Y una factura
    // duplicada ante el SRI no se deshace apretando "deshacer".
    //
    // La decisión vive en lib/facturas-visibilidad.js porque acá no se puede
    // probar sin emitir de verdad.
    const decision = decidirEmision(await getPedidoById(pedidoId))
    if (decision.accion === 'NO_EXISTE') {
      return Response.json({ ok: false, error: `El pedido ${pedidoId} no existe` }, { status: 404 })
    }
    if (decision.accion === 'YA_FACTURADA') {
      // No es un error: es que alguien llegó primero. Se contesta con el id que
      // YA existe para que la pantalla recargue y muestre el RIDE real.
      return Response.json({
        ok: true,
        yaFacturado: true,
        datilId: decision.datilId,
        rideUrl: decision.rideUrl,
      })
    }
```

Comprobar que ya no queda ninguna referencia a `yaFacturado` en la ruta:

Run: `grep -n "yaFacturado" app/api/factura/emitir/route.js`
Expected: solo la clave `yaFacturado: true` de la respuesta JSON. Ninguna llamada a la función.

- [ ] **Step 6: Correr pruebas y build**

Run: `npm test && npm run build`
Expected: todo en PASS y build exitoso.

- [ ] **Step 7: Commit**

```bash
git add lib/facturas-visibilidad.js app/api/factura/emitir/route.js tests/facturas-visibilidad.test.js
git commit -m "test(factura): cubrir el candado que evita la factura duplicada

El candado quedo sin una sola prueba propia, y es el camino que emite al
SRI: si se equivoca, o queda un pedido sin factura o sale una duplicada, y
ninguna de las dos se deshace.

La ruta no se puede probar sin hablar con Datil, y emitir una factura de
prueba al SRI no es una opcion. Asi que la decision sale a decidirEmision(),
que es pura, y la ruta queda de puro cableado. Cuatro pruebas: pedido
inexistente, ya facturado con id, ya facturado con solo el PDF (los viejos
de Make) y el camino normal, que tenia que seguir emitiendo igual."
```

---

## Fuera de alcance (queda pendiente)

Este plan **no arregla la causa**. Las facturas van a seguir dependiendo de que el celular del vendedor sobreviva los 4 segundos entre crear el pedido y emitir, y van a seguir cayéndose de vez en cuando. Lo que cambia es que ahora se pueden rescatar a mano.

**Limitación conocida del candado (decidida a propósito el 11-ago):** la comprobación es "leer, luego actuar". Entre que se lee el pedido y que se guarda el `FACTURA_ID` hay una ventana de milisegundos en la que dos peticiones **verdaderamente simultáneas** podrían emitir doble. Cerrarla necesita una marca atómica en la base (columna nueva + `UPDATE` condicional que, si toca 0 filas, significa que alguien llegó primero). Rodrigo decidió dejarlo así: hoy hay un solo ADMIN, la ventana pasó de "siempre" a milisegundos, y es una mejora estricta sobre no tener nada. **No se olvide: el plan prometía cubrir "dos personas a la vez" y eso queda cubierto solo en parte.**

Pendientes, en orden de valor:

0. **Cerrar la ventana del candado** con la marca atómica descrita arriba, si algún día hay más de un ADMIN emitiendo.
1. **Que el servidor emita** dentro de `POST /api/pedidos`, después de commitear el pedido y sin que un fallo de Dátil cambie la respuesta del alta. Ataca la causa.
2. **Reintento automático** por cron sobre la lista que ya calcula `lib/facturas-pendientes.js`.
3. **`registrarEvento` sin `await` en `lib/metaCapi.js`** (3 llamadas) y `enviarPurchase` sin `await` desde `POST /api/pedidos`. Misma familia de bug, decisión pendiente de Rodrigo porque awaitear ahí retrasa el alta del pedido.
