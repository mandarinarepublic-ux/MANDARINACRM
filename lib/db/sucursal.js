// lib/db/sucursal.js
// Repositorio de SUCURSAL (catálogo/stock por tienda). Expone las mismas
// operaciones que hoy hace app/api/sucursal/route.js, detrás del switch
// DATA_BACKEND (dual-write). La semántica de stock se preserva EXACTA.
//
// Sheets  = comportamiento actual con los helpers de '../sheets'.
// Supabase = schema `crm`, tabla `sucursal` (PK `id` text).

import { readSheet, appendRow, updateRow, fechaAhora } from '../sheets';
import { getSupabase } from '../supabase';
import { read, write, boolStr } from './_backend';

const HOJA = 'SUCURSAL';

// Columnas A-N en el orden exacto de la hoja SUCURSAL (nombres de header = keys
// que devuelve readSheet). El mismo orden se usa para reconstruir/reescribir la
// fila completa A{index+4}:N, igual que el route.
// A  ID · B NOMBRE · C TIENDA · D PRECIO · E TALLA · F COLOR · G STOCK
// H  RESERVADO · I FOTO_URL · J ACTIVO · K FECHA_CREACION · L CREADO_POR
// M  ULTIMA_MODIFICACION · N MODIFICADO_POR
const COLS = [
  'ID', 'NOMBRE', 'TIENDA', 'PRECIO', 'TALLA', 'COLOR',
  'STOCK', 'RESERVADO', 'FOTO_URL', 'ACTIVO',
  'FECHA_CREACION', 'CREADO_POR', 'ULTIMA_MODIFICACION', 'MODIFICADO_POR',
];
const idx = (col) => COLS.indexOf(col);

/**
 * Normaliza un producto (venga de Sheets o de Supabase) al shape que ya consume
 * la UI: keys en MAYÚSCULA, numéricos parseados y ACTIVO como 'TRUE'/'FALSE'.
 */
