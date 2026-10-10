// lib/seguimientoPublico.js
//
// Lo que protege a la página pública /pedido. Puro: sin base, sin red.
//
// La página la abre CUALQUIERA que tenga el celular y el número de pedido. Por
// eso la respuesta se arma aquí, campo por campo, con una lista de lo que SÍ
// sale (nunca «todo menos…»): un campo nuevo en la tabla no se filtra solo.
// Lo que nunca sale: montos, cédula completa, dirección, email, notas.

export const TIENDA_PUBLICA = 'MANDARINA'
export const LIMITE = Object.freeze({ ventanaMin: 15, porIp: 10, fallosPorNumero: 5 })
export const MENSAJE_NO_ENCONTRADO = 'No encontramos ese pedido. Revisa el número de tu hoja y el celular con el que compraste.'
export const MENSAJE_DEMASIADOS = 'Demasiados intentos, prueba en unos minutos.'

export const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '')

const ultimos9 = (cel) => {
  const d = soloDigitos(cel)
  return d.length >= 9 ? d.slice(-9) : ''
}

/** Compara los últimos 9 dígitos. Lo vacío o corto nunca coincide. */
export function celularCoincide(escrito, guardado) {
  const a = ultimos9(escrito)
  return a !== '' && a === ultimos9(guardado)
}

/** "6308", "#6308", "06308" → {numero:'6308'}; "man-jac-6308" → id completo. */
export function normalizarNumero(entrada) {
  const t = String(entrada ?? '').trim().toUpperCase().replace(/^#/, '')
  if (/^[A-Z]+-[A-Z]+-\d+$/.test(t)) return { id: t, numero: t.split('-').pop().replace(/^0+/, '') }
  const numero = soloDigitos(t).replace(/^0+/, '')
  return numero ? { id: null, numero } : null
}

export function pedidoCoincideNumero(pedidoId, n) {
  if (!n || !pedidoId) return false
  if (n.id) return pedidoId === n.id
  return String(pedidoId).split('-').pop().replace(/^0+/, '') === n.numero
}

/** Tapa los 5 dígitos del medio: 1712345321 → 17*****321. */
export function taparCedula(cedula) {
  const c = String(cedula ?? '').trim()
  if (!c) return ''
  if (c.length < 7) return '*'.repeat(c.length)
  const ini = Math.floor((c.length - 5) / 2)
  return `${c.slice(0, ini)}*****${c.slice(ini + 5)}`
}

/** Misma regla que la hoja del PDF del cliente (PdfGraciasPagina). */
export function tieneSaldoPendiente(pedido) {
  if (String(pedido?.estado_pago || '').toUpperCase() === 'PAGADO') return false
  const saldo = (Number(pedido?.monto_total) || 0) - (Number(pedido?.monto_abonado) || 0)
  return saldo >= 0.01
}

const texto = (v) => String(v ?? '').trim()

/** La foto que representa a la prenda: pecho → espalda → mangas (como fotoPrincipal). */
const fotoDe = (i) => i.foto_pecho_url || i.foto_espalda_url || i.foto_manga_d_url || i.foto_manga_i_url || ''

export function armarRespuesta({ pedido, items = [], cliente, guia, etapaInfo }) {
  const nombre = texto(cliente?.nombre)
  return {
    pedidoId: pedido.pedido_id,
    nombre,
    primerNombre: nombre.split(/\s+/)[0] || '',
    celular: soloDigitos(cliente?.celular),
    cedula: taparCedula(cliente?.cedula),
    ciudad: texto(cliente?.ciudad),
    etapa: etapaInfo.etapa,
    fechas: etapaInfo.fechas,
    cancelado: etapaInfo.cancelado,
    guia: etapaInfo.etapa != null && etapaInfo.etapa >= 3 && guia?.numero
      ? { numero: texto(guia.numero), transportista: texto(guia.transportista) }
      : null,
    saldoPendiente: tieneSaldoPendiente(pedido),
    prendas: items.filter((i) => !i.eliminado).map((i) => ({
      nombre: texto(i.producto_nombre),
      color: texto(i.color),
      talla: texto(i.talla),
      cantidad: parseInt(i.cantidad, 10) || 1,
      foto: fotoDe(i),
    })),
  }
}

/** Los conteos son de ANTES de este intento. */
export function decidirLimite({ intentosIp, fallosNumero }) {
  if (intentosIp >= LIMITE.porIp) return 'bloqueado'
  if (fallosNumero >= LIMITE.fallosPorNumero) return 'bloqueado'
  return 'ok'
}

const corta = (v, max) => texto(v).slice(0, max)

/** Lo que se guarda de la promo. Un link que no es https se descarta. */
export function limpiarPromo(body) {
  const b = body || {}
  const link = corta(b.link, 300)
  return {
    activa: b.activa === true || b.activa === 'true',
    etiqueta: corta(b.etiqueta, 60),
    titulo: corta(b.titulo, 80),
    texto: corta(b.texto, 160),
    codigo: corta(b.codigo, 40),
    link: /^https:\/\//i.test(link) ? link : '',
  }
}

export const promoVisible = (p) => Boolean(p?.activa && texto(p?.titulo))
