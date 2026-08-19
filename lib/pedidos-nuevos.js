// lib/pedidos-nuevos.js
//
// Qué pedidos son NUEVOS desde la última vez que se miró, y a quién le importan.
//
// ☠️ ANTES el hook ordenaba con `b.PEDIDO_ID.localeCompare(a.PEDIDO_ID)` sobre
// el texto completo (`MAN-AND-5677`). Eso ordena primero por TIENDA, después por
// VENDEDOR, y solo al final por el número — y encima como texto, así que el 999
// queda por encima del 1000.
//
// O sea que "el más reciente" era el del prefijo más alto del abecedario, no el
// último en entrar: `MAN-JAC-5677` iba DESPUÉS de `IND-YAW-5679`. Con un pedido
// nuevo de prefijo menor, el máximo no cambiaba y no se avisaba a nadie.
// Medido el 18-ago-2026: 509 de 531 pedidos nunca dispararon aviso — 96%.
//
// Ahora se compara `UNIQUE_ID`, que es un número y solo sabe crecer.

/** Convierte a número; lo que no lo sea queda fuera en vez de romper el orden. */
function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los pedidos con número mayor al último visto.
 *
 * No se usa "¿cambió el más reciente?" con un `break`: si por lo que sea el
 * último visto ya no está en la lista (se canceló, salió de fábrica), el `break`
 * nunca ocurría y se re-anunciaban pedidos viejos. Un `filter` por número no
 * tiene ese problema.
 *
 * @param {{UNIQUE_ID:number}[]} pedidos
 * @param {number|null} ultimoVisto  null = primera carga, no se avisa nada
 * @returns {{nuevos:object[], ultimo:number|null}}
 */
export function detectarNuevos(pedidos, ultimoVisto) {
  const lista = (Array.isArray(pedidos) ? pedidos : [])
    .map((p) => ({ p, n: num(p?.UNIQUE_ID) }))
    .filter((x) => x.n !== null)
    .sort((a, b) => b.n - a.n);

  if (lista.length === 0) return { nuevos: [], ultimo: ultimoVisto ?? null };

  const ultimo = lista[0].n;

  // Primera carga: solo se toma referencia. Avisar aquí llenaría la pantalla de
  // toasts de pedidos que ya estaban ahí al abrir.
  if (ultimoVisto === null || ultimoVisto === undefined) return { nuevos: [], ultimo };

  return { nuevos: lista.filter((x) => x.n > ultimoVisto).map((x) => x.p), ultimo };
}

/**
 * ¿Este pedido le interesa a quien está mirando?
 *
 * ADMIN, CORTE y DISEÑO ven todo. Los de área solo lo suyo — igual que en la
 * bandeja de Producción.
 */
export function esRelevante(pedido, user) {
  const rol = String(user?.rol ?? '').toUpperCase();
  if (['ADMIN', 'CORTE', 'DISEÑO'].includes(rol)) return true;

  const areas = (pedido?.items || []).map((i) => String(i?.AREA ?? '').toUpperCase());
  if (['BORDADO', 'ESTAMPADO', 'SUBLIMACION'].includes(rol)) {
    return areas.some((a) => a.includes(rol));
  }

  const suyas = (Array.isArray(user?.areas) ? user.areas : [])
    .map((a) => String(a ?? '').trim().toUpperCase())
    .filter(Boolean);
  return suyas.some((mia) => areas.some((a) => a.includes(mia)));
}
