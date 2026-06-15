import { readSheet, appendRow, fechaAhora } from '@/lib/sheets'

export const SUBESTADOS = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', 'ELIMINADO', 'ENTREGADO_TIENDA']

export const AREAS = [
  'ESTAMPADO', 'SUBLIMACION', 'BORDADO',
  'ESTAMPADO + SUBLIMACION', 'ESTAMPADO + BORDADO', 'SUBLIMACION + BORDADO',
  'ESTAMPADO + SUBLIMACION + BORDADO',
  'PREMIUM - SIN DISEÑO', 'PRODUCTO SIN DISEÑO', 'ENTREGA EN TIENDA',
]

export function subestadoInicial(area) {
  if (area === 'ENTREGA EN TIENDA') return 'ENTREGADO_TIENDA'
  return 'SOLICITADO'
}

export function areaAplica(area, rol) {
  if (!area) return false
  if (rol === 'ESTAMPADO') return area.includes('ESTAMPADO')
  if (rol === 'SUBLIMACION') return area.includes('SUBLIMACION')
  if (rol === 'BORDADO') return area.includes('BORDADO')
  return true
}

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

export function addBusinessDays(date, days) {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

export function formatDateInput(date) {
  return date.toISOString().split('T')[0]
}

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

// Lee días mínimos desde la hoja DIAS_ENTREGA del Sheet
export async function calcularDiasEntregaDesdeSheet(areas) {
  try {
    const tabla = await readSheet('DIAS_ENTREGA')
    const areasLimpias = areas
      .filter(a => a && a !== 'ENTREGA EN TIENDA' && a !== 'PRODUCTO SIN DISEÑO' && a !== 'PREMIUM - SIN DISEÑO')
      .map(a => a.replace(/\s*\+\s*/g, '+').toUpperCase())
    const areasBase = [...new Set(areasLimpias.flatMap(a => a.split('+').map(x => x.trim())))].sort()
    const combinacion = areasBase.join('+')
    const exacta = tabla.find(r =>
      r.AREA_COMBINACION?.replace(/\s/g,'').toUpperCase() === combinacion.replace(/\s/g,'')
    )
    if (exacta) return parseInt(exacta.DIAS_MINIMOS) || 3
    if (areasBase.length > 1) {
      const todas = tabla.find(r => r.AREA_COMBINACION?.toUpperCase() === 'TODAS')
      if (todas) return parseInt(todas.DIAS_MINIMOS) || 3
    }
    let maxDias = 3
    for (const area of areasBase) {
      const fila = tabla.find(r => r.AREA_COMBINACION?.toUpperCase() === area)
      if (fila) maxDias = Math.max(maxDias, parseInt(fila.DIAS_MINIMOS) || 3)
    }
    return maxDias
  } catch(e) {
    console.error('Error leyendo DIAS_ENTREGA:', e.message)
    return calcularDiasEntrega(areas)
  }
}
