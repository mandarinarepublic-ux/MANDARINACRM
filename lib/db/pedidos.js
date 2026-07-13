// lib/db/pedidos.js
// Repositorio de PEDIDOS. Expone las operaciones que hoy hacen las rutas
// (app/api/pedidos/*) detrás del switch DATA_BACKEND, con dual-write.
//
// LECTURAS  → read({ sheets, supabase })   (fuente de verdad segun BACKEND)
// ESCRITURAS→ write({ sheets, supabase })  (primaria await + espejo best-effort)
//
// El GET original hace joins EN MEMORIA sobre PEDIDOS + DETALLE_PEDIDO + PAGOS +
// CLIENTES + GUIAS_DESPACHO y devuelve filas con claves MAYÚSCULAS (shape Sheets).
// Para paridad, el camino Supabase mapea sus filas (snake_case) al MISMO shape.

import { readSheet, appendRow, updateRow, getSheets, fechaAhora } from '../sheets';
import { generateItemId } from '../pedidos';
import { getSupabase } from '../supabase';
import { read, write, toBool, boolStr, toNum, toTimestamp } from './_backend';

const SHEET_ID = process.env.SHEET_ID;

// generateItemId se re-exporta tal cual (fórmula `${parts[1]}-${pedidoId}-${NN}`).
export { generateItemId };

// ─── Mapeo de campos editables (updatePedido): camel ↔ Sheets ↔ Postgres ─────
// [ claveCamel, [headersSheet...], columnaSupabase, tipo ]
const CAMPOS = [
  ['estadoPedido',             ['ESTADO_PEDIDO'],                        'estado_pedido',              'text'],
  ['estadoPago',               ['ESTADO_PAGO'],                          'estado_pago',                'text'],
  // Sheets mantiene DOS columnas históricas; se escriben ambas para no dejar
  // DIRECCION_TEXTO obsoleta (Postgres unifica en una sola: direccion_pedido).
  ['direccionPedido',          ['DIRECCION_PEDIDO', 'DIRECCION_TEXTO'],  'direccion_pedido',           'text'],
  ['fechaEntregaPrometida',    ['FECHA_ENTREGA_PROMETIDA'],              'fecha_entrega_prometida',    'ts'],
  ['notasVendedor',            ['NOTAS_VENDEDOR'],                       'notas_vendedor',             'text'],
  ['montoTotal',               ['MONTO_TOTAL'],                          'monto_total',                'num'],
  ['montoAbonado',             ['MONTO_ABONADO'],                        'monto_abonado',              'num'],
  ['montoPendiente',           ['MONTO_PENDIENTE'],                      'monto_pendiente',            'num'],
  ['diasCalculado',            ['DIAS_ENTREGA_CALCULADO'],               'dias_calculado',             'num'],
  ['diasPrometido',            ['DIAS_ENTREGA_PROMETIDO'],               'dias_prometido',             'num'],
  ['alertaEntrega',            ['ALERTA_ENTREGA'],                       'alerta_entrega',             'bool'],
  ['facturaSolicitada',        ['FACTURA_SOLICITADA'],                   'factura_solicitada',         'bool'],
  ['facturaDatilId',           ['FACTURA_DATIL_ID'],                     'factura_datil_id',           'text'],
  ['facturaId',                ['FACTURA_ID'],                           'factura_id',                 'text'],
  ['facturaPdfUrl',            ['FACTURA_PDF_URL'],                      'factura_pdf_url',            'text'],
  ['guiaNumero',               ['GUIA_NUMERO'],                          'guia_numero',                'text'],
  ['guiaTransportista',        ['GUIA_TRANSPORTISTA'],                   'guia_transportista',         'text'],
  ['fechaImpresionProduccion', ['FECHA_IMPRESION_PRODUCCION'],           'fecha_impresion_produccion', 'text'],
  ['impresoPor',               ['IMPRESO_POR'],                          'impreso_por',                'text'],
];

// ─── Mappers Supabase(snake) → shape Sheets(MAYÚSCULAS) para el join ──────────

