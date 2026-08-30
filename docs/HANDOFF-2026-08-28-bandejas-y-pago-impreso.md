# HANDOFF · 26/29-ago-2026 · Bandejas, el pago en la hoja y el permiso de ventas

Todo lo de este documento está **en producción y verificado en el navegador**,
con datos reales. Lo que NO se verificó se dice explícitamente.

Siete commits, de `9e60ee1e` a `32e9b9d1`. Uno de ellos arregla una pantalla que
**yo mismo tumbé** durante ~8 minutos: leer la sección *"Lo que salió mal"* antes
de tocar nada.

---

## Qué se hizo

| pieza | dónde |
|---|---|
| El pago en la hoja del cliente | `lib/db/impresion.js` |
| Estado de pantalla que sobrevive al remonte | `lib/estado-pantalla.js` + `lib/useEstadoPantalla.js` |
| Aviso de filtros restaurados | `components/AvisoFiltros.js` |
| Cabecera compartida y compacta | `components/BarraFiltros.js` |
| Filtro por área en Historial | `lib/db/historial.js` + `lib/areas-filtrables.js` |
| Permiso "ve las ventas de todos" | `lib/tiendasUsuario.js` + `lib/db/historial.js` |

---

## 1. La impresión masiva le cobraba OTRA VEZ a quien ya había pagado

La hoja del cliente salía siempre en rojo: **"ABONO DEL 0% — SALDO PENDIENTE"**,
cobrando el total entero.

`PdfPedido` decide con dos campos:

```js
const abonado  = parseFloat(pedido?.MONTO_ABONADO || 0)
const isPagado = pedido?.ESTADO_PAGO === 'PAGADO' || saldo < 0.01
```

y `lib/db/impresion.js` —la cola propia creada el 19-ago— no pedía
`estado_pago` ni `monto_abonado`. Con `undefined` el abono da 0 y **nunca** puede
dar pagado: no fallaba a veces, es que no podía acertar nunca.

**Por qué la pantalla del pedido SÍ salía bien:** esa lee `/api/pedidos/{id}`,
que pasa por `lib/db/pedidos.js` y sí trae los dos campos. El fallo era solo del
**lote**, que pinta el PDF con la lista de `/api/impresion` sin releer cada pedido.

### Medido en producción contra `/api/impresion`

| | antes | ahora |
|---|---|---|
| Hojas de 83 que salían en rojo | **82** | **13** (las que deben de verdad) |

- `IND-YAW-5362` (pagado): *"ABONO DEL 0% — SALDO PENDIENTE"* → **PAGO COMPLETO**
- `IND-XAV-5640` (abono real): decía *0% y $40 pendientes* → ahora **50% y $20**.
  Ni el número era correcto.

Entre el 19 y el 26-ago se imprimieron así **85 pedidos ya cobrados**.

> ⚠️ **La regla que deja esto:** un endpoint acotado hereda la obligación de traer
> TODO lo que su consumidor pinta. Al recortar una consulta, la lista de columnas
> se compara contra **lo que el componente lee**, no contra lo que "parece" del
> pedido.

---

## 2. Volver a la pantalla ya no te devuelve al principio

Filtrabas Despacho, salías un momento, volvías y estabas otra vez en la lista
entera y en el tope del scroll.

Eran **dos causas distintas**, no una:

**A) El spinner se comía la posición** (Producción y Corte). El refresco al volver
a la pestaña llamaba a `loadItems()` a secas, y esa función arranca con
`setLoading(true)`. El render es `loading ? <spinner> : <lista>`: la lista se
desmontaba entera, el contenedor se colapsaba y el scroll volvía a cero. Ahora es
`loadItems(true)` con el spinner detrás de `if (!silencioso)`.

**B) Todo el estado vivía solo en `useState`** (las ocho bandejas). Cualquier
remonte lo borraba: salir y volver con atrás en la misma pestaña, el descarte de
pestañas de Chrome, o el arranque en frío de la PWA cuando el celular mata la app.
Despacho no tenía el listener de (A) — por eso ahí se perdían también los filtros.

Se guardan filtros, paginación, tarjetas abiertas y scroll en **Despacho,
Producción, Corte, Impresión, Historial, Mis Pedidos, Tablero y Calendario**.

### ☠️ Caduca a las 12 horas Y AVISA

