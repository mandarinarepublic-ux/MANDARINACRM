// lib/alerta-texto.js
// Arma el texto de la alerta de error que va por Telegram.
//
// Vive aparte de lib/eventos.js para poder probarlo: es lo único de la alerta
// que tiene reglas propias, y son reglas que importan.
//
// La alerta cae en el MISMO chat donde llegan las ventas. Si se parece a una
// venta se pierde entre ellas, así que arranca diciendo que NO lo es. Y lleva
// el motivo real más el enlace al pedido: una alerta que solo dice "algo falló"
// obliga a ir a bucear igual, y entonces no ahorró nada.

const FUENTES = {
  meta:     { icono: '📊', nombre: 'Meta / pauta' },
  datil:    { icono: '🧾', nombre: 'Dátil (factura)' },
  supabase: { icono: '🗄️', nombre: 'Base de datos' },
  webhook:  { icono: '🔗', nombre: 'Webhooks' },
}

// Telegram rechaza con 400 los mensajes de más de 4096 caracteres: pasarse
// significa perder la alerta ENTERA. Se recorta el motivo, nunca el pedido.
const TOPE_TELEGRAM = 4096

export function textoAlerta({ fuente, mensaje, pedidoId, baseUrl } = {}) {
  const f = FUENTES[fuente] || { icono: '⚠️', nombre: String(fuente || 'sistema') }

  const cabecera =
    `🚨 *ALERTA — no es una venta*\n` +
    `Falló ${f.icono} ${f.nombre}\n\n` +
    (pedidoId ? `Pedido: \`${pedidoId}\`\n` : '')

  const pie = pedidoId && baseUrl ? `\n\n${baseUrl}/dashboard/pedido/${pedidoId}` : ''

  const espacio = TOPE_TELEGRAM - cabecera.length - pie.length
  const motivo = String(mensaje || 'sin detalle')
  const recortado = motivo.length > espacio ? motivo.slice(0, Math.max(0, espacio - 1)) + '…' : motivo

  return cabecera + recortado + pie
}
