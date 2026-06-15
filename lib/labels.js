export const ESTADO_LABELS = {
  PENDIENTE_FABRICA: 'Pend. Fábrica',
  EN_FABRICA:        'En Producción',
  DESPACHO:          'En Despacho',
  COMPLETADO:        'Completado',
  ENTREGADO:         'Entregado',
  CANCELADO:         'Cancelado',
}

export const ESTADO_LABELS_LARGO = {
  PENDIENTE_FABRICA: 'Pendiente enviar a fábrica',
  EN_FABRICA:        'En Producción',
  DESPACHO:          'En Despacho',
  COMPLETADO:        'Completado',
  ENTREGADO:         'Entregado',
  CANCELADO:         'Cancelado',
}

export const ESTADO_COLORS = {
  PENDIENTE_FABRICA: 'text-yellow-400 bg-yellow-500/10',
  EN_FABRICA:        'text-blue-400 bg-blue-500/10',
  DESPACHO:          'text-purple-400 bg-purple-500/10',
  COMPLETADO:        'text-green-400 bg-green-500/10',
  ENTREGADO:         'text-green-400 bg-green-500/10',
  CANCELADO:         'text-gray-400 bg-gray-500/10',
}

export const SUBESTADO_LABELS = {
  SOLICITADO:         '⏳ Solicitado',
  EN_PROCESO:         '🔧 En proceso',
  ENVIADO_APROBACION: '📤 Enviado aprobación',
  LISTO:              '✅ Listo',
  ENTREGADO_TIENDA:   '🏪 Entregado en tienda',
  ELIMINADO:          '❌ Eliminado',
}

export const SUBESTADO_COLORS = {
  SOLICITADO:         'text-yellow-400 bg-yellow-500/20',
  EN_PROCESO:         'text-blue-400 bg-blue-500/20',
  ENVIADO_APROBACION: 'text-purple-400 bg-purple-500/20',
  LISTO:              'text-green-400 bg-green-500/20',
  ENTREGADO_TIENDA:   'text-gray-400 bg-gray-500/20',
  ELIMINADO:          'text-red-400 bg-red-500/20',
}

export const SUBESTADO_BG = {
  SOLICITADO:         'bg-yellow-500',
  EN_PROCESO:         'bg-blue-500',
  ENVIADO_APROBACION: 'bg-purple-500',
  LISTO:              'bg-green-500',
  ENTREGADO_TIENDA:   'bg-gray-500',
}