**Restaurar es la parte peligrosa, no guardar.** Una bandeja filtrada se ve igual
de sana que una completa, y aquí ya costó 21 pedidos invisibles durante 14 días.

- Lo guardado **caduca a las 12 h**: cubre una jornada y no llega al día siguiente.
- Si vuelve con filtros puestos, sale una barra ámbar: *"Estás viendo la lista
  filtrada — no estás viendo todo"*, con botón de limpiar.
- El scroll y la paginación **no** encienden el aviso: restaurarlos no esconde nada.

**Impresión NO guarda la selección del lote**, a propósito. Volver mañana con 30
pedidos ya marcados, elegidos en otra sesión y quizá ya impresos por otra persona,
es pedir que alguien le dé a Imprimir sin mirar.

**Historial ya guardaba filtros por su cuenta** (`mp_historial_filtros_v2`), sin
caducar nunca y sin avisar de nada. Migrado al mecanismo común, respetando que
`?estado=` del enlace de Despacho siga mandando y que YAW entre siempre limpio.

### ☠️ La trampa que costó un despliegue extra

**El contenedor `flex-1 overflow-y-auto` de las bandejas NO scrollea en
escritorio.** Da `scrollHeight === clientHeight` (2808 y 2808 en Despacho): crece
con el contenido y quien se mueve es la **VENTANA** — `window.scrollY` marcaba 800
mientras `contenedor.scrollTop` marcaba 0.

El listener estaba en el elemento equivocado y guardaba siempre cero: el filtro
volvía bien, la posición no volvía nunca. Ahora se pregunta cada vez con
`scrollHeight > clientHeight` y se escucha en los dos, porque en pantallas
angostas el que scrollea sí puede ser el contenedor.

**Ninguna prueba de fuente podía verlo: el código se lee correcto.**

⚠️ Y al probarlo: un `window.scrollTo()` programático no dejó rastro; **el scroll
de rueda sí**. Si un listener "no funciona", prueba con el gesto real antes de
tocar el código.

---

## 3. Filtro por área en Historial

Seis opciones (`lib/areas-filtrables.js`), verificadas contra la base:

| área | pedidos |
|---|---|
| ESTAMPADO | 393 |
| BORDADO | 270 |
| SUBLIMACION | 32 |
| PRODUCTO SIN DISEÑO | 187 |
| PREMIUM - SIN DISEÑO | 21 |
| ENTREGA EN TIENDA | 29 |

### ☠️ Dos trampas, las dos esconden pedidos en silencio

**1. `area` guarda COMBINACIONES en un solo texto.** `ESTAMPADO + BORDADO` son 82
pedidos. Medido: filtrar con `=` en vez de "contiene" perdería **77 pedidos de
bordado** (270 → 193) y **75 de estampado** (393 → 318). Va con `ilike '%AREA%'`.

**2. Un `!inner` sobre el embed que se PINTA recorta las prendas devueltas.** Un
pedido de 3 prendas con una sola de bordado se vería como un pedido de UNA prenda.
Por eso el join va en un **segundo embed** de la misma tabla, con alias propio:

```js
const SELECT_CON_AREA = [
  COLS_PEDIDO,
  `prendas:detalle_pedido(${COLS_PRENDA})`,   // lo que se pinta: SIN filtrar
  'filtro_area:detalle_pedido!inner(area)',   // solo para el join
  'clientes(nombre,cedula,celular)',
].join(',')
```

El join extra solo se arma cuando hay filtro. Y solo se aceptan áreas de la lista:
lo que llegue por la url no puede volverse un patrón cualquiera contra la base.

**Verificado en producción con `MAN-CLV-5211`** (31 prendas, solo 15 con bordado):

| | prendas que muestra |
|---|---|
| sin filtro | 31 |
| filtrando Bordado | **31** ← no 15 |
| filtrando Entrega en tienda | el pedido no sale (no tiene esa área) |

Y los seis totales de la API cuadran exactamente con el SQL: **el `!inner` no
infla el `count`**, que era el riesgo abierto.

> La lista vive en `lib/areas-filtrables.js`, UNA sola para pantalla y servidor.
> `AREAS` de `lib/pedidos.js` no sirve: incluye las combinaciones, y además ya se
> desincronizó con `lib/pedidos-client.js` (le pasó a `PREMIUM - SIN DISEÑO`).

---

