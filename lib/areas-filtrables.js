// lib/areas-filtrables.js
//
// Las áreas por las que se puede FILTRAR una bandeja.
//
// ⚠️ NO es `AREAS` de lib/pedidos.js. Esa es la lista de valores que se pueden
// GUARDAR en `detalle_pedido.area`, e incluye las combinaciones
// (`ESTAMPADO + BORDADO`). Filtrar por una combinación no le sirve a nadie:
// quien busca bordado quiere ver TODO lo que lleva bordado, venga solo o
// acompañado.
//
// ☠️ Por eso el filtro se aplica con `ilike '%AREA%'` y NUNCA con `=`. Medido el
// 26-ago-2026 sobre la base: con `=` se perderían 77 pedidos de BORDADO (270 →
// 193) y 75 de ESTAMPADO (393 → 318), en silencio y con la pantalla sana.
//
// Client-safe a propósito: sin imports de servidor, porque la usan la pantalla y
// el repositorio. Una sola lista, no dos — `AREAS` ya se desincronizó entre
// lib/pedidos.js y lib/pedidos-client.js (a `PREMIUM - SIN DISEÑO` le pasó).
export const AREAS_FILTRABLES = [
  // Las tres del taller: mismas que ofrece Producción.
  'ESTAMPADO',
  'BORDADO',
  'SUBLIMACION',
  // Las que no pasan por taller, para consultar lo vendido sin confección.
  'PRODUCTO SIN DISEÑO',
  'PREMIUM - SIN DISEÑO',
  'ENTREGA EN TIENDA',
]

/** ¿Es una de las áreas por las que se deja filtrar? */
export function esAreaFiltrable(area) {
  return AREAS_FILTRABLES.includes(String(area || '').toUpperCase())
}
