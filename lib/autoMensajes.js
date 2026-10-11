// lib/autoMensajes.js
//
// AUTO: los mensajes informativos que se mandarán al cliente cuando su pedido
// cambia de etapa. Puro: sin base, sin red, sin '@/'.
//
// Las etapas son las de lib/etapaCliente.js (las mismas de la página pública
// /pedido): si cambia la regla allá, el diagrama de AUTO cambia con ella.
// Cada mensaje se prende y apaga POR SU CUENTA, por tienda. No hay interruptor
// general (decisión de Rodrigo, 10-oct-2026). Todos nacen apagados.

import { ETAPAS_CLIENTE } from './etapaCliente.js'

export const TIENDAS_AUTO = Object.freeze(['mandarina', 'ind'])
export const TEXTO_MAX = 1000

/** Qué estados del CRM llevan el pedido a cada etapa (resumen de calcularEtapa). */
export const DISPARADORES = Object.freeze([
  ['Se crea el pedido en el CRM (cualquier estado)'],
  ['Se imprime la hoja para producción', 'Un área queda ENVIADO_APROBACION (arte mandado al cliente)'],
  ['Se corta (CORTADO)', 'Un área queda EN_PROCESO o LISTO', 'El pedido pasa a DESPACHO'],
  ['El pedido queda COMPLETADO', 'O se le carga guía de despacho (aunque no esté cerrado)'],
  ['El pedido queda ENTREGADO', 'O pasan 24 h desde Tránsito'],
])

export const VARIABLES = Object.freeze([
  ['{nombre}', 'primer nombre del cliente'],
  ['{pedido}', 'número de pedido, p. ej. MAN-JAC-6308'],
  ['{guia}', 'transportista y número de guía (solo Tránsito)'],
  ['{link}', 'la página de seguimiento de la tienda'],
])

export const REGLAS = Object.freeze([
  'Máximo 1 mensaje por día por cliente: si el pedido avanza dos etapas el mismo día, va solo la más avanzada.',
  'Cada etapa se manda una sola vez por pedido.',
  'Un pedido CANCELADO no recibe nada.',
  'Si el cliente escribió en las últimas 24 h (7 días si vino por pauta) va el texto con su imagen o audio. Si no, Meta solo deja mandar la plantilla aprobada con imagen: el audio no sale.',
])

const TEXTOS_BASE = [
  'Hola {nombre}, recibimos tu pedido {pedido} 🙌 Puedes seguirlo aquí: {link}',
  'Hola {nombre}, ya estamos preparando el diseño de tu pedido {pedido} ✏️',
  'Hola {nombre}, tu pedido {pedido} ya está en producción ✂️',
  'Hola {nombre}, tu pedido {pedido} va en camino 🚚 {guia}',
  '¡Hola {nombre}! Tu pedido {pedido} fue entregado. Gracias por confiar en {tienda} 🧡',
]

const NOMBRE_TIENDA = { mandarina: 'Mandarina', ind: 'Ind Store' }

export const textoPorDefecto = (tienda, etapa) =>
  (TEXTOS_BASE[etapa] || '').replace('{tienda}', NOMBRE_TIENDA[tienda] || 'Mandarina')

/** Las 5 tarjetas de una tienda: lo guardado encima de los valores por defecto. */
export function armarPanel(tienda, filas = []) {
  return ETAPAS_CLIENTE.map((e, etapa) => {
    const f = filas.find((x) => x.tienda === tienda && Number(x.etapa) === etapa)
    return {
      tienda,
      etapa,
      nombre: e.nombre,
      disparadores: DISPARADORES[etapa],
      activo: f ? f.activo === true : false,
      texto: f && f.texto ? f.texto : textoPorDefecto(tienda, etapa),
      media_url: f?.media_url || null,
      media_tipo: f?.media_tipo || null,
      actualizado_en: f?.actualizado_en || null,
      actualizado_por: f?.actualizado_por || null,
    }
  })
}

/** Valida lo que llega del panel. Devuelve { valor } o { error }. Nunca lanza. */
export function limpiarMensaje(body) {
  const b = body || {}
  const tienda = String(b.tienda || '')
  if (!TIENDAS_AUTO.includes(tienda)) return { error: 'Tienda inválida' }
  const etapa = Number(b.etapa)
  if (!Number.isInteger(etapa) || etapa < 0 || etapa >= ETAPAS_CLIENTE.length) return { error: 'Etapa inválida' }
  const texto = String(b.texto ?? '').trim()
  if (!texto) return { error: 'El mensaje no puede quedar vacío' }
  if (texto.length > TEXTO_MAX) return { error: `El mensaje pasa de ${TEXTO_MAX} caracteres` }
  const url = String(b.media_url || '').trim()
  const tipo = url ? String(b.media_tipo || '') : ''
  if (url && !/^https:\/\//i.test(url)) return { error: 'El adjunto debe ser un enlace https' }
  if (url && !['imagen', 'audio'].includes(tipo)) return { error: 'El adjunto debe ser imagen o audio' }
  return {
    valor: {
      tienda, etapa,
      activo: b.activo === true,
      texto,
      media_url: url || null,
      media_tipo: tipo || null,
    },
  }
}

/** Vista previa: cambia las variables por datos de ejemplo. */
export function rellenar(texto, datos = {}) {
  return String(texto || '').replace(/\{(nombre|pedido|guia|link)\}/g, (m, k) => datos[k] ?? m)
}