## 4. La cabecera: de 210 px a ~112, y sin estar copiada 5 veces

El bloque de filtros se comía el 25% de la pantalla. No se lo comían los
controles: se lo comían las **etiquetas** de encima de cada select (una línea
entera por fila) y que Expandir/Contraer tuvieran fila propia.

Ahora es **una fila**: buscador ancho + `⚙ Filtros` con el número de los puestos +
Expandir/Contraer como iconos cuadrados sin texto. El panel se despliega al pulsar
y se recuerda como cualquier otro estado de pantalla.

### ☠️ El panel se pliega, los chips NO

Debajo de la fila van los chips de lo que esté activo, cada uno con su `×`. Salen
de `filtrosActivos`, que usa la **misma regla que el aviso** —distinto del valor
por defecto, no una lista de nombres— así que **un filtro nuevo aparece como chip
solo**, sin que nadie tenga que acordarse.

Esconder filtros solo es aceptable si lo que esconden sigue viéndose.

### Y lo que lleva DATOS no se pliega nunca (`debajo`)

Los cuatro contadores de Corte y el `N/30 seleccionados` de Impresión siguen
siempre a la vista. Un contador escondido es información perdida, no espacio
ganado. Por lo mismo, `filtro` (Corte) y `filtroImpresion` **no** cuentan como
filtro escondido: sus botones están siempre visibles con el activo resaltado.

### Alturas medidas en producción (viewport de 972 px)

| pantalla | antes | ahora | % pantalla |
|---|---|---|---|
| Historial | ~210 px | **115** | 12% |
| Despacho | ~200 px | **112** | 15% |
| Producción | ~210 px | **111** | 11% |
| Impresión | ~230 px | **183** | 19% |
| Corte | ~250 px | **225** | 23% |

⚠️ **Corte e Impresión bajan poco, y es a propósito**: sus contadores y pestañas
no se pliegan. Si a Rodrigo le sigue molestando el alto ahí, la decisión pendiente
es si esos contadores pueden encogerse (por ejemplo, a una fila de píldoras en
lugar de cuatro tarjetas grandes). **No está decidido.**

Tablero y Calendario tienen otra estructura y **no** se tocaron.

---

## 5. Permiso `VER_TODAS_LAS_VENTAS` (JACKELINE)

**El diagnóstico cambió a mitad, y esa es la parte que hay que recordar.**

Rodrigo pidió que JACKELINE viera los pedidos de MANDARINA e INDSTORE. Lo
primero que se comprobó fue la base, no el código: **ya tenía
`tiendas: ["MANDARINA","INDSTORE"]`**. Lo que la limitaba no era la tienda.

Era el **rol VENDEDOR**, que en `aplicarAlcance` filtra por `vendedor_id`: cada
quien ve lo suyo, venga de la tienda que venga. Sus 176 pedidos son todos de
Mandarina; de Indstore tenía cero. Así que *"no ve nada de otros"* era el sistema
funcionando como debía, no un fallo.

> **Antes de tocar permisos, mirar `crm.usuarios` primero.** La mitad de la
> petición ya estaba configurada; cambiar `tiendas` no habría hecho nada.

Nuevo acceso **por persona**, en la misma línea que `VENTAS` e `INBOX_*`:

```js
if (rol === 'VENDEDOR' && !veTodasLasVentas(usuario)) {
  const suyos = identidadesDe(usuario)
  if (suyos.length) consulta = consulta.in('vendedor_id', suyos)
}
```

### ☠️ Levanta el filtro por vendedor y SOLO ese

- **NO levanta el filtro por tienda.** Si lo hiciera de paso, le abriría los 130
  pedidos de YAW. Son dos restricciones distintas y hay una prueba dedicada a que
  sigan separadas (`tests/ver-todas-las-ventas.test.js`).
- **NO toca "Mis Pedidos".** Esa pantalla significa los MÍOS; si mostrara los de
  todos, mentiría en su propio nombre. También con prueba.
- Se marca desde la pantalla de Usuarios (**👁️ Ve las ventas de todos**): un
  permiso que solo se pueda dar por SQL acaba sin darse.

### Verificado en producción

| | pedidos |
|---|---|
| Veía antes | 176 |
| Ve ahora (confirmado por Rodrigo tras reentrar) | **678** |
| YAW, que sigue sin ver | 130 |
| Total de la base | 808 |

