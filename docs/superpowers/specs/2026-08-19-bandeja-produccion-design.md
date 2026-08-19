# Bandeja de PRODUCCIÓN — que ningún pedido pueda desaparecer

**Fecha:** 19-ago-2026
**Repo:** MANDARINACRM (proyecto Vercel `mandarina-pro-sales`)
**Ruta afectada:** `/dashboard/produccion` · endpoint nuevo `/api/produccion`
**Estado:** aprobado el diseño, pendiente de plan de implementación

---

## 1. El problema

El 18-ago-2026 se detectó que `MAN-AND-5599` (2 camisetas de SUBLIMACIÓN, pagado,
prometido para el 19-ago) **nunca apareció en la bandeja de Producción**. El equipo
no lo vio y no se fabricó.

No fue un caso aislado ni un error de nadie: **21 pedidos en fábrica estaban
afectados**, 13 de ellos invisibles por completo, algunos con la entrega vencida
desde julio.

### La cadena, verificada

1. `lib/db/pedidos.js:222` lee `detalle_pedido` **sin paginar**.
2. PostgREST devuelve como máximo **1000 filas** y `error` viene `null`. No avisa.
3. `crm.detalle_pedido` cruzó las 1000 filas vivas el **4-ago-2026**.
4. El `EXPLAIN` da *Bitmap Heap Scan* → las filas llegan en **orden físico (ctid)**,
   así que el corte es por posición en el heap, **no por fecha**.
5. Un pedido cuyas prendas caen fuera del corte llega con `items: []`.
6. `app/dashboard/produccion/page.js` remata con `.filter(p => p.itemsFiltrados.length > 0)`:
   **el pedido no se ve vacío — desaparece entero.**

### Por qué nadie lo reportó en 14 días

Cuando la lectura falla, la pantalla pinta **"✅ ¡Todo al día! · No hay ítems
pendientes en tu área"**. Un fallo total y un día sin trabajo se ven idénticos.
Además nadie mira `res.ok`, y hay tres reintentos silenciosos que convierten un
error en una espera y después en ese mismo mensaje.

### Es intermitente, no un apagón

El orden `ctid` se mueve solo con cada UPDATE y cada vacuum. **El 19-ago las 131
prendas en fábrica caben todas dentro del tope** — por casualidad: la
regularización de corte del 18-ago reescribió 759 filas de pedidos cerrados y las
empujó al final del heap. Mirar hoy y decir "está bien" no prueba nada.

### El error de fondo

> **La bandeja crece con todo lo que se ha vendido en la historia. Debería crecer
> solo con lo que está pendiente.**

Para mostrar 63 pedidos, hoy se traen 654 pedidos + 1261 prendas + 675 pagos +
904 clientes + 37 guías.

| | filas | peso |
|---|---|---|
| Lo que trae hoy `/api/pedidos` | **3.541** | **966 kB** |
| Lo que necesita Producción para un ADMIN | **193** (63 pedidos + 130 prendas) | ~75 kB |
| Lo que necesita para **David** (SUBLIMACION+ESTAMPADO) | **113** (41 pedidos + 72 prendas) | ~45 kB |
| Lo mismo en 2 años, sin cambiar nada | ~28.000 | **7,5 MB** |

---

## 2. Enfoques descartados

**Paginar el join.** Convierte 1 petición de 1000 filas en 2, y en 3 cuando la
tabla llegue a 3000: el volumen crece sin techo. Y sobre todo **deja el fallo
silencioso intacto** — el bug no es "faltan filas", es que una lectura incompleta
se ve idéntica a una completa.

**Solo filtrar por estado en el servidor.** Cambia el techo de "1000 prendas en
total" a "1000 prendas en fábrica". El 18-ago había 550 — el 55 % de ese techo.
Se agota sola.

**Comparar un conteo por pedido contra las prendas recibidas.** Descartado por
Rodrigo durante la revisión: el conteo incluiría prendas `ELIMINADO` y
`ENTREGADO_TIENDA` que el servidor no envía, produciendo un **falso positivo
permanente** — un botón que grita para siempre y un Telegram cada hora hasta que
nadie los lea. Ver §4.3.

---

## 3. Alcance

**Entra:** la bandeja `/dashboard/produccion` y su endpoint nuevo.

**No entra** (queda para después, con el mismo patrón por familias):

- Colas de trabajo: Corte, Impresión, Despacho.
- Archivo: Historial (paginación + búsqueda en la base).
- Agregados: Tablero, Inicio, Calendario (consultas agregadas, no exportar la base).
- El peaje de corte del tablero (columna Producción en cero — problema aparte).
- La fuga de `/api/clientes?all=1` y el `?rol=ADMIN` de `/api/pedidos` (esta ruta
  deja de usarse desde Producción, pero las otras 8 pantallas siguen igual).

