// lib/telegram.js
// Notificaciones por Telegram (bot API — gratis). Un solo bot para todo el CRM,
// con distintos chats según el tipo de aviso.
//
// Config (Vercel):
//   TELEGRAM_BOT_TOKEN     - token del bot (@BotFather). El bot debe estar DENTRO
//                            del grupo/chat al que se quiere avisar.
//   TELEGRAM_CHAT_VENTAS   - chat donde llegan las ventas (default: el que se venía
//                            usando en Make).
//   TELEGRAM_CHAT_ERRORES  - chat de alertas de error del tablero de sistema.
//
// Nada de esto rompe la operación: si no hay token, o si falla el envío, se ignora.

// Chat de ventas que venía usándose en Make. Se puede sobreescribir por env.
// Se exporta porque las alertas de error también caen acá cuando no hay un chat
// propio configurado (ver lib/eventos.js).
export const CHAT_VENTAS_DEFAULT = '-5103132453'

/** Envía un mensaje a un chat. No lanza nunca. Devuelve true si se mandó. */
export async function enviarTelegram(chatId, texto, { markdown = true } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId || !texto) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        ...(markdown ? { parse_mode: 'Markdown' } : {}),
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('Telegram sendMessage falló:', res.status, body.slice(0, 200))
      return false
    }
    return true
  } catch (e) {
    console.error('Telegram error:', e?.message || e)
    return false
  }
}

const EMOJI_TIENDA = { MANDARINA: '🍊', INDSTORE: '🏪', YAW: '🟣' }

/**
 * Avisa por Telegram que un vendedor hizo una venta. Fire-and-forget.
 * @param {object} v { pedidoId, tiendaId, vendedor, cliente, monto, prendas }
 */
export async function notificarVenta(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  const emoji = EMOJI_TIENDA[v.tiendaId] || '🛍️'
  const texto =
    `🛒 *Nueva venta* ${emoji}\n` +
    `Pedido: \`${v.pedidoId}\`\n` +
    `Vendedor: *${v.vendedor || '—'}*\n` +
    `Cliente: ${v.cliente || '—'}\n` +
    `Monto: *$${Number(v.monto || 0).toFixed(2)}*` +
    (v.prendas ? `  ·  ${v.prendas} prenda(s)` : '')
  return enviarTelegram(chat, texto)
}

/** Texto aparte de la función que envía, para poder probarlo sin red. */
export function textoPedidoWebSinPagar({ tiendaId, nombre, celular, monto, prendas, urlShopify }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🕐 *Pedido web SIN PAGAR* ${emoji}\n` +
    `Cliente: *${nombre || '—'}*\n` +
    `Celular: \`${celular || '—'}\`\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}* · ${prendas || 0} prenda(s)\n` +
    `Llegó al checkout y no pagó. Escríbele.\n${urlShopify || ''}`
  )
}

export function textoPedidoWebFallido({ tiendaId, orderName, motivo }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🚨 *Pedido web NO entró al CRM* ${emoji}\n` +
    `Shopify: *${orderName || '—'}*\n` +
    `Motivo: \`${motivo || 'desconocido'}\`\n` +
    `Hay que cargarlo a mano.`
  )
}

/**
 * Un pedido que NACIÓ sin pagar y después alguien lo marcó pagado en Shopify.
 * No se crea solo: el vendedor ya tiene el aviso en el inbox y lo carga a mano.
 */
export function textoPedidoWebPagadoDespues({ tiendaId, orderName, cliente, monto }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `💵 *Pedido web marcado PAGADO en Shopify* ${emoji}\n` +
    `Shopify: *${orderName || '—'}*\n` +
    `Cliente: ${cliente || '—'}\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}*\n` +
    `Nació sin pagar, así que NO entró solo al CRM. ` +
    `Si el vendedor no lo cargó con Pedido manual, hay que cargarlo.`
  )
}

export async function notificarPedidoWebPagadoDespues(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebPagadoDespues(v))
}

export async function notificarPedidoWebSinPagar(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebSinPagar(v))
}

export async function notificarPedidoWebFallido(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebFallido(v))
}

