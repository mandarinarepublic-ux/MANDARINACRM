// Limpieza de la dirección del pedido. La ciudad es un campo aparte
// (`ciudad_pedido`); los borradores viejos traían una línea `CIUDAD: X` dentro
// del texto de la dirección y aquí se quita.
export function direccionSinCiudad(texto) {
  const t = String(texto ?? '').replace(/\r\n?/g, '\n')
  return t
    .split('\n')
    .filter(l => !/^\s*CIUDAD\s*:/i.test(l))
    .join('\n')
    .trim()
}

export function lineasDeTexto(texto) {
  return String(texto ?? '').replace(/\r\n?/g, '\n').split('\n')
}