**`/api/pedidos` no se toca.** El endpoint nuevo es aditivo: cero riesgo para las
otras ocho pantallas.

---

## 4. Diseño

### 4.1 El contrato

**`GET /api/produccion`** — **sin parámetros**. Ni `?rol`, ni `?area`, ni
`?vendedor`. La identidad sale de la **cookie firmada** y el usuario se relee de
la base, como hace `requireAdmin`. Nadie puede pedir prendas de un área ajena
manipulando la URL.

Devuelve solo lo que la pantalla pinta (verificado campo por campo contra
`produccion/page.js` y `components/pedido/PdfPedido.js`):

```
pedidos[]:
  PEDIDO_ID · TIENDA_ID · FECHA_PEDIDO · FECHA_ENTREGA_PROMETIDA
  DIRECCION_PEDIDO                      ← la hoja de confección
  CLIENTE_NOMBRE · CLIENTE_CEDULA · CLIENTE_CELULAR   ← búsqueda instantánea
  items[]: ITEM_ID · AREA · SUBESTADO · SUBESTADO_CORTE · PRODUCTO_NOMBRE
           COLOR · TALLA · CANTIDAD · DETALLE_PERSONALIZADO · NOTAS_AREA
           FOTO_PECHO_URL · FOTO_ESPALDA_URL · FOTO_MANGA_D_URL
           FOTO_MANGA_I_URL · ARCHIVO_DISEÑO_URL
meta: { pedidos, prendas, completo }
```

**Fuera:** pagos, guías y la ficha completa del cliente. La bandeja no los usa.

**Filtra el servidor:** `estado_pedido = 'EN_FABRICA'` · prendas de la vista
`prendas_en_taller` · solo las áreas del usuario · **y excluye los pedidos que se
quedan sin ninguna prenda suya** (join `!inner`).

> ⚠️ **Las dos exclusiones de "pedido sin prendas" NO son la misma cosa, y
> confundirlas rehace el bug.**
>
> | | quién | ¿correcta? |
> |---|---|---|
> | Excluir pedidos **sin prendas de tu área** | el **servidor**, con el join | ✅ sí — es el filtro legítimo |
> | Excluir pedidos **que llegaron sin prendas** | el **cliente**, hoy | ❌ no — esconde los fallos |
>
> Medido el 19-ago: de los 63 pedidos en fábrica, **22 no tienen ninguna prenda de
> David**. Esos 22 no deben salir en su bandeja — y su ausencia es correcta, no un
> fallo. Lo que nunca puede pasar es que un pedido **con** prendas suyas
> desaparezca porque no llegaron.
>
> Si quien implementa quita el filtro equivocado, David ve 22 pedidos vacíos. Si
> mantiene el equivocado, vuelve el bug de origen.

**Sigue filtrando la pantalla** (conjunto acotado, respuesta instantánea, sin
cambios para el taller): subestado, tienda, área (ADMIN), fechas y búsqueda.

### 4.2 La consulta

Hoy son **cinco lecturas** cruzadas en memoria con `.filter()`. Pasa a ser **una
sola**, con el join anidado que PostgREST ya soporta:

```
pedidos?estado_pedido=eq.EN_FABRICA&select=…,prendas_en_taller(…)
```

Postgres hace el join y devuelve el resultado ya armado. El tope de 1000 aplica a
la tabla raíz — **63 pedidos**, no 1261 prendas.

**Una sola definición de "prenda que cuenta"**, en la base:

```sql
create view crm.prendas_en_taller as
  select * from crm.detalle_pedido
   where eliminado = false
     and subestado is distinct from 'ELIMINADO'
     and subestado is distinct from 'ENTREGADO_TIENDA';
```

La lista y el conteo leen de ahí. Hoy ese criterio está escrito en **tres sitios**
(la columna `eliminado`, el `SUBESTADO !== 'ELIMINADO'` de las pantallas —que en
Supabase **nunca se cumple**, es código muerto— y el filtro del repositorio), y
esa duplicación es exactamente lo que produjo el falso positivo del §4.3.

### 4.3 Completitud: dos niveles, los dos del mismo recurso

> **Corregido el 19-ago-2026 tras la verificación de la Task 1.** La versión
> anterior declaraba un solo `completo` global y eliminaba el conteo por pedido.
> La medición demostró que **PostgREST trunca cada recurso anidado por separado**,
> así que un pedido con más de 1000 prendas perdería prendas en silencio: el
> conteo global cuenta pedidos, no prendas. Hacía falta el conteo por pedido.

