import { readSheet, appendRow, fechaAhora } from '@/lib/sheets'

// Subestados válidos por ítem
export const SUBESTADOS = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', 'ELIMINADO', 'ENTREGADO_TIENDA']

// Áreas de producción
export const AREAS = [
  'ESTAMPADO',
  'SUBLIMACION', 
  'BORDADO',
  'ESTAMPADO + SUBLIMACION',
  'ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO',
  'ESTAMPADO + SUBLIMACION + BORDADO',
  'PRODUCTO SIN DISEÑO',
  'ENTREGA EN TIENDA',
]

// Qué subestado inicial tiene un ítem según su área
export function subestadoInicial(area) {
  if (area === 'ENTREGA EN TIENDA') return 'ENTREGADO_TIENDA'
  return 'SOLICITADO'
}

// Si un área aplica a un rol de producción
export function areaAplica(area, rol) {
  if (!area) return false
  if (rol === 'ESTAMPADO') return area.includes('ESTAMPADO')
  if (rol === 'SUBLIMACION') return area.includes('SUBLIMACION')
  if (rol === 'BORDADO') return area.includes('BORDADO')
  return true
}

// Generate pedido ID
export async function generatePedidoId(tiendaId, vendedorCodigo) {
  const prefix = tiendaId === 'MANDARINA' ? 'MAN' : 'IND'
  const code = (vendedorCodigo || 'GEN').slice(0, 3).toUpperCase()
  const pedidos = await readSheet('PEDIDOS')
  const nums = pedidos
    .map(p => parseInt((p.PEDIDO_ID || '').split('-').pop()))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 2400
  return `${prefix}-${code}-${next}`
}

export async function generateItemId(pedidoId, index) {
  const parts = pedidoId.split('-')
  return `${parts[1]}-${pedidoId}-${String(index).padStart(2, '0')}`
}

export function calcularDiasEntrega(areas) {
  const all = areas.join(' ')
  let dias = 3
  if (all.includes('BORDADO')) dias = Math.max(dias, 5)
  if (all.includes('SUBLIMACION')) dias = Math.max(dias, 4)
  if (all.includes('ESTAMPADO') && all.includes('SUBLIMACION')) dias = Math.max(dias, 6)
  if (all.includes('BORDADO') && all.includes('SUBLIMACION')) dias = Math.max(dias, 7)
  return dias
}

// Add N business days (Mon-Fri) to a date, skipping weekends
export function addBusinessDays(date, days) {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++ // skip Sunday=0, Saturday=6
  }
  return result
}

// Format date as YYYY-MM-DD for input[type=date]
export function formatDateInput(date) {
  return date.toISOString().split('T')[0]
}

// Log a change to LOGS sheet
export async function logCambio(pedidoId, campo, valorAntes, valorDespues, usuarioId) {
  try {
    await appendRow('LOGS_PEDIDOS', [
      pedidoId, fechaAhora(), usuarioId || 'SISTEMA', campo,
      String(valorAntes || ''), String(valorDespues || ''),
    ])
  } catch(e) {
    console.error('Log error:', e.message)
  }
}
