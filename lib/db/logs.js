// lib/db/logs.js
// Repositorio de la BITÁCORA de pedidos (tabla `logs_pedidos`), detrás del
// switch DATA_BACKEND. Reemplaza a logCambio de lib/pedidos.js y a la lectura
// suelta de app/api/pedidos/logs/route.js.
//
// OJO con la lectura en Sheets: la hoja LOGS_PEDIDOS NO respeta el layout de
// readSheet (que asume headers en fila 1 y datos desde la fila 3). Aquí el
// header está en la fila 0/1 y los datos arrancan justo después, así que se
// replica la lectura directa (rango A:F) tal como lo hace pedidos/logs/route.js.

import { getSheets, appendRow, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write } from './_backend';

/**
 * Registra un cambio en la bitácora. NO-THROW: si falla, sólo se loguea en
 * consola y jamás rompe la operación del usuario (igual que hoy en lib/pedidos).
 * @returns {Promise<void>}
 */
export async function logCambio(pedidoId, campo, antes, despues, usuarioId) {
  try {
    await write({
      // Sheets append: [PEDIDO_ID, FECHA, USUARIO, CAMPO, VALOR_ANTES, VALOR_DESPUES]
      sheets: async () =>
        appendRow('LOGS_PEDIDOS', [
          pedidoId,
          fechaAhora(),
          usuarioId || 'SISTEMA',
          campo,
          String(antes || ''),
          String(despues || ''),
        ]),
      supabase: async () => {
        // fecha la pone la BD (default now()); usuario 'SISTEMA' si viene vacío.
        const { error } = await getSupabase().from('logs_pedidos').insert({
          pedido_id: pedidoId,
          usuario: usuarioId || 'SISTEMA',
          campo,
          valor_antes: String(antes || ''),
          valor_despues: String(despues || ''),
        });
        if (error) throw error;
      },
    });
  } catch (e) {
    console.error('Log error:', e?.message || e);
  }
}

/**
 * Devuelve la bitácora de un pedido, más reciente primero.
 * @returns {Promise<{ fecha, usuario, campo, antes, despues }[]>}
 */
export async function listLogsByPedido(pedidoId) {
  if (!pedidoId) return [];

  return read({
    sheets: async () => {
      // Lectura DIRECTA (rango A:F) — NO readSheet: el layout de esta hoja es
      // distinto (header en fila 0/1, datos desde la fila siguiente).
      const sheets = await getSheets();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'LOGS_PEDIDOS!A:F',
      });

      const rows = res.data.values || [];
      if (rows.length < 2) return [];

      // Detecta y descarta la fila de header si existe.
      let dataRows = rows;
      if (rows[0][0]?.toUpperCase() === 'PEDIDO_ID') {
        dataRows = rows.slice(1);
      }

      return dataRows
        .filter((r) => r[0] === pedidoId)
        .map((r) => ({
          fecha: r[1] || '',
          usuario: r[2] || '',
          campo: r[3] || '',
          antes: r[4] || '',
          despues: r[5] || '',
        }))
        .reverse(); // reciente primero (Sheets append es cronológico)
    },
    supabase: async () => listLogsByPedidoSupabase(pedidoId),
  });
}

/** Lectura SOLO Supabase (para lecturas-sombra): bitácora de un pedido, reciente primero. */
export async function listLogsByPedidoSupabase(pedidoId) {
  if (!pedidoId) return [];
  const { data, error } = await getSupabase()
    .from('logs_pedidos')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('fecha', { ascending: false }); // reciente primero
  if (error) throw error;
  return (data || []).map((r) => ({
    fecha: r.fecha || '',
    usuario: r.usuario || '',
    campo: r.campo || '',
    antes: r.valor_antes || '',
    despues: r.valor_despues || '',
  }));
}