El servidor declara completitud en **dos niveles**:

| nivel | de dónde sale | qué detecta |
|---|---|---|
| **Global** | `count: 'exact'` sobre la consulta de pedidos | faltan **pedidos enteros** |
| **Por pedido** | `total:prendas_en_taller(count)` — el **mismo recurso** anidado | faltan **prendas de ese pedido** |

**Por qué esto NO reintroduce el falso positivo que detectó Rodrigo.** Su objeción
era correcta contra un conteo que viniera de *otro sitio*: incluiría prendas
`ELIMINADO` y `ENTREGADO_TIENDA` que el servidor no envía, y marcaría un faltante
inexistente para siempre. Aquí el conteo sale **del mismo recurso anidado, con los
mismos filtros que las prendas** (`prendas_en_taller`). Solo puede diferir si hubo
truncamiento de verdad.

Verificado con tablas desechables el 19-ago-2026:

```
padre con 1500 hijos → llegaron 1000, el count dijo 1500 → truncamiento detectado
padre con 10 hijos   → llegaron 10,   el count dijo 10   → ok
```

**Ante la duda, incompleto.** Si el total viene desconocido, `completo = false`.
No se puede afirmar que una lista está completa sin la evidencia de que lo está.

**Riesgo residual aceptado por Rodrigo (19-ago-2026):** el techo pasa de "1000
prendas en toda la base" (1261 hoy, ya cruzado) a "1000 prendas en **un solo
pedido**". El pedido más grande de la historia tiene **31 prendas**. Y si algún día
ocurriera, **se vería** en vez de perderse.

### 4.4 Los cuatro estados de la pantalla

Hoy hay dos, y "vacío" significa cinco cosas.

| estado | cómo se sabe | qué se ve |
|---|---|---|
| Cargando | — | el spinner de siempre |
| **Error** | `res.ok` falso, o respuesta no-JSON | motivo real + **Reintentar**. Nunca una lista |
| **Incompleto** | `completo = false` | franja roja + la lista que sí llegó |
| **Vacío** | OK **y** completo **y** 0 pedidos | ✅ "Todo al día" |

**Regla:** la pantalla solo puede decir "Todo al día" si cargó bien, completo, y
de verdad no hay trabajo.

### 4.5 Recuperación

- **En la franja**, si faltan pedidos: *"Faltan N pedidos por cargar · ⟳ Recargar"*.
- **En la tarjeta**, si a un pedido le faltan prendas (`llegaron < total` del mismo
  recurso): *"⟳ Cargar las N prendas que faltan"* → llama a `/api/pedidos/{id}`
  (ya existe, join acotado por un solo pedido).

Tras la corrección de §4.3, **el botón por pedido vuelve a ser el mecanismo
principal** —como se pidió al principio— y no una red decorativa: el conteo por
pedido le da la información que necesita para saber cuándo aparecer.

Sustituye al `.filter(length > 0)`: donde antes se borraba la evidencia, ahora se
enseña con la salida al lado.

### 4.6 El aviso

Si la lectura viene incompleta, el servidor registra en `crm.eventos_sistema` con
nivel `error`, lo que ya dispara Telegram.

- **Con `await`.** En serverless la función se congela al responder y el registro
  se pierde justo cuando hay algo que registrar (le pasó a los 502 de Dátil).
- **Enfriamiento por ventana de tiempo, máximo un aviso por hora.** Nunca "por
  flanco": eso da un aviso en toda la vida — el fallo de las notificaciones push
  del inbox.

### 4.7 Refresco

**Al volver a la pestaña** (decisión de Rodrigo). El taller mira el móvil a ratos;
refrescar cuando vuelve es cuando importa. Con 75 kB por carga es barato.

Hoy la bandeja carga **una sola vez** al abrirse: quien la deja abierta toda la
mañana no ve nada de lo que entró.

### 4.8 Lo que se borra

| línea de `produccion/page.js` | por qué |
|---|---|
| `fetch('/api/pedidos?rol=ADMIN')` | la identidad deja de venir del navegador |
| `.filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')` | lo hace el servidor |
| `itemEsDeUsuario(item.AREA, u)` | lo hace el servidor, contra la cookie |
| `.filter(SUBESTADO !== 'ELIMINADO' && !== 'ENTREGADO_TIENDA')` | lo hace la vista |
| `.filter(p => p.itemsFiltrados.length > 0)` | **el que escondía los pedidos** — ver el aviso de §4.1: lo sustituye el `!inner` del servidor, no se elimina la idea |
| los 3 reintentos silenciosos | convierten un fallo en "Todo al día" |

### 4.9 Lo que NO cambia

