// ¿Esta venta se le reporta a Meta como Purchase (CAPI)?
// PURO: vive aparte de lib/metaCapi.js para poder probarlo con node --test.
//
// · YAW no pauta en Meta (lib/metaCapi.js → debeEnviarCapi).
// · ☠️ Un pedido de $0 NO es una compra: son los canjes del club de premios
//   (14-oct-2026). Reportarlos como Purchase de $0 le enseña a Meta a buscar
//   gente que "compra" sin pagar y baja el valor promedio de la pauta.

export function esCompraParaMeta(tiendaId, montoTotal) {
  if (String(tiendaId || '').trim().toUpperCase() === 'YAW') return false
  return Number(montoTotal) > 0
}
