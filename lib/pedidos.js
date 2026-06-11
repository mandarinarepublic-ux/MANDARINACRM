import { readSheet } from './sheets'

export async function generatePedidoId(tiendaId, vendedorCodigo) {
  const pedidos = await readSheet('PEDIDOS')
  const prefijo = tiendaId === 'MANDARINA' ? 'MAN' : 'IND'
  // Find highest number for this prefix
  const nums = pedidos
    .map(p => p.PEDIDO_ID)
    .filter(id => id?.startsWith(prefijo))
    .map(id => parseInt(id.split('-')[2]) || 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefijo}-${vendedorCodigo}-${String(next).padStart(4, '0')}`
}

export async function generateItemId(pedidoId, index) {
  return `BCD-${pedidoId}-${String(index).padStart(2, '0')}`
}

export function calcularDiasEntrega(areas) {
  const combos = {
    'ESTAMPADO': 3,
    'SUBLIMACION': 4,
    'BORDADO': 5,
    'ESTAMPADO,SUBLIMACION': 6,
    'ESTAMPADO,BORDADO': 6,
    'SUBLIMACION,BORDADO': 7,
    'ESTAMPADO,SUBLIMACION,BORDADO': 8,
  }
  const key = [...new Set(areas)].sort().join(',')
  return combos[key] || 4
}

export function calcularFechaEntrega(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().split('T')[0]
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}