Filtros de subestado, tienda, área y fecha · búsqueda instantánea · orden ·
20 por página · expandir/contraer · botones de subestado y corte · notas de área ·
fotos · hoja de confección en PDF · toast de guardado.

Para David la bandeja solo carga rápido y deja de mentir.

---

## 5. Pruebas

### 5.1 Funciones puras (`node --test`, se suman a las 124 actuales)

Se extraen a `lib/` para poder probarlas, igual que `lib/facturas-visibilidad.js`.
⚠️ Import **relativo**, no `@/`: `node --test` no entiende el alias.

- **`estadoBandeja({ ok, completo, pedidos })`** → invariante: **nunca devuelve
  `VACIO` si `ok` o `completo` son falsos**. Es todo el bug en una prueba.
- **`esCompleta({ recibidas, total })`** → `total` desconocido ⇒ incompleto.
- **`areasDeUsuario(rol, areas)`** → David ve `ESTAMPADO` y `ESTAMPADO + BORDADO`
  pero no `BORDADO` · Christian Garzón al revés · CORTE ve todo · DISEÑO sin áreas
  no ve nada · ADMIN ve todo · un área desconocida no revienta.

### 5.2 Reconciliación contra la base

Script `.mjs` (como los `scripts/test-*.mjs`), **solo lectura**: pide
`/api/produccion` y compara pedido a pedido contra una consulta SQL de referencia.
Es la prueba que **habría cazado esto el 4-ago** y que sigue valiendo dentro de
dos años.

### 5.3 Control negativo — la más importante

Hoy no hay 1000 prendas en fábrica, así que el aviso nunca se dispararía y **no
sabríamos si funciona**. Del propio repo: *"una alarma que nunca se prueba es una
alarma que no tienes"*.

Se fuerza con un modo interno que limite la lectura a 5 filas, y se comprueba que
la franja aparece, que el evento se registra **y que el Telegram sale**.

### 5.4 Verificación por la puerta real

Abrir `/dashboard/produccion` **con la cuenta de David**, no con un ADMIN, y
contar contra SQL. Verificar con el rol equivocado no prueba nada.

---

## 6. Riesgos abiertos

**~~El join anidado podría truncarse igual.~~ VERIFICADO el 19-ago-2026: SÍ SE TRUNCA.**

Se midió con tablas desechables (`crm.zz_prueba_*`, creadas, medidas y borradas):
un padre con **1.500** hijos devolvió **1.000**. El tope se aplica **a cada recurso
anidado por separado**, no solo a la tabla raíz. La suposición del diseño original
era falsa.

**No hizo falta la función SQL.** La misma medición encontró la salida: el `count`
del recurso anidado **no se trunca** (devolvió 1.500) y se puede pedir junto a las
filas. De ahí sale la corrección de §4.3.

Lección: esto es exactamente lo que la Task 1 del plan existía para evitar. De
haber construido sobre la suposición, habríamos reproducido el mismo bug en
pequeño y **sin detección**.

**La cola puede desbordarse.** Producción está acotada por el trabajo pendiente,
no por la historia — pero el 18-ago tenía 258 pedidos y Despacho llegó a 388 con
pedidos parados 42 días. Si nadie cierra, la cola se acerca al tope otra vez. Por
eso `completo` se comprueba **siempre**, aunque hoy parezca imposible que falle.

---

## 7. Decisiones tomadas

| decisión | quién |
|---|---|
| Supabase es la fuente oficial; Sheets se deja de sincronizar | Rodrigo |
| Prioridad: que ningún pedido pueda desaparecer nunca (no el tablero) | Rodrigo |
| Una solución por familia de pantalla, no un parche uniforme | Rodrigo |
| Con el filtro en "Todos", Producción sigue ocultando las `LISTO` | Rodrigo |
| Producción **no** filtra por tienda del usuario (la fábrica es transversal) | Rodrigo |
| Un botón que recupere, en vez de solo avisar | Rodrigo |
| Fuera el conteo por pedido (falso positivo con eliminadas y de tienda) | Rodrigo |
| Refresco al volver a la pestaña | Rodrigo |
| Empezar por Producción y validar el patrón antes de las demás | Rodrigo |

---

## 8. Reglas del repo que aplican

- **Siempre `main`.** Preview no sirve: Supabase solo está en Production.
- **Nunca `git add -A` ni `git add .`** — hay trabajo sin commitear. Por nombre.
- Español ecuatoriano con **tuteo**, también en commits y comentarios.
- Un `lib/` con prueba se importa con **ruta relativa**, no con `@/`.
- Desplegar no es subir: confirmar con `git status -sb` y que el alias apunte al
  commit correcto.
