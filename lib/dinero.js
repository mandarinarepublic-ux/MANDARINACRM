// Cómo se escribe la plata en pantalla.
//
// POR QUÉ EXISTE: el panel de Inicio pintaba `$${x.toFixed(0)}` → "$12345",
// sin separador de miles, mientras el Reporte de pagos ya escribía "$12.345,00"
// con `toLocaleString('es-EC')`. Dos pantallas del mismo CRM escribiendo el
// mismo número de dos formas distintas hacen dudar de cuál está bien.
//
// La REFERENCIA es app/dashboard/reporte-pagos/page.js (`money`): mismo locale
// es-EC (punto de miles, coma decimal) y mismo "$" pegado delante. Si algún día
// cambia allá, se cambia aquí y no al revés.
//
// Solo PRESENTACIÓN: no redondea datos que se guarden ni que viajen a una API, y
// NO se usa en los PDF (esos tienen su propio formato).
//
// `decimales`: 0 para tarjetas/KPI (lo que ya mostraba Inicio), 2 para montos
// exactos. Algo que no es número (null, '', 'abc') se escribe como $0, que es
// lo mismo que hacía `Number(n) || 0` en la referencia.
export function formatoUSD(n, { decimales = 2 } = {}) {
  const valor = Number(n) || 0
  return `$${valor.toLocaleString('es-EC', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`
}
