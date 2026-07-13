// lib/db/detalle.js
// Repositorio de DETALLE_PEDIDO (los ítems de cada pedido). Expone las mismas
// operaciones que hoy hacen a mano las rutas, detrás del switch DATA_BACKEND.
//
//  - LECTURAS → salen de la fuente de verdad (Sheets o Supabase) vía `read`.
//  - ESCRITURAS → patrón dual-write vía `write` (primaria + espejo best-effort).
//
// Sheets = comportamiento ACTUAL (soft-delete = SUBESTADO='ELIMINADO', columnas
// UPPERCASE, SUBESTADO_CORTE se crea al final si falta). Supabase = tabla
// `detalle_pedido` en el schema `crm`, PK `item_id` (text), soft-delete con la
// columna booleana `eliminado`.
//
// Todas las lecturas normalizan la fila al MISMO shape UPPERCASE que ya consumen
// la UI y las rutas (igual criterio que lib/db/usuarios.js → toUsuarioPublico).

import { readSheet, appendRow, updateRow, updateCell, getSheets, fechaAhora } from '../sheets'
import { getSupabase } from '../supabase'
import { read, write, toBool, boolStr, toNum } from './_backend'
import { parseSubestados, serializeSubestados } from '../subestados'

const SHEET_ID = process.env.SHEET_ID

// Orden canónico de columnas de la hoja DETALLE_PEDIDO (21 columnas).
// Es el mismo orden del POST de app/api/pedidos/route.js (la fuente canónica,
// que SÍ incluye ARCHIVO_DISENO; el alta de ítem-extra de [id]/route.js lo
// omitía por bug — aquí queda unificado):
// A ITEM_ID · B PEDIDO_ID · C TIENDA_ID · D PRODUCTO_NOMBRE ·
// E DETALLE_PERSONALIZADO · F ES_PERSONALIZADO · G COLOR · H TALLA ·
// I CANTIDAD · J PRECIO_UNIT · K SUBTOTAL · L AREA · M SUBESTADO ·
// N FOTO_PECHO_URL · O FOTO_ESPALDA_URL · P FOTO_MANGA_D_URL ·
// Q FOTO_MANGA_I_URL · R ARCHIVO_DISENO · S SHOPIFY_VARIANT_ID ·
// T FECHA_MODIFICACION · U NOTAS_AREA · (V SUBESTADO_CORTE se crea al vuelo)

// ─── helpers internos ────────────────────────────────────────────────────────

// idx (0-based en el array de datos de readSheet) → letra de columna de Sheet.
// Soporta más de 26 columnas (A..Z, AA..) por si la hoja crece.
function colLetterFromIdx(idx) {
  let s = ''
  let n = idx
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// Lee los headers reales de la fila 2 de DETALLE_PEDIDO.
async function headersDetalle() {
  const sheets = await getSheets()
  const hRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'DETALLE_PEDIDO!A2:AZ2',
  })
  return hRes.data.values?.[0] || []
}

// Escribe UNA celda buscando la columna por nombre de header.
//  - fallbackLetter: si el header no existe, usar esta letra fija (como hacen
//    las rutas: SUBESTADO→'M', NOTAS_AREA→'U').
//  - createIfMissing: si el header no existe, añadirlo al final (SUBESTADO_CORTE).
async function writeCellByHeader(idx, headerName, value, fallbackLetter, { createIfMissing = false } = {}) {
  const headers = await headersDetalle()
  let colIdx = headers.indexOf(headerName)

  if (colIdx === -1) {
    if (createIfMissing) {
      colIdx = headers.length
      const sheets = await getSheets()
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: 'DETALLE_PEDIDO!A2',
        valueInputOption: 'RAW',
        requestBody: { values: [[...headers, headerName]] },
      })
    } else if (fallbackLetter) {
      await updateCell('DETALLE_PEDIDO', idx, fallbackLetter, value)
      return
    } else {
      throw new Error(`Columna ${headerName} no encontrada en DETALLE_PEDIDO`)
    }
  }

  await updateCell('DETALLE_PEDIDO', idx, colLetterFromIdx(colIdx), value)
}

// Reescribe la fila COMPLETA del ítem respetando el orden real de headers
// (equivale al writeRowDetalle de app/api/pedidos/item/[id]/route.js). `updated`
// trae claves UPPERCASE; readSheet garantiza que estén TODAS las columnas, así
// que no se borra nada por accidente.
async function writeFullRowSheets(idx, updated) {
  const headers = await headersDetalle()
  const row = headers.map((h) => String(updated[h] ?? ''))
  await updateRow('DETALLE_PEDIDO', idx, row)
}