/**
 * Aviso PROPIO del webhook cuando un pedido web se crea con éxito.
 *
 * `/api/pedidos` ya manda `notificarVenta()` en cada alta, pero sin `await`
 * (fire-and-forget): en serverless la función se congela apenas responde y
 * ese mensaje se puede perder — justo el problema que este proyecto vino a
 * resolver. El webhook manda este ADEMÁS, con `await`, antes de responder.
 * Sí, puede llegar un mensaje doble por la misma venta: un aviso de más es
 * infinitamente mejor que una venta de la que nadie se entera.
 */
export function textoPedidoWebCreado({ tiendaId, pedidoId, cliente, monto, prendas }) {
  const emoji = EMOJI_TIENDA[tiendaId] || '🛍️'
  return (
    `🛒 *Venta web* ${emoji}\n` +
    `Pedido: \`${pedidoId || '—'}\`\n` +
    `Cliente: ${cliente || '—'}\n` +
    `Monto: *$${Number(monto || 0).toFixed(2)}* · ${prendas || 0} prenda(s)\n` +
    `Entró solo desde la tienda web. Falta completarle la cédula.`
  )
}

export async function notificarPedidoWebCreado(v) {
  const chat = process.env.TELEGRAM_CHAT_VENTAS || CHAT_VENTAS_DEFAULT
  return enviarTelegram(chat, textoPedidoWebCreado(v))
}

// ─── Guía de despacho ────────────────────────────────────────────────────────
//
// Cuando Despacho registra una guía, llega al grupo de alarmas la FOTO de la
// guía con el detalle del pedido, para que quede constancia en el chat de qué
// salió, a quién y con qué transportista, sin tener que abrir el CRM.
//
// Va en HTML y no en Markdown a propósito: los nombres de clientes y productos
// traen `_`, `*` o `[` (p. ej. "HOODIE_OVERSIZE"), y con Markdown Telegram
// responde 400 y el aviso se pierde entero. En HTML basta con escapar < > &.

// El pie de una foto admite como mucho 1024 caracteres. Si el detalle no cabe,
// la foto sale con un pie corto y el detalle completo va en un mensaje aparte.
const TOPE_CAPTION = 1024
const TOPE_MENSAJE = 4096

/**
 * Chat del grupo de alarmas: el mismo al que caen las alertas de lib/eventos.js.
 * TELEGRAM_CHAT_GUIAS permite mandarlas a otro grupo si algún día se quiere.
 */
export function chatAlarmas() {
  return process.env.TELEGRAM_CHAT_GUIAS
      || process.env.TELEGRAM_CHAT_ERRORES
      || process.env.TELEGRAM_CHAT_VENTAS
      || CHAT_VENTAS_DEFAULT
}

export function escaparHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const dinero = n => `$${(Number(n) || 0).toFixed(2)}`

/** Cabecera corta: lo que tiene que caber SIEMPRE en el pie de la foto. */
export function cabeceraGuia({ pedido = {}, guia = {} } = {}) {
  const e = escaparHtml
  const emoji = EMOJI_TIENDA[pedido.TIENDA_ID] || '🛍️'
  return (
    `📦 <b>Guía registrada</b> ${emoji}\n` +
    `Pedido: <code>${e(pedido.PEDIDO_ID || '—')}</code>\n` +
    `Guía: <b>${e(guia.transportista || 'SERVIENTREGA')} #${e(guia.numero || '—')}</b>`
  )
}

/**
 * Texto completo del aviso de guía: cabecera + cliente + prendas + montos.
 * @param {object} a
 * @param {object} a.pedido  pedido con join (getPedidoById): items, CLIENTE_*, montos
 * @param {object} a.guia    { numero, transportista, registradoPor, sinFoto }
 * @param {string} [a.baseUrl]
 */