⚠️ **El permiso viaja en la cookie firmada**: con la sesión vieja no surte
efecto. Hay que cerrar sesión y volver a entrar.

⚠️ Hoy lo tiene **solo JACKELINE**. Quien lo tenga pasa a ver nombre, cédula,
celular y montos de clientes de otros vendedores — no es un permiso cosmético.

---

## ☠️ Lo que salió mal: tumbé Historial 8 minutos

Al desplegar la cabecera compartida, la pantalla quedó en blanco:
*"Application error: a client-side exception has occurred"*.

```js
const hayLista = !loading && filtered.length > 0     // línea 87
...
const filtered = pedidos                             // línea 199
```

El cuerpo del componente corre entero en cada render: leer `filtered` 112 líneas
antes de declararla revienta con `ReferenceError` **antes de pintar nada**.

**Lo grave no es el error: es que pasó todos los controles.** `next build`
compiló sin una queja, las 421 pruebas dieron verde y el despliegue quedó `Ready`.
Solo se ve **abriendo la pantalla**.

Es el mismo fallo del 19-ago que ya documentaba `tests/hooks-orden.test.js`, pero
aquella prueba solo miraba las **listas de dependencias** de los hooks — y esta
const era código normal del cuerpo. La prueba se amplió a las const del cuerpo del
componente, acotada a partir de `export default function` (antes hay ayudantes del
módulo con la misma sangría, y contarlos daba falsos positivos).

**Se probó al revés:** reintroduje el bug a propósito hasta ver fallar la prueba, y
después lo revertí. Sin ese paso una prueba solo demuestra que hoy está verde.

> **Corolario para este repo:** build limpio + pruebas en verde + deploy `Ready`
> **no prueban que la pantalla abra**. Después de desplegar una pantalla, ábrela.

---

## Otro error mío que conviene no repetir

Dije que **ninguna cabecera era fija en escritorio**. Es falso: todas ya eran
`sticky top-0` y funcionan — con `scrollY: 1500` la cabecera sigue en `top: 0`.

Me engañó una captura de pantalla. Lo que debió delatarme: en esa misma foto
también salía movido el sidebar, que es `position: fixed`, y un `fixed` no se mueve
con el scroll **nunca**. La foto era el artefacto, no la página.

> **Las capturas del navegador mienten en este entorno. Mide con
> `getBoundingClientRect()`, no con los ojos.**

---

## Pruebas nuevas (422 en total, 0 fallos)

| archivo | qué vigila |
|---|---|
| `tests/estado-pantalla.test.js` | caducidad, estado corrupto, sin `localStorage`, cuota llena, chips |
| `tests/bandejas-no-pierden-el-sitio.test.js` | refresco silencioso, aviso obligatorio, el efecto que borraba la paginación |
| `tests/barra-filtros.test.js` | los chips fuera de la condición del panel; `debajo` fuera del plegable |
| `tests/historial-filtro-area.test.js` | `ilike` y no `eq`; el embed que se pinta sin `!inner` |
| `tests/hooks-orden.test.js` | **ampliada**: const del cuerpo usada antes de declararse |
| `tests/bandeja-impresion.test.js` | **ampliada**: la cola trae `estado_pago` y `monto_abonado` |
| `tests/ver-todas-las-ventas.test.js` | que el permiso NO levante el filtro por tienda ni toque Mis Pedidos |

---

## Pendientes

1. **El refresco silencioso de Producción y Corte (Causa A) no se probó en vivo.**
   Necesita el ciclo real de esconder y volver a mostrar la pestaña, y la ventana
   estaba en segundo plano. Confirmado por código, build y pruebas de fuente — no
   por verlo. **Comprobación: abrir Producción, bajar la lista, cambiar de pestaña,
   volver. Si no parpadea el spinner y sigues donde estabas, cerrado.**
2. **Corte e Impresión siguen en 23% y 19%** de alto. Decisión pendiente sobre si
   encoger los contadores (ver arriba).
3. **El desplegable de Área cae solo en una segunda fila** dentro del panel (la
   rejilla es de tres columnas y él es el cuarto). Funciona; se ve desbalanceado.
4. `AREAS` sigue desincronizada entre `lib/pedidos.js` y `lib/pedidos-client.js`
   (`PREMIUM - SIN DISEÑO`). **No se tocó** en esta sesión.