function toProductoPublico(p) {
  // ¿fila de Supabase? (columnas en minúscula). Detectamos por la PK.
  const esSupabase = p.id !== undefined && p.ID === undefined;
  const activo = esSupabase ? boolStr(p.activo) : (p.ACTIVO ?? 'FALSE');
  return {
    ID: esSupabase ? p.id : p.ID,
    NOMBRE: esSupabase ? p.nombre : p.NOMBRE,
    TIENDA: esSupabase ? p.tienda : p.TIENDA,
    PRECIO: parseFloat((esSupabase ? p.precio : p.PRECIO) || '0'),
    TALLA: esSupabase ? p.talla : p.TALLA,
    COLOR: esSupabase ? p.color : p.COLOR,
    STOCK: parseInt((esSupabase ? p.stock : p.STOCK) || '0'),
    RESERVADO: parseInt((esSupabase ? p.reservado : p.RESERVADO) || '0'),
    FOTO_URL: esSupabase ? p.foto_url : p.FOTO_URL,
    ACTIVO: activo,
    FECHA_CREACION: esSupabase ? p.fecha_creacion : p.FECHA_CREACION,
    CREADO_POR: esSupabase ? p.creado_por : p.CREADO_POR,
    ULTIMA_MODIFICACION: esSupabase ? p.ultima_modificacion : p.ULTIMA_MODIFICACION,
    MODIFICADO_POR: esSupabase ? p.modificado_por : p.MODIFICADO_POR,
  };
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/**
 * Lista productos de sucursal.
 * @param {Object} opts
 * @param {string} [opts.tienda]  filtra por tienda (case-insensitive, igual que el route).
 * @param {boolean} [opts.todos]  true = incluye stock=0 e inactivos (catálogo/admin);
 *                                 false (default) = solo ACTIVO='TRUE' && STOCK>0.
 * @returns {Promise<Object[]>} Producto[] con keys en MAYÚSCULA y numéricos parseados.
 */
export async function listSucursal({ tienda, todos } = {}) {
  return read({
    sheets: async () => {
      let productos = await readSheet(HOJA);
      if (tienda) {
        productos = productos.filter(
          (p) => p.TIENDA?.toLowerCase() === tienda.toLowerCase()
        );
      }
      // Por defecto solo activos con stock > 0.
      if (!todos) {
        productos = productos.filter(
          (p) => p.ACTIVO === 'TRUE' && parseInt(p.STOCK || '0') > 0
        );
      }
      return productos.map(toProductoPublico);
    },
    supabase: async () => {
      let q = getSupabase().from('sucursal').select('*');
      // ilike sin comodines = igualdad case-insensitive (equivalente al toLowerCase del route).
      if (tienda) q = q.ilike('tienda', tienda);
      if (!todos) q = q.eq('activo', true).gt('stock', 0);
      const { data, error } = await q;
      if (error) throw error;
      return data.map(toProductoPublico);
    },
  });
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/**
 * Crea un producto de sucursal.
 * NOTA: el ID se genera con timestamp (`SUC-${Date.now()}`), igual que hoy, y se
 * comparte entre ambos backends para que el dual-write quede consistente.
 * La resolución de foto (Cloudinary desde base64) sigue siendo responsabilidad
 * del route: aquí se recibe `foto_url` ya resuelta.
 * @returns {Promise<string>} id creado.
 */
export async function createSucursalProducto(data) {
  const {
    nombre, tienda, talla, color,
    stock, precio, foto_url, usuario,
  } = data;

  const id = `SUC-${Date.now()}`;
  const ahora = fechaAhora();               // string Ecuador para la hoja
  const nowIso = new Date().toISOString();  // timestamptz para Postgres
  const precioNum = parseFloat(precio || 0);
  const stockNum = parseInt(stock);
  const tallaFinal = talla || 'U';
  const colorFinal = color || '';
  const fotoFinal = foto_url || '';
  const creadoPor = usuario || '';

  await write({
    sheets: async () =>
      // Mismo orden A-N que el route (RESERVADO=0, ACTIVO='TRUE' al crear).
      appendRow(HOJA, [
        id,           // A - ID
        nombre,       // B - NOMBRE
        tienda,       // C - TIENDA
        precioNum,    // D - PRECIO
        tallaFinal,   // E - TALLA
        colorFinal,   // F - COLOR
        stockNum,     // G - STOCK
        0,            // H - RESERVADO
        fotoFinal,    // I - FOTO_URL
        'TRUE',       // J - ACTIVO
        ahora,        // K - FECHA_CREACION
        creadoPor,    // L - CREADO_POR
        ahora,        // M - ULTIMA_MODIFICACION
        creadoPor,    // N - MODIFICADO_POR
      ]),
    supabase: async () => {
      const { error } = await getSupabase().from('sucursal').insert({
        id,
        nombre,
        tienda,
        precio: precioNum,
        talla: tallaFinal,
        color: colorFinal,
        stock: stockNum,
        reservado: 0,
        foto_url: fotoFinal,
        activo: true,
        fecha_creacion: nowIso,
        creado_por: creadoPor,
        ultima_modificacion: nowIso,
        modificado_por: creadoPor,
      });
      if (error) throw error;
    },
  });

  return id;
}

/**
 * Edición manual de campos (nombre, tienda, talla, color, stock, precio, foto_url).
 * Parcial: solo se tocan los campos presentes en `campos`. Si cambia `stock`,
 * `activo` se recalcula (stock>0). Siempre actualiza ultima_modificacion/modificado_por.
 */
export async function updateSucursalProducto(id, campos = {}, usuario) {
  const ahora = fechaAhora();               // string Ecuador para la hoja
  const nowIso = new Date().toISOString();  // timestamptz para Postgres

  await write({
    sheets: async () => {
      // Reconstruimos la fila completa desde readSheet y la reescribimos A:N,
      // igual que el route.
      const rows = await readSheet(HOJA);
      const index = rows.findIndex((r) => r.ID === id);
      if (index < 0) throw new Error('Producto no encontrado');

      const fila = COLS.map((c) => rows[index][c] ?? '');

      if (campos.nombre !== undefined) fila[idx('NOMBRE')] = campos.nombre;
      if (campos.tienda !== undefined) fila[idx('TIENDA')] = campos.tienda;
      if (campos.talla !== undefined) fila[idx('TALLA')] = campos.talla;
      if (campos.color !== undefined) fila[idx('COLOR')] = campos.color;
      if (campos.stock !== undefined) {
        fila[idx('STOCK')] = parseInt(campos.stock);
        fila[idx('ACTIVO')] = parseInt(campos.stock) > 0 ? 'TRUE' : 'FALSE';
      }
      if (campos.precio !== undefined) fila[idx('PRECIO')] = parseFloat(campos.precio);
      if (campos.foto_url !== undefined) fila[idx('FOTO_URL')] = campos.foto_url;

      fila[idx('ULTIMA_MODIFICACION')] = ahora;
      fila[idx('MODIFICADO_POR')] = usuario || '';

      await updateRow(HOJA, index, fila);
    },
    supabase: async () => {
      const patch = {};
      if (campos.nombre !== undefined) patch.nombre = campos.nombre;
      if (campos.tienda !== undefined) patch.tienda = campos.tienda;
      if (campos.talla !== undefined) patch.talla = campos.talla;
      if (campos.color !== undefined) patch.color = campos.color;
      if (campos.stock !== undefined) {
        patch.stock = parseInt(campos.stock);
        patch.activo = parseInt(campos.stock) > 0; // recalculado como en el route
      }
      if (campos.precio !== undefined) patch.precio = parseFloat(campos.precio);
      if (campos.foto_url !== undefined) patch.foto_url = campos.foto_url;

      patch.ultima_modificacion = nowIso;
      patch.modificado_por = usuario || '';

      const { error } = await getSupabase().from('sucursal').update(patch).eq('id', id);
      if (error) throw error;
    },
  });
}

/**
 * Ajusta el stock según la acción, preservando la semántica EXACTA del route:
 *  - 'vender':    stock-1, reservado+1; si stock queda en 0 → activo=false.
 *                 (lanza si no hay stock disponible).
 *  - 'despachar': reservado-1 (nunca por debajo de 0).
 *  - 'cancelar':  stock+1, reservado-1 (nunca <0) y reactiva (activo=true).
 * Siempre actualiza ultima_modificacion/modificado_por.
 */
export async function ajustarStock(id, accion, usuario) {
  const ahora = fechaAhora();               // string Ecuador para la hoja
  const nowIso = new Date().toISOString();  // timestamptz para Postgres

  await write({
    sheets: async () => {
      const rows = await readSheet(HOJA);
      const index = rows.findIndex((r) => r.ID === id);
      if (index < 0) throw new Error('Producto no encontrado');

      const fila = COLS.map((c) => rows[index][c] ?? '');
      const stockActual = parseInt(fila[idx('STOCK')] || '0');
      const reservado = parseInt(fila[idx('RESERVADO')] || '0');

      if (accion === 'vender') {
        if (stockActual <= 0) throw new Error('Sin stock disponible');
        fila[idx('STOCK')] = stockActual - 1;
        fila[idx('RESERVADO')] = reservado + 1;
        if (stockActual - 1 <= 0) fila[idx('ACTIVO')] = 'FALSE';
      } else if (accion === 'despachar') {
        fila[idx('RESERVADO')] = Math.max(0, reservado - 1);
      } else if (accion === 'cancelar') {
        fila[idx('STOCK')] = stockActual + 1;
        fila[idx('RESERVADO')] = Math.max(0, reservado - 1);
        fila[idx('ACTIVO')] = 'TRUE';
      } else {
        throw new Error(`Acción de stock inválida: ${accion}`);
      }

      fila[idx('ULTIMA_MODIFICACION')] = ahora;
      fila[idx('MODIFICADO_POR')] = usuario || '';

      await updateRow(HOJA, index, fila);
    },
    supabase: async () => {
      const db = getSupabase();
      const { data: actual, error: errSel } = await db
        .from('sucursal')
        .select('stock, reservado')
        .eq('id', id)
        .single();
      if (errSel) throw errSel;
      if (!actual) throw new Error('Producto no encontrado');

      const stockActual = parseInt(actual.stock ?? 0);
      const reservado = parseInt(actual.reservado ?? 0);
      const patch = {};

      if (accion === 'vender') {
        if (stockActual <= 0) throw new Error('Sin stock disponible');
        patch.stock = stockActual - 1;
        patch.reservado = reservado + 1;
        if (stockActual - 1 <= 0) patch.activo = false;
      } else if (accion === 'despachar') {
        patch.reservado = Math.max(0, reservado - 1);
      } else if (accion === 'cancelar') {
        patch.stock = stockActual + 1;
        patch.reservado = Math.max(0, reservado - 1);
        patch.activo = true;
      } else {
        throw new Error(`Acción de stock inválida: ${accion}`);
      }

      patch.ultima_modificacion = nowIso;
      patch.modificado_por = usuario || '';

      const { error } = await db.from('sucursal').update(patch).eq('id', id);
      if (error) throw error;
    },
  });
}
