# Opciones en una cotización (y el precio por unidad con IVA)

**Fecha:** 12-sep-2026
**Estado:** diseño aprobado, pendiente plan de implementación
**Alcance:** CRM de Mandarina, módulo de Cotizaciones

## Los dos problemas

**1. El precio por unidad no se entiende.** El documento muestra `10 uds × $19.99`
y abajo suma 15% de IVA. El cliente paga **$22.99** por unidad y ese número no
aparece en ninguna parte, así que tiene que sacar la cuenta para saber cuánto le
cuesta realmente cada prenda.

**2. No se pueden cotizar alternativas.** Hoy todos los productos de una
cotización se suman en un solo total. Para ofrecerle al cliente dos caminos
—«50 camisetas + 20 gorras» contra «100 camisetas»— hay que hacer dos
cotizaciones separadas, con dos números distintos, y el cliente las compara a
mano.

Los dos se arreglan juntos porque **tocan la misma línea del documento**: la que
muestra cantidad, precio unitario y subtotal de cada producto.

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Qué son las «opciones» | **Escenarios completos**: cada una con sus productos y su propio total. El cliente compara paquetes enteros |
| Qué varía por opción | **Productos, cantidades, precios y tiempo de entrega** |
| Qué es compartido | Descuento, anticipo, condiciones de pago, validez, datos del cliente, beneficios, notas |
| Qué muestra el Historial | **Un rango**: `$920 – $1.380`. Un número normal cuando hay una sola opción |
| Precio por unidad | **Los dos**: el precio base y el final con IVA, en la misma línea |
| Con descuento | El precio por unidad se calcula sobre el precio de lista y se agrega **«(antes del descuento)»** solo si hay descuento |

## Enfoque: las opciones son una capa nueva sobre lo que ya existe

Se descartaron dos alternativas:

- **Migrar todas las cotizaciones a tener opciones.** Más limpio de leer, pero
  deja el sistema con un solo camino y sin red si algo llega con la forma vieja.
- **Una fila por opción, enlazadas por un padre.** Rompe la numeración, obliga al
  documento a unir filas y llena el Historial de entradas duplicadas.

**Lo elegido:** la cotización gana un campo `opciones` **opcional**. Una función
única normaliza al leer, y de ahí en adelante todo el código ve siempre una lista
de opciones — nunca vuelve a preguntar si la cotización es vieja o nueva.

### Correcciones a este spec (12-sep, verificadas contra la base real)

Dos cosas que afirmé antes de mirar y que resultaron falsas:

1. ☠️ **Esto SÍ necesita una migración.** Dije que no porque `productos` ya es
   `jsonb`, pero `opciones` es un campo nuevo y necesita **su propia columna**.
   Es una migración **aditiva** (`ALTER TABLE ... ADD COLUMN opciones jsonb`),
   sin transformar ni una fila — el riesgo es otro, pero no es cero como dije.

2. **`crm.cotizaciones` tiene 5 filas**, no cientos. El módulo es nuevo y casi no
   se ha usado. Eso debilita el argumento que di contra migrar todo: con 5 filas
   habría sido barato. Se mantiene el enfoque elegido igual, pero por otra razón:
   `opcionesDe()` son seis líneas y además protege de cualquier fila que llegue
   sin `opciones`, hoy o dentro de un año.

⚠️ **`lib/db/cotizaciones.js` tiene una lista blanca de columnas (`COLS`) y hay
que agregarle `'opciones'`.** Sin eso el campo se descarta al guardar **en
silencio**: la pantalla mostraría las opciones, el guardado diría que salió bien,
y al recargar no habría nada.

## Diseño

### La forma de los datos

```js
// Una opción
{
  id: 'op_ab12',        // shortId(), como el resto del módulo
  nombre: 'Uniformes básicos',
  entrega_dias: 15,
  productos: [ /* la MISMA forma que hoy: nuevoProducto() */ ],
}
```

La cotización gana `opciones: [...]`. Los campos `productos` y `entrega_dias` de
la raíz **se conservan** y siguen siendo la fuente para las cotizaciones de una
sola opción y para todas las que ya existen.

☠️ **Cuando `opciones` tiene contenido, la raíz se IGNORA por completo y no se
mantiene sincronizada.** Es lo contrario de lo que parece prudente, y es a
propósito: si se escribiera en los dos sitios, tarde o temprano dirían cosas
distintas y nadie sabría cuál manda. Con una sola fuente por cotización, no hay
forma de que se contradigan. `opcionesDe()` es quien decide cuál es esa fuente.

### `opcionesDe(cotizacion)` — el único sitio que conoce las dos formas

Función pura en `lib/cotizacion.js`. Devuelve **siempre** un arreglo de opciones:

- Si la cotización trae `opciones` con al menos una, las devuelve tal cual.
- Si no, devuelve **una sola opción implícita** con `productos` y `entrega_dias`
  de la raíz, y `nombre: ''`.

Es lo que hace que la compatibilidad hacia atrás no se reparta por todo el código.
Toda pantalla y todo cálculo pasa por aquí.

### Los cálculos