function pedidoSupToSheet(p) {
  return {
    PEDIDO_ID: p.pedido_id,
    TIENDA_ID: p.tienda_id ?? '',
    VENDEDOR_ID: p.vendedor_id ?? '',
    CLIENTE_ID: p.cliente_id ?? '',
    FECHA_PEDIDO: p.fecha_pedido ?? '',
    FECHA_MODIFICACION: p.fecha_actualizacion ?? '',           // header real de la hoja
    FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
    DIAS_ENTREGA_CALCULADO: p.dias_calculado != null ? String(p.dias_calculado) : '',
    DIAS_ENTREGA_PROMETIDO: p.dias_prometido != null ? String(p.dias_prometido) : '',
    ALERTA_ENTREGA: boolStr(p.alerta_entrega),
    ESTADO_PEDIDO: p.estado_pedido ?? '',
    ESTADO_PAGO: p.estado_pago ?? '',
    MONTO_TOTAL: p.monto_total != null ? String(p.monto_total) : '',
    MONTO_ABONADO: p.monto_abonado != null ? String(p.monto_abonado) : '',
    MONTO_PENDIENTE: p.monto_pendiente != null ? String(p.monto_pendiente) : '',
    FACTURA_SOLICITADA: boolStr(p.factura_solicitada),
    FACTURA_DATIL_ID: p.factura_datil_id ?? '',
    FACTURA_ID: p.factura_id ?? '',
    FACTURA_PDF_URL: p.factura_pdf_url ?? '',
    FECHA_IMPRESION_PRODUCCION: p.fecha_impresion_produccion ?? '',
    IMPRESO_POR: p.impreso_por ?? '',
    NOTAS_VENDEDOR: p.notas_vendedor ?? '',
    GUIA_NUMERO: p.guia_numero ?? '',
    GUIA_TRANSPORTISTA: p.guia_transportista ?? '',
    // Ambas claves apuntan al único campo real (para consumidores que usen cualquiera).
    DIRECCION_TEXTO: p.direccion_pedido ?? '',
    DIRECCION_PEDIDO: p.direccion_pedido ?? '',
    LATITUD: p.latitud != null ? String(p.latitud) : '',
    LONGITUD: p.longitud != null ? String(p.longitud) : '',
  };
}

function detalleSupToSheet(d) {
  return {
    ITEM_ID: d.item_id,
    PEDIDO_ID: d.pedido_id,
    TIENDA_ID: d.tienda_id ?? '',
    PRODUCTO_NOMBRE: d.producto_nombre ?? '',
    DETALLE_PERSONALIZADO: d.detalle_personalizado ?? '',
    ES_PERSONALIZADO: boolStr(d.es_personalizado),
    COLOR: d.color ?? '',
    TALLA: d.talla ?? '',
    CANTIDAD: d.cantidad != null ? String(d.cantidad) : '',
    PRECIO_UNIT: d.precio_unit != null ? String(d.precio_unit) : '',
    SUBTOTAL: d.subtotal != null ? String(d.subtotal) : '',
    AREA: d.area ?? '',
    SUBESTADO: d.subestado ?? '',
    SUBESTADO_CORTE: d.subestado_corte ?? '',
    FOTO_PECHO_URL: d.foto_pecho_url ?? '',
    FOTO_ESPALDA_URL: d.foto_espalda_url ?? '',
    FOTO_MANGA_D_URL: d.foto_manga_d_url ?? '',
    FOTO_MANGA_I_URL: d.foto_manga_i_url ?? '',
    ARCHIVO_DISENO: d.archivo_diseno ?? '',
    'ARCHIVO_DISEÑO_URL': d.archivo_diseno ?? '',   // clave real de la hoja (paridad)
    SHOPIFY_VARIANT_ID: d.shopify_variant_id ?? '',
    FECHA_MODIFICACION: d.fecha_modificacion ?? '',
    NOTAS_AREA: d.notas_area ?? '',
    'NOTAS_AREA ': d.notas_area ?? '',              // clave real (con espacio, paridad)
  };
}

