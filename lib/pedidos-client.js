// Client-safe constants - NO server imports here
export const SUBESTADOS = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', 'ELIMINADO', 'ENTREGADO_TIENDA']

export const AREAS = [
  'ESTAMPADO', 'SUBLIMACION', 'BORDADO',
  'ESTAMPADO + SUBLIMACION', 'ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO', 'ESTAMPADO + SUBLIMACION + BORDADO',
  'PRODUCTO SIN DISEÑO', 'ENTREGA EN TIENDA',
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
