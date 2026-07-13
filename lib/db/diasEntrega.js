// lib/db/diasEntrega.js
// Repositorio de la config de PLAZOS DE ENTREGA (tabla `dias_entrega`), detrás
// del switch DATA_BACKEND. Sólo LECTURAS (esta tabla se carga a mano, pocos
// registros — ver Fase 1 del plan de migración).
//
// Mantiene el nombre exportado `calcularDiasEntregaDesdeSheet` para no tocar a
// quien ya lo importa; la lógica es IDÉNTICA a la de lib/pedidos.js, sólo que la
// tabla se obtiene vía getTablaDias() (Sheets o Supabase según backend).

import { readSheet } from '../sheets';
import { getSupabase } from '../supabase';
import { read } from './_backend';
// Fallback si la tabla de config falla: heurística pura de lib/pedidos.
import { calcularDiasEntrega } from '../pedidos';

/**
 * Devuelve la tabla de plazos con el shape de la hoja (claves en MAYÚSCULA).
 * @returns {Promise<{ AREA_COMBINACION, DIAS_MINIMOS }[]>}
 */
export async function getTablaDias() {
  return read({
    sheets: async () => {
      // readSheet ya normaliza a { AREA_COMBINACION, DIAS_MINIMOS } (headers de la hoja).
      const tabla = await readSheet('DIAS_ENTREGA');
      return tabla.map((r) => ({
        AREA_COMBINACION: r.AREA_COMBINACION,
        DIAS_MINIMOS: r.DIAS_MINIMOS,
      }));
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('dias_entrega')
        .select('area_combinacion, dias_minimos');
      if (error) throw error;
      return (data || []).map((r) => ({
        AREA_COMBINACION: r.area_combinacion,
        DIAS_MINIMOS: String(r.dias_minimos), // se mantiene string, como en Sheets
      }));
    },
  });
}

/**
 * Calcula los días mínimos de entrega para un conjunto de áreas, leyendo la
 * tabla de config vía getTablaDias(). MISMA lógica que lib/pedidos.js.
 * Si algo falla, cae al cálculo heurístico calcularDiasEntrega.
 * @returns {Promise<number>}
 */
export async function calcularDiasEntregaDesdeSheet(areas) {
  try {
    const tabla = await getTablaDias();

    // Limpia áreas sin diseño / entrega en tienda y normaliza separadores.
    const areasLimpias = areas
      .filter((a) => a && a !== 'ENTREGA EN TIENDA' && a !== 'PRODUCTO SIN DISEÑO' && a !== 'PREMIUM - SIN DISEÑO')
      .map((a) => a.replace(/\s*\+\s*/g, '+').toUpperCase());
    const areasBase = [...new Set(areasLimpias.flatMap((a) => a.split('+').map((x) => x.trim())))].sort();
    const combinacion = areasBase.join('+');

    // 1) Coincidencia exacta de la combinación.
    const exacta = tabla.find(
      (r) => r.AREA_COMBINACION?.replace(/\s/g, '').toUpperCase() === combinacion.replace(/\s/g, '')
    );
    if (exacta) return parseInt(exacta.DIAS_MINIMOS) || 3;

    // 2) Varias áreas sin combinación exacta → fila 'TODAS' si existe.
    if (areasBase.length > 1) {
      const todas = tabla.find((r) => r.AREA_COMBINACION?.toUpperCase() === 'TODAS');
      if (todas) return parseInt(todas.DIAS_MINIMOS) || 3;
    }

    // 3) Máximo entre las filas individuales de cada área.
    let maxDias = 3;
    for (const area of areasBase) {
      const fila = tabla.find((r) => r.AREA_COMBINACION?.toUpperCase() === area);
      if (fila) maxDias = Math.max(maxDias, parseInt(fila.DIAS_MINIMOS) || 3);
    }
    return maxDias;
  } catch (e) {
    console.error('Error leyendo DIAS_ENTREGA:', e?.message || e);
    return calcularDiasEntrega(areas);
  }
}