function pagoSupToSheet(pg) {
  // Claves = headers REALES de la hoja PAGOS (la UI lee p.TIPO_PAGO / p.FECHA_PAGO
  // en editar-pedido). Debe coincidir con toPagoPublico de lib/db/pagos.js.
  return {
    PAGO_ID: pg.pago_id,
    PEDIDO_ID: pg.pedido_id,
    TIPO_PAGO: pg.tipo ?? '',
    MONTO: pg.monto != null ? String(pg.monto) : '',
    FECHA_PAGO: pg.fecha ?? '',
    ESTADO_PAGO: pg.estado ?? '',
    FOTO_COMPROBANTE_URL: pg.foto_comprobante_url ?? '',
    VENDEDOR_ID: pg.vendedor_id ?? '',
    NOTAS: pg.notas ?? '',
  };
}

function clienteSupToSheet(c) {
  return {
    CLIENTE_ID: c.cliente_id,
    NOMBRE: c.nombre ?? '',
    CEDULA: c.cedula ?? '',
    CELULAR: c.celular ?? '',
    EMAIL: c.email ?? '',
    CIUDAD: c.ciudad ?? '',
    DIRECCION: c.direccion ?? '',
  };
}

function guiaSupToSheet(g) {
  return {
    GUIA_ID: g.guia_id,
    PEDIDO_ID: g.pedido_id,
    NUMERO_GUIA: g.numero_guia ?? '',
    TRANSPORTISTA: g.transportista ?? '',
    FOTO_GUIA_URL: g.foto_guia_url ?? '',
    FECHA_DESPACHO: g.fecha_despacho ?? '',
    REGISTRADO_POR: g.registrado_por ?? '',
    NOTAS: g.notas ?? '',
  };
}

// ─── Join en memoria (mismo shape que el GET actual) ─────────────────────────

/** Arma un pedido con items/pagos/cliente/guía a partir de arreglos shape-Sheets. */
function armarPedido(p, { detalles, pagos, clientes, guias }) {
  const guiasPedido = guias
    .filter(g => g.PEDIDO_ID === p.PEDIDO_ID)
    .sort((a, b) => (b.FECHA_DESPACHO || '').localeCompare(a.FECHA_DESPACHO || ''));
  const guia = guiasPedido[0] || null; // la más reciente por fecha_despacho
  const clienteInfo = clientes.find(c => c.CLIENTE_ID === p.CLIENTE_ID) || null;

  return {
    ...p,
    items: detalles.filter(d => d.PEDIDO_ID === p.PEDIDO_ID && d.SUBESTADO !== 'ELIMINADO'),
    pagos: pagos.filter(pg => pg.PEDIDO_ID === p.PEDIDO_ID),
    CLIENTE_NOMBRE: clienteInfo?.NOMBRE || '',
    CLIENTE_CEDULA: clienteInfo?.CEDULA || '',
    CLIENTE_CELULAR: clienteInfo?.CELULAR || '',
    GUIA_NUMERO: guia?.NUMERO_GUIA || p.GUIA_NUMERO || '',
    GUIA_TRANSPORTISTA: guia?.TRANSPORTISTA || p.GUIA_TRANSPORTISTA || '',
    GUIA_FOTO_URL: guia?.FOTO_GUIA_URL || '',
    GUIA_FECHA: guia?.FECHA_DESPACHO || '',
    GUIA_ID: guia?.GUIA_ID || '',
  };
}

/** Aplica el filtro scope='mios' para rol VENDEDOR (por nombre o por uuid). */
function filtrarScope(pedidos, { vendedor, vendedorId, rol, scope }) {
  if (rol === 'VENDEDOR' && scope === 'mios') {
    const nombreP = vendedor || '';
    const idP = vendedorId || vendedor || '';
    return pedidos.filter(p => p.VENDEDOR_ID === nombreP || p.VENDEDOR_ID === idP);
  }
  return pedidos;
}

/** Join desde Sheets (lee las 5 hojas). soloId opcional para acotar. */
async function joinSheets(opts = {}, soloId = null) {
  let pedidos = await readSheet('PEDIDOS');
  if (soloId) pedidos = pedidos.filter(p => p.PEDIDO_ID === soloId);
  pedidos = filtrarScope(pedidos, opts);
  if (pedidos.length === 0) return [];

  const [detalles, pagos, clientes, guias] = await Promise.all([
    readSheet('DETALLE_PEDIDO'),
    readSheet('PAGOS'),
    readSheet('CLIENTES'),
    readSheet('GUIAS_DESPACHO'),
  ]);
  return pedidos.map(p => armarPedido(p, { detalles, pagos, clientes, guias }));
}

