// 📱 Botón WA del pedido (27-nov-2026): texto + foto de la hoja del cliente.
//
// Un link wa.me SOLO lleva texto, nunca una foto. Por eso la foto viaja aparte:
//  - Celular: se comparte con el menú del teléfono (foto + texto juntos).
//  - Computadora: la foto se copia al portapapeles y se abre WhatsApp con el
//    texto ya escrito; allá se pega con Ctrl+V y el texto queda como pie de foto.
// Aquí vive lo puro (texto y número) para poder probarlo sin navegador.

export function numeroWhatsapp(celular) {
  const cel = String(celular ?? '').replace(/\D/g, '')
  if (!cel) return ''
  if (cel.startsWith('593')) return cel
  return '593' + (cel.startsWith('0') ? cel.slice(1) : cel)
}

export function mensajeWhatsappPedido({ cliente, pedido } = {}) {
  const nombre = String(cliente?.NOMBRE || '').trim()
  const total = parseFloat(pedido?.MONTO_TOTAL || 0)
  return (
    `Hola${nombre ? ` ${nombre}` : ''} 👋\n\n` +
    `¡Tu pedido *${pedido?.PEDIDO_ID || ''}* ha sido registrado! 🎉\n\n` +
    `📎 Te adjuntamos la hoja de tu pedido para tu revisión: dirección de envío, ` +
    `tus datos, tallas y diseño. Si algo no está bien, avísanos por aquí antes de ` +
    `que entre a producción 🙌\n\n` +
    `💰 Total: $${(Number.isFinite(total) ? total : 0).toFixed(2)}\n\n` +
    `Gracias por tu compra 🍊`
  )
}

export function urlWhatsapp(numero, texto) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

// dataURL (JPG de la hoja) → Blob con el tipo pedido. El portapapeles de los
// navegadores solo acepta PNG, por eso se puede redibujar en otro formato.
export async function dataUrlABlob(dataUrl, tipo = 'image/jpeg') {
  const original = await (await fetch(dataUrl)).blob()
  if (original.type === tipo) return original
  const bmp = await createImageBitmap(original)
  const c = document.createElement('canvas')
  c.width = bmp.width; c.height = bmp.height
  c.getContext('2d').drawImage(bmp, 0, 0)
  bmp.close?.()
  try {
    return await new Promise((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo convertir la foto'))), tipo))
  } finally { c.width = 1; c.height = 1 }
}