// Busca el índice de datos de un ítem en la hoja; lanza si no existe.
async function findIdxSheets(itemId) {
  const detalles = await readSheet('DETALLE_PEDIDO')
  const idx = detalles.findIndex((d) => d.ITEM_ID === itemId)
  if (idx === -1) throw new Error('Ítem no encontrado')
  return { detalles, idx }
}

// Normaliza una fila (venga de Sheets UPPERCASE o de Supabase snake_case) al
// shape UPPERCASE que ya consumen la UI y las rutas. Los tipos de Postgres
// (bool/number) se re-emiten como string para no romper comparaciones tipo
// String(x) que hacen las rutas.
function toItem(r) {
  const num = (up, sb) => (r[up] !== undefined ? r[up] : r[sb] != null ? String(r[sb]) : '')
  return {
    ITEM_ID: r.ITEM_ID ?? r.item_id,
    PEDIDO_ID: r.PEDIDO_ID ?? r.pedido_id,
    TIENDA_ID: r.TIENDA_ID ?? r.tienda_id,
    PRODUCTO_NOMBRE: r.PRODUCTO_NOMBRE ?? r.producto_nombre,
    DETALLE_PERSONALIZADO: r.DETALLE_PERSONALIZADO ?? r.detalle_personalizado,
    ES_PERSONALIZADO: r.ES_PERSONALIZADO ?? boolStr(r.es_personalizado),
    COLOR: r.COLOR ?? r.color,
    TALLA: r.TALLA ?? r.talla,
    CANTIDAD: num('CANTIDAD', 'cantidad'),
    PRECIO_UNIT: num('PRECIO_UNIT', 'precio_unit'),
    SUBTOTAL: num('SUBTOTAL', 'subtotal'),
    AREA: r.AREA ?? r.area,
    SUBESTADO: r.SUBESTADO ?? r.subestado,
    SUBESTADO_CORTE: r.SUBESTADO_CORTE ?? r.subestado_corte,
    FOTO_PECHO_URL: r.FOTO_PECHO_URL ?? r.foto_pecho_url,
    FOTO_ESPALDA_URL: r.FOTO_ESPALDA_URL ?? r.foto_espalda_url,
    FOTO_MANGA_D_URL: r.FOTO_MANGA_D_URL ?? r.foto_manga_d_url,
    FOTO_MANGA_I_URL: r.FOTO_MANGA_I_URL ?? r.foto_manga_i_url,
    // Header real de la hoja = 'ARCHIVO_DISEÑO_URL' (con Ñ y sufijo _URL).
    ARCHIVO_DISENO: r['ARCHIVO_DISEÑO_URL'] ?? r.ARCHIVO_DISENO ?? r.archivo_diseno,
    'ARCHIVO_DISEÑO_URL': r['ARCHIVO_DISEÑO_URL'] ?? r.archivo_diseno,
    SHOPIFY_VARIANT_ID: r.SHOPIFY_VARIANT_ID ?? r.shopify_variant_id,
    FECHA_MODIFICACION: r.FECHA_MODIFICACION ?? r.fecha_modificacion,
    // Header real = 'NOTAS_AREA ' (con espacio final).
    NOTAS_AREA: r['NOTAS_AREA '] ?? r.NOTAS_AREA ?? r.notas_area,
  }
}

// Columnas editables por updateItem. Acepta la clave en cualquiera de las tres
// convenciones (UPPERCASE de la ruta, snake_case del esquema, o camelCase).
const COLS_EDITABLES = [
  { up: 'PRODUCTO_NOMBRE', sb: 'producto_nombre', camel: 'productoNombre' },
  { up: 'DETALLE_PERSONALIZADO', sb: 'detalle_personalizado', camel: 'detallePersonalizado' },
  { up: 'COLOR', sb: 'color', camel: 'color' },
  { up: 'TALLA', sb: 'talla', camel: 'talla' },
  { up: 'AREA', sb: 'area', camel: 'area' },
  { up: 'CANTIDAD', sb: 'cantidad', camel: 'cantidad', type: 'int' },
  { up: 'PRECIO_UNIT', sb: 'precio_unit', camel: 'precioUnit', type: 'num' },
  { up: 'SUBTOTAL', sb: 'subtotal', camel: 'subtotal', type: 'num' },
  { up: 'FOTO_PECHO_URL', sb: 'foto_pecho_url', camel: 'fotoPechoUrl' },
  { up: 'FOTO_ESPALDA_URL', sb: 'foto_espalda_url', camel: 'fotoEspaldaUrl' },
  { up: 'FOTO_MANGA_D_URL', sb: 'foto_manga_d_url', camel: 'fotoMangaDUrl' },
  { up: 'FOTO_MANGA_I_URL', sb: 'foto_manga_i_url', camel: 'fotoMangaIUrl' },
]

