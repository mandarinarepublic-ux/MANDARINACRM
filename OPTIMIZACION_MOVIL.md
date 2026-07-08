# Optimización móvil + accesibilidad (texto grande sin descuadre)

> Objetivo: que se pueda **agrandar el texto** (usuaria adulta mayor) sin que botones y
> cajas se descuadren, y que la navegación en celular sea cómoda y con targets grandes.

---

## 🔎 El problema, explicado

Cuando agrandas el texto (zoom del navegador o "tamaño de fuente" del sistema), el
contenido crece pero **los contenedores tienen medidas fijas que no crecen** → el texto
desborda, los botones se enciman y las cajas se salen.

**Buena noticia:** el `<meta viewport>` ya permite zoom (no tiene `maximum-scale`). El
problema es puramente de CSS/layout rígido.

## 🧨 Causas concretas encontradas en el código (conteo real)

| Patrón | Archivos | Por qué rompe con texto grande |
|---|---|---|
| `text-xs` fijo | 23 | Fuerza texto minúsculo; al escalar, desborda contenedores rígidos |
| `h-screen` | 14 | Altura fija a la pantalla; el contenido crecido no cabe y se corta |
| `grid-cols-2` fijo | 14 | Columnas angostas en móvil; con texto grande el contenido se sale |
| `py-1.5` en botones | 7 | Altura ~30px → bajo el mínimo táctil de 44px |
| `line-clamp-2` | 2 | Corta el nombre del producto (no se lee completo) |
| `aspect-square` + `object-cover` | 2 | Caja de imagen rígida; empuja el texto de al lado |
| Badges `absolute` (MAN/IND) | catálogo | Se enciman con el título al crecer |

Ejemplo típico (tarjeta de producto en `dashboard/catalogo`): título con `line-clamp-2`,
precio `text-xs`, badge `absolute`, botón `py-1.5` — los cuatro se descuadran al hacer zoom.

---

## ✅ Principios de arreglo

1. **Todo en `rem`, nada en px fijo** para texto y espaciados → respeta el zoom del sistema.
2. **`min-h-[44px]` en botones/inputs** en vez de altura fija → crecen si el texto crece.
3. **Grids fluidos:** `grid-cols-[repeat(auto-fill,minmax(150px,1fr))]` en vez de `grid-cols-2`.
4. **Quitar `line-clamp`** en nombres críticos (o subir a 3 líneas).
5. **`flex-wrap`** en filas de botones para que bajen de línea en vez de salirse.
6. **`min-h-dvh`** en vez de `h-screen` → evita cortes y saltos con la barra del navegador móvil.
7. **Badges en flujo, no `absolute`** cuando compiten con texto.

---

## 🌟 Lo de MAYOR impacto: "Modo accesible" (un toggle)

Como Tailwind usa `rem`, si subimos el tamaño base de la fuente **todo escala junto y
proporcional** — que es justo lo que evita el descuadre. Propuesta:

- Un botón **A / A+ / A++** (arriba, siempre visible) que cambia `html { font-size }`
  entre 16px / 18px / 20px, guardado en `localStorage`.
- Con eso, tu usuaria pone **A++** una vez y toda la app se ve más grande **sin romperse**
  (una vez migrados los pocos `px` fijos a `rem`).
- Bonus: aumentar también el `line-height` y el `gap` en ese modo.

Este toggle + arreglar los ~5 offenders de altura fija resuelve el 80% del dolor.

---

## 📋 Lista priorizada por pantalla

### P0 — transversal (una vez, beneficia todo)
- [ ] Toggle "Modo accesible" (A/A+/A++) en el layout, persistido.
- [ ] Reemplazar `h-screen` → `min-h-dvh` en las 14 pantallas (evita cortes).
- [ ] Subir botones a `min-h-[44px]` (los `py-1.5`, 7 archivos): tabs de tienda,
      Comprar, Editar, filtros.
- [ ] Reemplazar `grid-cols-2` rígido → grid fluido `auto-fill/minmax`.

### P1 — catálogo y nuevo pedido (lo que más usa el vendedor)
- [ ] `dashboard/catalogo`: quitar `line-clamp-2` del título (o 3 líneas); badge MAN/IND
      en flujo; tarjeta con `min-h` en vez de altura fija; precio/variantes que envuelvan.
- [ ] `dashboard/nuevo-pedido`: inputs con `min-h-[44px]`, `inputMode="numeric"` en
      cantidad/precio (teclado numérico), botones de talla más grandes y con `flex-wrap`.
- [ ] Modales (`max-h-[85vh]`): que el botón de acción quede **sticky abajo** para que no
      se pierda al crecer el contenido.

### P2 — navegación
- [ ] Barra de navegación inferior fija (bottom-nav) con íconos + texto grande, para el
      pulgar; que no dependa de menús pequeños.
- [ ] Estados activos con contraste alto (no solo color tenue gris).

### P3 — pulido
- [ ] Revisar contrastes de `text-gray-500/600` sobre fondo oscuro (bajo el mínimo AA para
      texto chico; con texto grande mejora, pero conviene subir a `gray-300/400`).
- [ ] Íconos/emojis con tamaño en `rem` para que escalen con el modo accesible.

---

## ⏱️ Orden sugerido de implementación
1. **Modo accesible (A/A+/A++)** — el cambio con más retorno para tu usuaria.
2. **`min-h-[44px]` en botones + `flex-wrap`** — arregla el descuadre de acciones.
3. **`h-screen → min-h-dvh`** y **grids fluidos** — arregla cortes y desbordes.
4. **Catálogo/nuevo-pedido** (line-clamp, teclado numérico, modales sticky).
5. **Bottom-nav** y contrastes.

> Nota: todo esto es CSS/estructura, **no toca lógica de negocio**. Se puede hacer pantalla
> por pantalla, testeable, sin riesgo para el flujo actual.