/** Join desde Supabase (mapea al shape Sheets). soloId opcional para acotar. */
async function joinSupabase(opts = {}, soloId = null) {
  const sb = getSupabase();

  let pq = sb.from('pedidos').select('*');
  if (soloId) pq = pq.eq('pedido_id', soloId);
  const { data: pedRows, error: e1 } = await pq;
  if (e1) throw e1;

  let pedidos = (pedRows || []).map(pedidoSupToSheet);
  pedidos = filtrarScope(pedidos, opts);
  if (pedidos.length === 0) return [];

  const pedidoIds = pedidos.map(p => p.PEDIDO_ID);
  const clienteIds = [...new Set(pedidos.map(p => p.CLIENTE_ID).filter(Boolean))];

  const [det, pag, cli, gui] = await Promise.all([
    sb.from('detalle_pedido').select('*').eq('eliminado', false).in('pedido_id', pedidoIds),
    sb.from('pagos').select('*').in('pedido_id', pedidoIds),
    sb.from('clientes').select('*').in('cliente_id', clienteIds.length ? clienteIds : ['__none__']),
    sb.from('guias_despacho').select('*').in('pedido_id', pedidoIds),
  ]);
  for (const r of [det, pag, cli, gui]) if (r.error) throw r.error;

  const detalles = (det.data || []).map(detalleSupToSheet);
  const pagos = (pag.data || []).map(pagoSupToSheet);
  const clientes = (cli.data || []).map(clienteSupToSheet);
  const guias = (gui.data || []).map(guiaSupToSheet);

  return pedidos.map(p => armarPedido(p, { detalles, pagos, clientes, guias }));
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/** Lista de pedidos con join. Filtro scope='mios' para rol VENDEDOR. */
export async function listPedidos({ vendedor, vendedorId, rol, scope } = {}) {
  const opts = { vendedor, vendedorId, rol, scope };
  return read({
    sheets: () => joinSheets(opts),
    supabase: () => joinSupabase(opts),
  });
}

/** Lectura SOLO desde Supabase (para lecturas-sombra en las rutas; no respeta DATA_BACKEND). */
export async function listPedidosSupabase(opts = {}) {
  return joinSupabase({
    vendedor: opts.vendedor,
    vendedorId: opts.vendedorId,
    rol: opts.rol,
    scope: opts.scope,
  });
}

/** Un pedido por ID (con join) o null. */
export async function getPedidoById(id) {
  return read({
    sheets: async () => {
      const arr = await joinSheets({}, id);
      return arr.find(p => p.PEDIDO_ID === id) || null;
    },
    supabase: async () => {
      const arr = await joinSupabase({}, id);
      return arr.find(p => p.PEDIDO_ID === id) || null;
    },
  });
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/**
 * Crea la fila del PEDIDO (una sola inserción). Recibe pedido_id ya generado y
 * todos los campos ya calculados. NO sube fotos, ni crea cliente/ítems/pagos.
 */
export async function createPedido(data) {
  const {
    pedidoId, tiendaId, vendedorId, clienteId,
    fechaPedido, fechaActualizacion,
    fechaEntregaPrometida = '',
    diasCalculado, diasPrometido,
    alertaEntrega = false,
    estadoPedido = 'EN_FABRICA',
    estadoPago,
    montoTotal = 0, montoAbonado = 0, montoPendiente = 0,
    facturaSolicitada = false,
    facturaDatilId = '',
    notasVendedor = '',
    guiaNumero = '', guiaTransportista = '',
    direccionPedido = '',
    latitud = null, longitud = null,
  } = data;

  const nowSheet = fechaAhora();               // formato hoja "12Jul2026 20:53:00"
  const nowIso = new Date().toISOString();     // timestamptz Postgres

  await write({
    // Mismo ORDEN de columnas que el appendRow actual de POST /pedidos.
    sheets: async () => {
      await appendRow('PEDIDOS', [
        pedidoId, tiendaId, vendedorId, clienteId,
        fechaPedido || nowSheet, fechaActualizacion || nowSheet,
        fechaEntregaPrometida || '',
        diasCalculado != null ? String(diasCalculado) : '',
        diasPrometido != null ? String(diasPrometido) : '',
        boolStr(alertaEntrega),
        estadoPedido,
        estadoPago || '',
        String(montoTotal), String(montoAbonado), String(montoPendiente),
        boolStr(facturaSolicitada), facturaDatilId || '',
        notasVendedor || '',
        '', '',                 // PDF_URL, CARPETA_DRIVE_URL (la app no las maneja)
        direccionPedido || '',
        latitud != null && latitud !== '' ? String(latitud) : '',   // col 22 LATITUD
        longitud != null && longitud !== '' ? String(longitud) : '', // col 23 LONGITUD
      ]);
      // NOTA: guiaNumero/guiaTransportista NO tienen columna en la hoja PEDIDOS —
      // viven solo en Supabase (abajo) y en la hoja GUIAS_DESPACHO. FACTURA_ID y
      // FACTURA_PDF_URL se crean al vuelo (getOrCreateCol) al emitir factura.
    },
    supabase: async () => {
      const { error } = await getSupabase().from('pedidos').insert({
        pedido_id: pedidoId,
        tienda_id: tiendaId,
        vendedor_id: vendedorId || null,   // nombre o uuid, tal cual venga (sin forzar FK)
        cliente_id: clienteId || null,
        fecha_pedido: fechaPedido || nowIso,
        fecha_actualizacion: fechaActualizacion || nowIso,
        fecha_entrega_prometida: toTimestamp(fechaEntregaPrometida),
        dias_calculado: toNum(diasCalculado),
        dias_prometido: toNum(diasPrometido),
        alerta_entrega: toBool(alertaEntrega),
        estado_pedido: estadoPedido,
        estado_pago: estadoPago || null,
        monto_total: toNum(montoTotal) ?? 0,
        monto_abonado: toNum(montoAbonado) ?? 0,
        monto_pendiente: toNum(montoPendiente) ?? 0,
        factura_solicitada: toBool(facturaSolicitada),
        factura_datil_id: facturaDatilId || null,
        notas_vendedor: notasVendedor || null,
        guia_numero: guiaNumero || null,
        guia_transportista: guiaTransportista || null,
        direccion_pedido: direccionPedido || null,
        latitud: toNum(latitud),
        longitud: toNum(longitud),
      });
      if (error) throw error;
    },
  });

  return { pedidoId };
}

/** Update PARCIAL de la fila PEDIDOS en Sheets (replica el PATCH de pedidos/[id]). */
async function writePedidoSheets(id, sheetUpdates) {
  const pedidos = await readSheet('PEDIDOS');
  const idx = pedidos.findIndex(p => p.PEDIDO_ID === id);
  if (idx === -1) throw new Error('Pedido no encontrado');

  // Merge sobre la fila existente + siempre toca FECHA_MODIFICACION (header real).
  const updated = { ...pedidos[idx], ...sheetUpdates, FECHA_MODIFICACION: fechaAhora() };

  // Headers reales de PEDIDOS (fila 2) para respetar el orden actual de columnas.
  const sheets = await getSheets();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'PEDIDOS!A2:AZ2',
  });
  const headers = headerRes.data.values?.[0] || [];
  const row = headers.map(h => String(updated[h] ?? ''));
  await updateRow('PEDIDOS', idx, row);
}