// Devuelve el valor de un campo probando las tres convenciones (usa `in` para
// permitir '' como valor válido, p.ej. al limpiar una foto).
function pickCampo(campos, col) {
  if (col.up in campos) return campos[col.up]
  if (col.sb in campos) return campos[col.sb]
  if (col.camel in campos) return campos[col.camel]
  return undefined
}

// ─── ID de ítem ──────────────────────────────────────────────────────────────

// Formato: `${parts[1]}-${pedidoId}-${index 2 dígitos}` (idéntico a lib/pedidos).
export function generateItemId(pedidoId, index) {
  const parts = String(pedidoId).split('-')
  return `${parts[1]}-${pedidoId}-${String(index).padStart(2, '0')}`
}

// ─── LECTURAS ────────────────────────────────────────────────────────────────

/** Ítems de un pedido. Por defecto EXCLUYE los eliminados. */
export async function listItemsByPedido(pedidoId, { incluirEliminados = false } = {}) {
  return read({
    sheets: async () => {
      const detalles = await readSheet('DETALLE_PEDIDO')
      return detalles
        .filter((d) => d.PEDIDO_ID === pedidoId && (incluirEliminados || d.SUBESTADO !== 'ELIMINADO'))
        .map(toItem)
    },
    supabase: async () => {
      let q = getSupabase().from('detalle_pedido').select('*').eq('pedido_id', pedidoId)
      if (!incluirEliminados) q = q.eq('eliminado', false)
      const { data, error } = await q
      if (error) throw error
      return data.map(toItem)
    },
  })
}

/**
 * Un ítem por su ITEM_ID (búsqueda directa por PK). Devuelve el ítem aunque
 * esté eliminado (lookup puntual, no listado), o null si no existe.
 */
export async function getItemById(itemId) {
  return read({
    sheets: async () => {
      const detalles = await readSheet('DETALLE_PEDIDO')
      const found = detalles.find((d) => d.ITEM_ID === itemId)
      return found ? toItem(found) : null
    },
    supabase: async () => {
      const { data, error } = await getSupabase()
        .from('detalle_pedido')
        .select('*')
        .eq('item_id', itemId)
        .maybeSingle()
      if (error) throw error
      return data ? toItem(data) : null
    },
  })
}

// ─── ESCRITURAS (dual-write) ─────────────────────────────────────────────────

/**
 * Crea un ítem. Las URLs de fotos y archivo de diseño llegan YA subidas a
 * Cloudinary (aquí NO se sube nada). El ITEM_ID se toma de item.itemId si viene;
 * si no, se genera con item.index; y si tampoco, se calcula contando los ítems
 * existentes del pedido (+1). Devuelve el ITEM_ID resultante.
 */
