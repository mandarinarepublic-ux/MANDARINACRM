// ─── helpers para subestado multi-área ───────────────────────────────────────
// Formato en Sheet: "ESTAMPADO:LISTO|BORDADO:EN_PROCESO"
// Si es área simple (sin |): "LISTO" (compatibilidad con pedidos viejos)

const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

// Extraer las áreas base de un string de área combinada
// "ESTAMPADO + BORDADO" → ['ESTAMPADO', 'BORDADO']
function areasDelItem(areaStr) {
  if (!areaStr) return []
  const partes = areaStr.split(/\s*\+\s*|\s*,\s*/).map(a => a.trim().toUpperCase())
  return partes.filter(a => AREAS_BASE.includes(a))
}

// Parsear el campo SUBESTADO del Sheet → objeto {ESTAMPADO: 'LISTO', BORDADO: 'EN_PROCESO'}
// Si es formato simple "LISTO" → todas las áreas del ítem tienen ese valor
export function parseSubestados(subestadoStr, areaStr) {
  if (!subestadoStr) return {}
  const areas = areasDelItem(areaStr)

  // Formato multi: "ESTAMPADO:LISTO|BORDADO:EN_PROCESO"
  if (subestadoStr.includes(':')) {
    const result = {}
    subestadoStr.split('|').forEach(part => {
      const [area, estado] = part.split(':')
      if (area && estado) result[area.trim()] = estado.trim()
    })
    return result
  }

  // Formato simple (pedidos viejos): aplicar a todas las áreas
  if (areas.length === 0) return { _simple: subestadoStr }
  const result = {}
  areas.forEach(a => result[a] = subestadoStr)
  return result
}

// Serializar objeto → string para guardar en Sheet
export function serializeSubestados(obj) {
  const entries = Object.entries(obj).filter(([k]) => k !== '_simple')
  if (entries.length === 0) return obj._simple || 'SOLICITADO'
  if (entries.length === 1) {
    // Si solo hay un área, guardar simple para compatibilidad
    return entries[0][1]
  }
  return entries.map(([k, v]) => `${k}:${v}`).join('|')
}

// Estado "global" del ítem: el PEOR de todos los subestados
// SOLICITADO < EN_PROCESO < ENVIADO_APROBACION < LISTO
const ORDEN = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', 'ENTREGADO_TIENDA', 'ELIMINADO']
export function subestadoGlobal(subestadosObj) {
  const valores = Object.values(subestadosObj).filter(v => v !== '_simple')
  if (valores.length === 0) return subestadosObj._simple || 'SOLICITADO'
  // El más atrasado define el estado global
  let minIdx = ORDEN.length
  valores.forEach(v => {
    const i = ORDEN.indexOf(v)
    if (i !== -1 && i < minIdx) minIdx = i
  })
  return ORDEN[minIdx] || 'SOLICITADO'
}