/** Update PARCIAL en Supabase (siempre toca fecha_actualizacion). */
async function writePedidoSupabase(id, patch) {
  const { error } = await getSupabase()
    .from('pedidos')
    .update({ ...patch, fecha_actualizacion: new Date().toISOString() })
    .eq('pedido_id', id);
  if (error) throw error;
}

/**
 * Actualiza campos editables (parcial): estado, dirección, fechas, notas,
 * montos, impresión, guía_*, factura_*. Solo escribe lo que venga definido.
 */
export async function updatePedido(id, campos = {}) {
  const sheetUpdates = {};
  const patch = {};

  for (const [camel, headers, supaCol, tipo] of CAMPOS) {
    if (campos[camel] === undefined) continue;
    const v = campos[camel];

    // Valor para Sheets (string).
    const sheetVal = tipo === 'bool' ? boolStr(toBool(v)) : (v == null ? '' : String(v));
    for (const h of headers) sheetUpdates[h] = sheetVal;

    // Valor para Supabase (tipo real).
    patch[supaCol] =
      tipo === 'bool' ? toBool(v) :
      tipo === 'num' ? toNum(v) :
      tipo === 'ts' ? toTimestamp(v) :
      (v === '' ? null : v);
  }

  await write({
    sheets: () => writePedidoSheets(id, sheetUpdates),
    supabase: () => writePedidoSupabase(id, patch),
  });
}

