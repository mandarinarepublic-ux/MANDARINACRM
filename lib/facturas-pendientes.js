// lib/facturas-pendientes.js
// Detector de SILENCIO en la facturación.
//
// El tablero de ERRORES solo sabía de fallas que alguien reportaba: si algo
// lanzaba un error, aparecía. El 28-jul se apagó el escenario de Make que
// emitía las facturas dando por hecho que el CRM tomaba la posta, el CRM no la
// tomó (faltaba DATIL_DIRECTO), y como nadie lanzó ningún error la fila de
// Dátil se quedó EN BLANCO. Un blanco se ve igual que "todo bien": pasaron 13
// días y ~40 pedidos sin que nadie lo notara.
//
// Esto no espera a que algo falle: cuenta los pedidos que PIDIERON factura y no
// la tienen. Si el camino se rompe otra vez —por la razón que sea— el número
// sube solo.
//
// Regla que no se toca: un pedido SIN factura solicitada nunca es un problema.
// Facturar o no es una decisión del negocio, no una falla.

/** Minutos de gracia por defecto: la factura se emite justo después del pedido. */
const GRACIA_POR_DEFECTO = 30

/**
 * @param {Array} pedidos  filas con {pedido_id, fecha_pedido, factura_solicitada, factura_id}
 * @param {object} opts
 * @param {string|Date} opts.desde   fecha de corte: antes de esto no se vigila
 * @param {Date} opts.ahora
 * @param {number} [opts.graciaMinutos]
 * @returns {{total:number, pedidos:Array, desde:string|null}}
 */
export function facturasPendientes(pedidos, { desde, ahora = new Date(), graciaMinutos = GRACIA_POR_DEFECTO } = {}) {
  const corte = desde ? new Date(desde).getTime() : -Infinity
  const limite = ahora.getTime() - graciaMinutos * 60 * 1000

  const encontrados = (pedidos || []).filter((p) => {
    // Una decisión, no una falla: si no se pidió factura, no se mira.
    if (!p?.factura_solicitada) return false
    // Ya facturado. Ojo: Sheets devuelve '' donde Postgres devuelve null.
    if (p.factura_id) return false

    const cuando = new Date(p.fecha_pedido).getTime()
    if (!Number.isFinite(cuando)) return false
    if (cuando < corte) return false      // atrasado de antes: se deja quieto
    if (cuando > limite) return false     // recién creado: aún está en camino
    return true
  })

  // Del más viejo al más nuevo: el primero dice desde cuándo se rompió.
  encontrados.sort((a, b) => new Date(a.fecha_pedido) - new Date(b.fecha_pedido))

  return {
    total: encontrados.length,
    pedidos: encontrados,
    desde: encontrados[0]?.fecha_pedido || null,
  }
}
