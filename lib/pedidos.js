
// FIX 2: Leer días mínimos desde la hoja DIAS_ENTREGA del Sheet
// en lugar de tener los valores quemados en el código
export async function calcularDiasEntregaDesdeSheet(areas) {
  try {
    const tabla = await readSheet('DIAS_ENTREGA')
    // Construir combinación de áreas (sin espacios, mayúsculas, concatenadas con +)
    const areasLimpias = areas
      .filter(a => a && a !== 'ENTREGA EN TIENDA' && a !== 'PRODUCTO SIN DISEÑO' && a !== 'PREMIUM - SIN DISEÑO')
      .map(a => a.replace(/\s*\+\s*/g, '+').toUpperCase())

    // Expandir áreas compuestas (ej: "ESTAMPADO + SUBLIMACION" → ["ESTAMPADO","SUBLIMACION"])
    const areasBase = [...new Set(areasLimpias.flatMap(a => a.split('+').map(x => x.trim())))].sort()
    const combinacion = areasBase.join('+')

    // Buscar en la tabla: primero la combinación exacta
    const exacta = tabla.find(r =>
      r.AREA_COMBINACION?.replace(/\s/g,'').toUpperCase() === combinacion.replace(/\s/g,'')
    )
    if (exacta) return parseInt(exacta.DIAS_MINIMOS) || 3

    // Si hay varias áreas, buscar "TODAS"
    if (areasBase.length > 1) {
      const todas = tabla.find(r => r.AREA_COMBINACION?.toUpperCase() === 'TODAS')
      if (todas) return parseInt(todas.DIAS_MINIMOS) || 3
    }

    // Buscar área individual con más días
    let maxDias = 3
    for (const area of areasBase) {
      const fila = tabla.find(r => r.AREA_COMBINACION?.toUpperCase() === area)
      if (fila) maxDias = Math.max(maxDias, parseInt(fila.DIAS_MINIMOS) || 3)
    }
    return maxDias
  } catch(e) {
    console.error('Error leyendo DIAS_ENTREGA:', e.message)
    return calcularDiasEntrega(areas) // fallback al cálculo hardcodeado
  }
}
