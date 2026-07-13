// lib/db/guias.js
// Repositorio de GUÍAS DE DESPACHO (tabla `guias_despacho`), detrás del switch
// DATA_BACKEND. Cada pedido puede tener 1-N guías; la "vigente" es la más
// reciente por fecha de despacho.
//
// La hoja GUIAS_DESPACHO SÍ respeta el layout de readSheet (header en fila 1,
// datos desde la fila 3), así que las lecturas usan readSheet normal.

import { v4 as uuid } from 'uuid';
import { readSheet, appendRow, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write } from './_backend';

/**
 * Normaliza una fila (venga de Sheets o de Supabase) al shape con claves en
 * MAYÚSCULA que ya consume la app (app/api/pedidos/route.js: NUMERO_GUIA,
 * TRANSPORTISTA, FOTO_GUIA_URL, FECHA_DESPACHO, GUIA_ID, PEDIDO_ID...).
 */
function toGuia(g) {
  if (!g) return null;
  return {
    GUIA_ID: g.GUIA_ID ?? g.guia_id,
    PEDIDO_ID: g.PEDIDO_ID ?? g.pedido_id,
    NUMERO_GUIA: g.NUMERO_GUIA ?? g.numero_guia ?? '',
    TRANSPORTISTA: g.TRANSPORTISTA ?? g.transportista ?? '',
    FOTO_GUIA_URL: g.FOTO_GUIA_URL ?? g.foto_guia_url ?? '',
    FECHA_DESPACHO: g.FECHA_DESPACHO ?? g.fecha_despacho ?? '',
    REGISTRADO_POR: g.REGISTRADO_POR ?? g.registrado_por ?? '',
    NOTAS: g.NOTAS ?? g.notas ?? '',
  };
}

// ─── ESCRITURA (dual-write) ──────────────────────────────────────────────────

/**
 * Crea una guía de despacho para un pedido.
 * @returns {Promise<string>} el guia_id generado.
 */
export async function createGuia({ pedidoId, numero, transportista, fotoUrl, registradoPor, notas }) {
  const guiaId = uuid();
  const transp = transportista || 'SERVIENTREGA';

  await write({
    // Sheets append: GUIA_ID | PEDIDO_ID | NUMERO_GUIA | TRANSPORTISTA |
    //                FOTO_GUIA_URL | FECHA_DESPACHO | REGISTRADO_POR | NOTAS
    sheets: async () =>
      appendRow('GUIAS_DESPACHO', [
        guiaId,
        pedidoId,
        String(numero || '').trim(),
        transp,
        fotoUrl || '',
        fechaAhora(),
        registradoPor || '',
        notas || '',
      ]),
    supabase: async () => {
      // fecha_despacho la pone la BD (default now()).
      const { error } = await getSupabase().from('guias_despacho').insert({
        guia_id: guiaId,
        pedido_id: pedidoId,
        numero_guia: String(numero || '').trim(),
        transportista: transp,
        foto_guia_url: fotoUrl || '',
        registrado_por: registradoPor || '',
        notas: notas || '',
      });
      if (error) throw error;
    },
  });

  return guiaId;
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/**
 * Todas las guías de un pedido, más reciente primero.
 * @returns {Promise<Guia[]>}
 */
export async function listGuiasByPedido(pedidoId) {
  if (!pedidoId) return [];

  return read({
    sheets: async () => {
      const guias = await readSheet('GUIAS_DESPACHO');
      return guias
        .filter((g) => g.PEDIDO_ID === pedidoId)
        .map(toGuia)
        .sort((a, b) => (b.FECHA_DESPACHO || '').localeCompare(a.FECHA_DESPACHO || ''));
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('guias_despacho')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('fecha_despacho', { ascending: false });
      if (error) throw error;
      return (data || []).map(toGuia);
    },
  });
}

/**
 * La guía más reciente de un pedido (por fecha_despacho), o null si no hay.
 * @returns {Promise<Guia|null>}
 */
export async function latestGuiaByPedido(pedidoId) {
  const guias = await listGuiasByPedido(pedidoId);
  return guias[0] || null;
}