/** Fija el estado del pedido (usado por el auto-avance a DESPACHO). */
export async function setEstado(id, estado) {
  await updatePedido(id, { estadoPedido: estado });
}

/** Marca el pedido como impreso para producción (fecha=ahora, impreso_por=usuario). */
export async function markImpreso(id, usuarioId) {
  await write({
    sheets: () => writePedidoSheets(id, {
      FECHA_IMPRESION_PRODUCCION: fechaAhora(),
      IMPRESO_POR: usuarioId || '',
    }),
    supabase: () => writePedidoSupabase(id, {
      fecha_impresion_produccion: new Date().toISOString(),
      impreso_por: usuarioId || null,
    }),
  });
}

// ─── Auto-avance ──────────────────────────────────────────────────────────────

/** ¿Todos los subestados están en LISTO? (soporta multi-área 'A:LISTO|B:LISTO'). */
function evaluarTodosListos(subestados) {
  // Nota: replica el .every() del auto-avance actual → arreglo vacío devuelve true.
  return subestados.every(sub => {
    const s = sub || '';
    if (s.includes(':')) {
      return s.split('|').every(part => part.split(':')[1]?.trim() === 'LISTO');
    }
    return s === 'LISTO';
  });
}

/**
 * True si todos los ítems vivos del pedido están LISTO (excluye ELIMINADO y
 * ENTREGADO_TIENDA). Base para el auto-avance EN_FABRICA→DESPACHO.
 */
export async function todosItemsListos(pedidoId) {
  return read({
    sheets: async () => {
      const detalles = await readSheet('DETALLE_PEDIDO');
      const items = detalles.filter(
        d => d.PEDIDO_ID === pedidoId && d.SUBESTADO !== 'ELIMINADO' && d.SUBESTADO !== 'ENTREGADO_TIENDA'
      );
      return evaluarTodosListos(items.map(d => d.SUBESTADO));
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('detalle_pedido')
        .select('subestado')
        .eq('pedido_id', pedidoId)
        .eq('eliminado', false)
        .neq('subestado', 'ENTREGADO_TIENDA');
      if (error) throw error;
      return evaluarTodosListos((data || []).map(d => d.subestado));
    },
  });
}

// ─── Generación de PEDIDO_ID ─────────────────────────────────────────────────

/** Siguiente número a partir de los IDs existentes (max del último segmento +1, base 2400). */
function siguienteNumero(ids) {
  const nums = (ids || [])
    .map(id => parseInt((id || '').split('-').pop(), 10))
    .filter(n => !isNaN(n));
  return nums.length > 0 ? Math.max(...nums) + 1 : 2400;
}

/**
 * Genera PEDIDO_ID `PREFIJO-COD-NUM` (MAN/IND + 3 letras del vendedor + número).
 * Misma lógica que lib/pedidos, consultando el backend activo.
 * (La secuencia atómica crm.pedido_seq queda para después.)
 */
export async function generatePedidoId(tiendaId, vendedorCodigo) {
  const prefix = tiendaId === 'MANDARINA' ? 'MAN' : 'IND';
  const code = (vendedorCodigo || 'GEN').slice(0, 3).toUpperCase();

  const next = await read({
    sheets: async () => {
      const pedidos = await readSheet('PEDIDOS');
      return siguienteNumero(pedidos.map(p => p.PEDIDO_ID));
    },
    supabase: async () => {
      const { data, error } = await getSupabase().from('pedidos').select('pedido_id');
      if (error) throw error;
      return siguienteNumero((data || []).map(p => p.pedido_id));
    },
  });

  return `${prefix}-${code}-${next}`;
}
