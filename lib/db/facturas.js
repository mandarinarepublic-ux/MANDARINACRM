// lib/db/facturas.js
// Repositorio de FACTURACIÓN sobre la tabla `pedidos`. Guarda el resultado de la
// emisión de factura en Dátil (lo que hoy hace app/api/factura-callback/route.js)
// detrás del switch DATA_BACKEND.
//
// Mapeo de campos (según el callback actual):
//   FACTURA_ID       (hoja)  →  factura_id      (Postgres) = datil_id
//   FACTURA_PDF_URL  (hoja)  →  factura_pdf_url (Postgres) = ride_url
// Nota: en Postgres también existe `factura_datil_id`; NO se toca aquí (ver reporte).

import { getSheets } from '../sheets';
import { getSupabase } from '../supabase';
import { write } from './_backend';

const SHEET_ID = process.env.SHEET_ID;
const TAB = 'PEDIDOS';

/**
 * Guarda los datos de la factura en el pedido.
 * @param pedidoId  ID de negocio del pedido (p.ej. 'MAN-AND-2432').
 * @param datilId   id de la factura en Dátil → FACTURA_ID / factura_id.
 * @param rideUrl   URL del PDF (RIDE)        → FACTURA_PDF_URL / factura_pdf_url.
 */
export async function setFactura(pedidoId, { datilId, rideUrl } = {}) {
  if (!pedidoId) throw new Error('pedido_id requerido');

  await write({
    // Sheets: replica el batchUpdate del callback (crea columnas on-the-fly si faltan).
    sheets: async () => {
      const sheets = await getSheets();

      // 1. Leer headers de PEDIDOS (fila 2 en la hoja).
      const hRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A2:Z2`,
      });
      const headers = hRes.data.values?.[0] || [];

      // 2. Leer filas de datos (desde la fila 4) y ubicar el pedido.
      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A4:Z`,
      });
      const rows = dataRes.data.values || [];
      const idxPedidoId = headers.indexOf('PEDIDO_ID');

      const rowIndex = rows.findIndex((r) => r[idxPedidoId] === pedidoId);
      if (rowIndex === -1) throw new Error(`Pedido ${pedidoId} no encontrado`);

      const sheetRow = rowIndex + 4; // header fila 2, descripción fila 3, datos desde fila 4.

      // 3. Buscar o crear las columnas FACTURA_ID y FACTURA_PDF_URL.
      async function getOrCreateCol(colName) {
        let idx = headers.indexOf(colName);
        if (idx === -1) {
          idx = headers.length;
          headers.push(colName);
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${TAB}!A2`,
            valueInputOption: 'RAW',
            requestBody: { values: [headers] },
          });
        }
        return String.fromCharCode(65 + idx);
      }

      const colFacturaId = await getOrCreateCol('FACTURA_ID');
      const colFacturaPdf = await getOrCreateCol('FACTURA_PDF_URL');

      // 4. Escribir los valores.
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: `${TAB}!${colFacturaId}${sheetRow}`, values: [[datilId || '']] },
            { range: `${TAB}!${colFacturaPdf}${sheetRow}`, values: [[rideUrl || '']] },
          ],
        },
      });
    },
    // Supabase: UPDATE por PK (pedido_id). Columnas ya fijas en el esquema.
    supabase: async () => {
      const { error } = await getSupabase()
        .from('pedidos')
        .update({
          factura_id: datilId || null,
          factura_pdf_url: rideUrl || null,
        })
        .eq('pedido_id', pedidoId);
      if (error) throw error;
    },
  });
}