export async function createItem(pedidoId, item = {}) {
  // 1) Resolver ITEM_ID.
  let itemId = item.itemId ?? item.ITEM_ID
  if (!itemId) {
    let index = item.index
    if (index === undefined || index === null) {
      const existentes = await listItemsByPedido(pedidoId, { incluirEliminados: true })
      index = existentes.length + 1
    }
    itemId = generateItemId(pedidoId, index)
  }

  // 2) Normalizar valores canónicos.
  const tiendaId = item.tiendaId ?? item.TIENDA_ID ?? ''
  const productoNombre = item.productoNombre ?? item.PRODUCTO_NOMBRE ?? ''
  const detalle = item.detalle ?? item.detallePersonalizado ?? item.DETALLE_PERSONALIZADO ?? ''
  const esPersonalizado = toBool(item.esPersonalizado ?? item.ES_PERSONALIZADO)
  const color = item.color ?? item.COLOR ?? ''
  const talla = item.talla ?? item.TALLA ?? ''
  const cantidad = parseInt(item.cantidad ?? item.CANTIDAD ?? 1) || 1
  const precioUnit = parseFloat(item.precioUnit ?? item.PRECIO_UNIT ?? 0) || 0
  const subtotal =
    item.subtotal !== undefined || item.SUBTOTAL !== undefined
      ? Number(parseFloat(item.subtotal ?? item.SUBTOTAL) || 0)
      : Number((precioUnit * cantidad).toFixed(2))
  const area = item.area ?? item.AREA ?? ''
  const subestado = item.subestado ?? item.SUBESTADO ?? 'SOLICITADO'
  const subestadoCorte = item.subestadoCorte ?? item.SUBESTADO_CORTE ?? ''
  const fotoPecho = item.fotoPecho ?? item.fotoPechoUrl ?? item.FOTO_PECHO_URL ?? ''
  const fotoEspalda = item.fotoEspalda ?? item.fotoEspaldaUrl ?? item.FOTO_ESPALDA_URL ?? ''
  const fotoMangaD = item.fotoMangaD ?? item.fotoMangaDUrl ?? item.FOTO_MANGA_D_URL ?? ''
  const fotoMangaI = item.fotoMangaI ?? item.fotoMangaIUrl ?? item.FOTO_MANGA_I_URL ?? ''
  const archivoDiseno = item.archivoDiseno ?? item.archivoDisenoUrl ?? item.ARCHIVO_DISENO ?? ''
  const shopifyVariantId = item.shopifyVariantId ?? item.SHOPIFY_VARIANT_ID ?? ''
  const notasArea = item.notasArea ?? item.NOTAS_AREA ?? ''

  const nowSheet = fechaAhora() // "14Jun2026 20:53:00" (formato hoja)
  const nowIso = new Date().toISOString() // timestamp real para Postgres

  await write({
    sheets: async () =>
      appendRow('DETALLE_PEDIDO', [
        itemId,
        pedidoId,
        tiendaId,
        productoNombre,
        detalle,
        boolStr(esPersonalizado),
        color,
        talla,
        String(cantidad),
        String(precioUnit),
        subtotal.toFixed(2),
        area,
        subestado,
        fotoPecho,
        fotoEspalda,
        fotoMangaD,
        fotoMangaI,
        archivoDiseno,
        shopifyVariantId,
        nowSheet,
        notasArea,
      ]),
    supabase: async () => {
      const { error } = await getSupabase().from('detalle_pedido').insert({
        item_id: itemId,
        pedido_id: pedidoId,
        tienda_id: tiendaId,
        producto_nombre: productoNombre,
        detalle_personalizado: detalle,
        es_personalizado: esPersonalizado,
        color,
        talla,
        cantidad,
        precio_unit: precioUnit,
        subtotal,
        area,
        subestado,
        subestado_corte: subestadoCorte || null,
        foto_pecho_url: fotoPecho || null,
        foto_espalda_url: fotoEspalda || null,
        foto_manga_d_url: fotoMangaD || null,
        foto_manga_i_url: fotoMangaI || null,
        archivo_diseno: archivoDiseno || null,
        shopify_variant_id: shopifyVariantId || null,
        fecha_modificacion: nowIso,
        notas_area: notasArea || null,
        eliminado: false,
      })
      if (error) throw error
    },
  })

  return itemId
}

/**
 * Edición de fila completa (editar-pedido): actualiza solo los campos presentes
 * en `campos` (producto_nombre, color, talla, area, detalle_personalizado,
 * cantidad, precio_unit, subtotal, foto_*_url). Siempre refresca la fecha de
 * modificación. NO recalcula subtotal: el llamador manda el valor ya calculado.
 */
export async function updateItem(itemId, campos = {}) {
  const nowSheet = fechaAhora()
  const nowIso = new Date().toISOString()

  // Construir los parches por backend a partir de los campos presentes.
  const sheetPatch = {} // UPPERCASE → string
  const sbPatch = {} // snake_case → tipo real
  for (const col of COLS_EDITABLES) {
    const v = pickCampo(campos, col)
    if (v === undefined) continue
    if (col.type === 'int') {
      const n = parseInt(v)
      const val = Number.isFinite(n) ? n : 0
      sheetPatch[col.up] = String(val)
      sbPatch[col.sb] = val
    } else if (col.type === 'num') {
      const n = toNum(v)
      sheetPatch[col.up] = n === null ? '' : String(n)
      sbPatch[col.sb] = n
    } else {
      // Texto (incluye URLs de foto; '' limpia el valor, igual que en la hoja).
      sheetPatch[col.up] = v === null ? '' : String(v)
      sbPatch[col.sb] = v === null ? '' : String(v)
    }
  }
  sheetPatch.FECHA_MODIFICACION = nowSheet
  sbPatch.fecha_modificacion = nowIso

  await write({
    sheets: async () => {
      const { detalles, idx } = await findIdxSheets(itemId)
      await writeFullRowSheets(idx, { ...detalles[idx], ...sheetPatch })
    },
    supabase: async () => {
      const { error } = await getSupabase()
        .from('detalle_pedido')
        .update(sbPatch)
        .eq('item_id', itemId)
      if (error) throw error
    },
  })
}