export function textoGuiaDespachada({ pedido = {}, guia = {}, baseUrl } = {}) {
  const e = escaparHtml
  const lineas = [cabeceraGuia({ pedido, guia }), '']

  lineas.push(`👤 Cliente: <b>${e(pedido.CLIENTE_NOMBRE || '—')}</b>`)
  if (pedido.CLIENTE_CELULAR) lineas.push(`📱 ${e(pedido.CLIENTE_CELULAR)}`)
  const destino = [pedido.CIUDAD_PEDIDO, pedido.DIRECCION_PEDIDO || pedido.DIRECCION_TEXTO].filter(Boolean).join(' · ')
  if (destino) lineas.push(`📍 ${e(destino)}`)

  const items = Array.isArray(pedido.items) ? pedido.items : []
  if (items.length) {
    lineas.push('', `<b>Detalle (${items.length} ítem${items.length === 1 ? '' : 's'}):</b>`)
    for (const it of items) {
      const cant = Number(it.CANTIDAD) || 1
      const extras = [it.TALLA && `T. ${it.TALLA}`, it.COLOR].filter(Boolean).join(' · ')
      let l = `• ${cant}× ${e(it.PRODUCTO_NOMBRE || 'Prenda')}`
      if (extras) l += ` (${e(extras)})`
      const sub = Number(it.SUBTOTAL) || (Number(it.PRECIO_UNIT) || 0) * cant
      if (sub > 0) l += ` — ${dinero(sub)}`
      lineas.push(l)
      if (it.DETALLE_PERSONALIZADO) lineas.push(`   <i>${e(String(it.DETALLE_PERSONALIZADO).slice(0, 150))}</i>`)
    }
  }

  lineas.push('', `💰 Total: <b>${dinero(pedido.MONTO_TOTAL)}</b> · Abonado: ${dinero(pedido.MONTO_ABONADO)}`)
  const pendiente = Number(pedido.MONTO_PENDIENTE) || 0
  if (pendiente > 0.01) lineas.push(`⚠️ <b>Pendiente de cobro: ${dinero(pendiente)}</b>`)

  if (guia.registradoPor) lineas.push(`🧑‍💼 Despachó: ${e(guia.registradoPor)}`)
  if (guia.sinFoto) lineas.push('📷 <i>Sin foto de la guía.</i>')
  if (baseUrl && pedido.PEDIDO_ID) {
    lineas.push(`🔗 ${e(`${baseUrl.replace(/\/$/, '')}/dashboard/pedido/${encodeURIComponent(pedido.PEDIDO_ID)}`)}`)
  }

  // Recortar por líneas enteras: cortar a mitad de una etiqueta <b> hace que
  // Telegram rechace el mensaje completo.
  let texto = lineas.join('\n')
  while (texto.length > TOPE_MENSAJE - 60 && lineas.length > 4) {
    lineas.splice(-2, 1)
    texto = lineas.join('\n') + '\n…'
  }
  return texto
}

async function llamarTelegram(metodo, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`Telegram ${metodo} falló:`, res.status, body.slice(0, 200))
      return false
    }
    return true
  } catch (err) {
    console.error(`Telegram ${metodo} error:`, err?.message || err)
    return false
  }
}

/**
 * Manda al grupo de alarmas la foto de la guía + el detalle del pedido.
 * No lanza nunca. Si la foto no se puede mandar (no hay foto, o Telegram no
 * logra bajarla), el detalle sale igual como mensaje de texto.
 */
export async function notificarGuiaDespachada({ pedido, guia = {}, fotoUrl, baseUrl } = {}) {
  const chat = chatAlarmas()
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return false
  const base = baseUrl || process.env.CRM_URL_PUBLICA || 'https://crm.apps.mandarinaec.com'
  const texto = textoGuiaDespachada({ pedido, guia: { ...guia, sinFoto: !fotoUrl }, baseUrl: base })
  const mensaje = text => llamarTelegram('sendMessage', {
    chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true,
  })

  if (!fotoUrl) return mensaje(texto)

  const cabe = texto.length <= TOPE_CAPTION
  const fotoOk = await llamarTelegram('sendPhoto', {
    chat_id: chat,
    photo: fotoUrl,
    caption: cabe ? texto : cabeceraGuia({ pedido, guia }),
    parse_mode: 'HTML',
  })
  if (fotoOk) return cabe ? true : mensaje(texto)
  // La foto falló: que al menos llegue el detalle, con el enlace a la foto.
  return mensaje(`${texto}\n📷 Foto: ${escaparHtml(fotoUrl)}`)
}
