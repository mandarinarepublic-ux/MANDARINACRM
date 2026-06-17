/**
 * Helper de búsqueda universal para pedidos.
 * Permite encontrar un pedido por: número de pedido, nombre del cliente,
 * cédula o número de celular — sin importar espacios, guiones o mayúsculas.
 *
 * Uso: pedidos.filter(p => coincideBusqueda(p, busqueda))
 */
export function coincideBusqueda(p, busqueda) {
  if (!busqueda) return true
  const q = normalizar(busqueda)

  const campos = [
    p.PEDIDO_ID,
    p.CLIENTE_NOMBRE,
    p.CLIENTE_CEDULA,
    p.CLIENTE_CELULAR,
    // Fallback por compatibilidad con datos antiguos que no tengan el join
    p.CLIENTE_ID,
  ]

  return campos.some(campo => campo && normalizar(campo).includes(q))
}

function normalizar(valor) {
  return String(valor)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[\s\-]/g, '') // quita espacios y guiones (útil para cédula/celular)
}