Cada opción usa **la misma `calcTotales` que ya existe**, llamada una vez por
opción: `calcTotales(opcion.productos, cotizacion.descuento)`.

El descuento es uno solo de toda la cotización. En la práctica: **son $50 sobre
la opción que el cliente escoja, sea cual sea**. Fácil de explicar y no obliga a
prorratear nada.

### El precio por unidad con IVA

Función pura nueva, `precioUnitarioConIva(p, ivaRate = IVA_RATE)`, junto a
`calcSubtotalProducto`. Devuelve `precio × (1 + ivaRate)`.

Lee el precio **igual que `calcSubtotalProducto`** (`parseFloat`, y `0` si no es
un número): el campo del formulario es texto libre y puede venir vacío o a medio
escribir mientras se cotiza. Las dos funciones tienen que coincidir en eso, o el
precio por unidad y el subtotal de la misma línea se contradirían en pantalla.

La línea de cada producto pasa de:

```
50 uds × $12.00                                        $600.00
```

a:

```
50 uds × $12.00 + IVA  ·  $13.80 c/u con IVA           $600.00
```

Con descuento, la segunda parte dice `$13.80 c/u con IVA (antes del descuento)`.

⚠️ **Todo va en la MISMA línea, a propósito.** El documento se auto-ajusta a una
hoja A4 (`encajeEnA4`); una línea nueva por producto podría empujar una cotización
de una hoja a encogerse o partirse. Sumando al renglón que ya existe, el alto no
cambia.

### El documento

Cada opción es un bloque cerrado, con su nombre, sus días de entrega, sus
productos y **su propio total**:

```
OPCIÓN A · Uniformes básicos                    entrega 15 días
──────────────────────────────────────────────────────────────
 50 camisetas algodón    50 uds × $12.00 + IVA
                         $13.80 c/u con IVA              $600.00
 20 gorras bordadas      20 uds × $10.00 + IVA
                         $11.50 c/u con IVA              $200.00

                    Subtotal $800 · IVA $120 · TOTAL $920
```

Debajo de todos los bloques, lo compartido: validez, anticipo, condiciones de
pago, beneficios y notas — una sola vez, como hoy.

**Cuando hay una sola opción, el documento se ve exactamente como hoy**: sin
encabezado de opción y sin el nombre. La única diferencia visible es el precio
por unidad con IVA.

### La pantalla de edición

La pantalla gana pestañas arriba: `Opción A` · `Opción B` · `+ Agregar opción`.
Dentro de cada pestaña, **el formulario de productos es el mismo de hoy**, más un
campo de nombre y uno de días de entrega.

**Si nunca se agrega una segunda opción, la pantalla se ve y funciona idéntica a
hoy** — sin pestañas. Solo aparecen cuando se pide la segunda.

Reglas:

- Siempre hay al menos una opción; borrar la última no se ofrece.
- **Una opción sin productos no se puede guardar**: la pantalla lo bloquea con un
  aviso. Sin esto, una opción vacía llegaría al cliente mostrando $0.
- El nombre por defecto es `Opción A`, `Opción B`, … y es editable.

### El Historial

El badge muestra un rango —`$920 – $1.380`— cuando hay varias opciones, y un
número normal cuando hay una.

⚠️ **El rango se calcula al leer, no se guarda.** Guardarlo significaría tener el
mismo dato en dos sitios, que es exactamente cómo esos dos números terminan
diciendo cosas distintas con el tiempo. El JSON ya viene en la fila, así que
calcularlo no cuesta una consulta más.

Las columnas `subtotal`, `iva_monto` y `total` **se siguen guardando**, con los
valores de **la opción más barata**, para que nada de lo que hoy las lee se quede
sin número.

☠️ **Los tres valores salen de la MISMA opción, como un conjunto.** Tomar el
mínimo de cada uno por separado daría un subtotal de una opción con el IVA de
otra: tres números que no cuadran entre sí y que nadie sabría explicar.

### El mensaje de WhatsApp

`textoWhatsAppCotizacion` recibe hoy el total. Con varias opciones manda el rango,
para que el mensaje no contradiga al documento que va adjunto.

## Fuera de alcance

- Que el cliente **acepte** una opción desde el documento. El documento informa;
  la elección sigue llegando por WhatsApp, como hoy.
- Convertir una opción aceptada en pedido. Las cotizaciones **nunca entran a
  producción** (`lib/db/cotizaciones.js`), y esto no lo cambia.
- Descuento, anticipo o condiciones de pago por opción.
- Mostrar el precio con IVA en la **pantalla de edición**. Ahí solo se ve en la
  vista previa del documento, que es la que mira el cliente.

## Riesgos conocidos

- **Una cotización con varias opciones va a ocupar más de una hoja.** La lógica
  de paginación ya existe y lo maneja, pero es un cambio visible en el PDF y en
  lo que se manda por WhatsApp.
- Las cotizaciones existentes **no se tocan**, pero sí pasan por `opcionesDe()`.
  Esa función es el punto donde una regresión afectaría a todo el módulo, así que
  necesita pruebas propias que cubran la forma vieja y la nueva.