/**
 * Cambia el SUBESTADO. Con `areaRol` es multi-área: parsea el subestado actual
 * (lib/subestados), reemplaza solo esa área y re-serializa. Sin `areaRol`,
 * guarda el valor directo. (El auto-avance a DESPACHO y el logCambio siguen
 * viviendo en la ruta, como el comportamiento actual.)
 */
export async function updateSubestado(itemId, subestado, areaRol) {
  await write({
    sheets: async () => {
      const { detalles, idx } = await findIdxSheets(itemId)
      const item = detalles[idx]
      let nuevoValor = subestado
      if (areaRol) {
        const subestados = parseSubestados(item.SUBESTADO, item.AREA)
        subestados[areaRol] = subestado
        nuevoValor = serializeSubestados(subestados)
      }
      // Igual que la ruta: solo se escribe la celda SUBESTADO (fallback 'M').
      await writeCellByHeader(idx, 'SUBESTADO', nuevoValor, 'M')
    },
    supabase: async () => {
      const sb = getSupabase()
      let nuevoValor = subestado
      if (areaRol) {
        const { data, error } = await sb
          .from('detalle_pedido')
          .select('subestado, area')
          .eq('item_id', itemId)
          .maybeSingle()
        if (error) throw error
        const subestados = parseSubestados(data?.subestado, data?.area)
        subestados[areaRol] = subestado
        nuevoValor = serializeSubestados(subestados)
      }
      const { error } = await sb
        .from('detalle_pedido')
        .update({ subestado: nuevoValor })
        .eq('item_id', itemId)
      if (error) throw error
    },
  })
}

/** Guarda la nota del área (columna NOTAS_AREA, fallback 'U'). */
export async function updateNotasArea(itemId, nota) {
  await write({
    sheets: async () => {
      const { idx } = await findIdxSheets(itemId)
      await writeCellByHeader(idx, 'NOTAS_AREA', nota ?? '', 'U')
    },
    supabase: async () => {
      const { error } = await getSupabase()
        .from('detalle_pedido')
        .update({ notas_area: nota ?? null })
        .eq('item_id', itemId)
      if (error) throw error
    },
  })
}

/**
 * Guarda SUBESTADO_CORTE. En Sheets la columna se crea al final de la fila 2
 * si aún no existe (igual que la ruta actual).
 */
export async function updateSubestadoCorte(itemId, valor) {
  await write({
    sheets: async () => {
      const { idx } = await findIdxSheets(itemId)
      await writeCellByHeader(idx, 'SUBESTADO_CORTE', valor ?? '', null, { createIfMissing: true })
    },
    supabase: async () => {
      const { error } = await getSupabase()
        .from('detalle_pedido')
        .update({ subestado_corte: valor ?? null })
        .eq('item_id', itemId)
      if (error) throw error
    },
  })
}

/**
 * Soft-delete. Sheets: SUBESTADO='ELIMINADO' + fecha (reescribe la fila, como la
 * ruta DELETE). Supabase: eliminado=true. `usuarioId` se acepta por firma, pero
 * el logCambio sigue en la ruta.
 */
export async function softDeleteItem(itemId, usuarioId) {
  await write({
    sheets: async () => {
      const { detalles, idx } = await findIdxSheets(itemId)
      await writeFullRowSheets(idx, {
        ...detalles[idx],
        SUBESTADO: 'ELIMINADO',
        FECHA_MODIFICACION: fechaAhora(),
      })
    },
    supabase: async () => {
      const { error } = await getSupabase()
        .from('detalle_pedido')
        .update({ eliminado: true, fecha_modificacion: new Date().toISOString() })
        .eq('item_id', itemId)
      if (error) throw error
    },
  })
}
