// lib/db/produccion.js
//
// La bandeja de PRODUCCIÓN. Una sola consulta, con el join hecho por Postgres.
//
// POR QUÉ EXISTE: `listPedidos` trae las cinco tablas enteras (3.541 filas,
// 966 kB) para que la pantalla descarte el 95 % en el navegador. Peor: la lectura
// de `detalle_pedido` no paginaba y PostgREST corta en 1000 SIN avisar, así que
// desde el 4-ago-2026 había pedidos que llegaban sin prendas y la pantalla los
// escondía con `.filter(items.length > 0)`. 21 pedidos invisibles, 14 días.
//
// Acá se pide solo lo que la bandeja pinta: los EN_FABRICA con las prendas del
// área de quien pregunta. Para David: 41 pedidos y 72 prendas (~45 kB).

import { getSupabase } from '../supabase'
import { areasDeUsuario, prendaEsDelUsuario } from '../areas-usuario.js'
import { esCompleta } from '../bandeja-estado.js'

// Solo las columnas que usan la pantalla y la hoja de confección. Verificado campo
// por campo contra produccion/page.js y components/pedido/PdfPedido.js: pagos,
// guías y la ficha completa del cliente NO se usan.
const COLS_PRENDA = [
  'item_id', 'pedido_id', 'area', 'subestado', 'subestado_corte',
  'producto_nombre', 'color', 'talla', 'cantidad',
  'detalle_personalizado', 'notas_area',
  'foto_pecho_url', 'foto_espalda_url', 'foto_manga_d_url', 'foto_manga_i_url',
  'archivo_diseno',
].join(',')

const COLS_PEDIDO = [
  'pedido_id', 'tienda_id', 'fecha_pedido', 'fecha_entrega_prometida',
  'direccion_pedido',
].join(',')

// ☠️ EL SELECT SE ARMA CON UN join(','), NUNCA CONCATENANDO PLANTILLAS.
//
// Esto estuvo así:
//     `${COLS_PEDIDO},` + `prendas_en_taller(${COLS_PRENDA}),` + `clientes(...)`
//
// y el minificador de Next SE COMIÓ LA COMA al construir para producción. En el
// código fuente estaba; en `.next/server/app/api/produccion/route.js` quedaba
// `direccion_pedidoprendas_en_taller`. Verificado el 19-ago-2026 buscando esa
// cadena en el bundle.
//
// Efectos, todos el mismo bug con caras distintas:
//   · con alias  → PostgREST lo leía como el alias `direccion_pedidoprendas`,
//                  así que `p.prendas` venía undefined: 64 pedidos "incompletos"
//                  y una alarma falsa por Telegram, y luego la bandeja en 0 ítems.
//   · sin alias  → no encontraba la relación `direccion_pedidoprendas_en_taller`
//                  y el endpoint devolvía 500.
//
// La lección: el código que corre en producción NO es el que escribes, es el que
// sale del build. Probar la consulta con curl nunca lo habría cazado — la sintaxis
// siempre fue válida. Lo vigila tests/select-no-se-rompe-en-el-build.test.js.
//
// ─────────────────────────────────────────────────────────────────────────────
// El conteo del recurso anidado (`total_prendas`) hace falta porque PostgREST
// trunca CADA recurso anidado por separado: verificado el 19-ago con tablas
// desechables, un padre con 1500 hijos devuelve 1000 pero su `count` dice 1500.
// El `count: 'exact'` global cuenta PEDIDOS, no prendas, así que sin esto un
// pedido con más de 1000 prendas perdería prendas en silencio.
//
// Y como el conteo sale del MISMO recurso con los MISMOS filtros, no puede dar el
// falso positivo de un conteo de otra fuente (que incluiría eliminadas y las de
// ENTREGA EN TIENDA, y gritaría para siempre).
const SELECT = [
  COLS_PEDIDO,
  `prendas:prendas_en_taller(${COLS_PRENDA})`,
  'total_prendas:prendas_en_taller(count)',
  'clientes(nombre,cedula,celular)',
].join(',')

/** Fila de Supabase → el shape MAYÚSCULAS que ya consume la pantalla. */
function aPrenda(d) {
  return {
    ITEM_ID: d.item_id,
    PEDIDO_ID: d.pedido_id,
    AREA: d.area ?? '',
    SUBESTADO: d.subestado ?? '',
    SUBESTADO_CORTE: d.subestado_corte ?? '',
    PRODUCTO_NOMBRE: d.producto_nombre ?? '',
    COLOR: d.color ?? '',
    TALLA: d.talla ?? '',
    CANTIDAD: d.cantidad != null ? String(d.cantidad) : '',
    DETALLE_PERSONALIZADO: d.detalle_personalizado ?? '',
    NOTAS_AREA: d.notas_area ?? '',
    FOTO_PECHO_URL: d.foto_pecho_url ?? '',
    FOTO_ESPALDA_URL: d.foto_espalda_url ?? '',
    FOTO_MANGA_D_URL: d.foto_manga_d_url ?? '',
    FOTO_MANGA_I_URL: d.foto_manga_i_url ?? '',
    // La hoja de confección lee la clave con Ñ (el header real de la hoja).
    'ARCHIVO_DISEÑO_URL': d.archivo_diseno ?? '',
    ARCHIVO_DISENO: d.archivo_diseno ?? '',
  }
}

/**
 * Los pedidos EN_FABRICA con las prendas que le tocan a `usuario`.
 *
 * @param {{ROL:string, AREAS:string|string[]}} usuario  tal como lo devuelve getUsuarioById
 * @returns {Promise<{pedidos:object[], meta:{pedidos:number, prendas:number, completo:boolean, pedidosIncompletos:number}}>}
 */
export async function listBandejaProduccion(usuario) {
  const areasCsv = usuario?.AREAS
  const areas = Array.isArray(areasCsv)
    ? areasCsv
    : String(areasCsv ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const suyas = areasDeUsuario(usuario?.ROL, areas)

  // Sin áreas no ve nada. Se corta acá: no tiene sentido consultar.
  if (Array.isArray(suyas) && suyas.length === 0) {
    return { pedidos: [], meta: { pedidos: 0, prendas: 0, completo: true, pedidosIncompletos: 0 } }
  }

  const sb = getSupabase()

  // DOS niveles de completitud, los dos del MISMO recurso (ver SELECT arriba):
  //   · `count: 'exact'`                        → ¿llegaron todos los PEDIDOS?
  //   · `total_prendas:prendas_en_taller(count)` → ¿todas las PRENDAS de cada uno?
  const { data, error, count } = await sb
    .from('pedidos')
    .select(SELECT, { count: 'exact' })
    .eq('estado_pedido', 'EN_FABRICA')
  if (error) throw error

  const filas = data || []
  const completo = esCompleta({ recibidas: filas.length, total: count })

  const pedidos = []
  let prendas = 0
  let incompletos = 0

  // Diagnóstico: la FORMA cruda de lo que devolvió PostgREST para el primer
  // pedido. Solo para ADMIN. Existe porque el 19-ago el conteo por pedido falló
  // en producción y la consulta reproducida con tablas de prueba funcionaba: sin
  // ver la respuesta real no se puede saber si falla el embed de las prendas o el
  // del conteo, y son causas opuestas con arreglos opuestos.
  // Quitar cuando esté diagnosticado.
  const diag = filas[0] ? {
    claves: Object.keys(filas[0]),
    prendasEsArray: Array.isArray(filas[0].prendas),
    prendasLength: Array.isArray(filas[0].prendas) ? filas[0].prendas.length : null,
    totalPrendasCrudo: JSON.stringify(filas[0].total_prendas ?? null).slice(0, 80),
  } : null

  for (const p of filas) {
    // ⚠️ La comparación va ANTES de filtrar por área, y es a propósito.
    //
    // `total_prendas` cuenta TODAS las prendas del pedido, no solo las tuyas. Si
    // se comparara contra `mias`, el 5599 (2 de sublimación + 1 de bordado) le
    // diría a David "llegaron 2 de 3" y le pintaría el botón para siempre.
    //
    // Comparando antes: si llegaron todas las del pedido, las de su área también.
    const llegaron = (p.prendas || []).length
    const totalPrendas = p.total_prendas?.[0]?.count

    // ⚠️ Aquí NO aplica "ante la duda, incompleto" — y es deliberado.
    //
    // Ese principio vale para el nivel GLOBAL, donde la evidencia es fiable
    // (`count: 'exact'` sobre la propia consulta). En el nivel POR PEDIDO, si el
    // conteo no llega no hay evidencia de nada, y gritar sin evidencia es peor que
    // callar: el 19-ago marcó los 64 pedidos como incompletos a la vez y mandó una
    // alarma falsa. Una alarma que siempre suena es ruido, y el ruido se ignora.
    //
    // Solo se marca incompleto con evidencia POSITIVA: hay un conteo válido Y es
    // mayor que lo que llegó. Si el conteo desapareciera otra vez, el peor caso es
    // quedarse sin botón — nunca romper la bandeja.
    const hayConteo = typeof totalPrendas === 'number' && Number.isFinite(totalPrendas)
    const completoPedido = !hayConteo || llegaron >= totalPrendas

    const mias = (p.prendas || []).filter((d) => prendaEsDelUsuario(d.area, suyas))

    // Un pedido sin prendas de su área NO es suyo: se excluye acá, en el servidor.
    //
    // ⚠️ Esto NO es el `.filter(items.length > 0)` que se quita de la pantalla.
    // Aquel escondía pedidos cuyas prendas no habían LLEGADO; este excluye pedidos
    // cuyas prendas son de OTRA área. De los 63 en fábrica, 22 no tienen ninguna
    // de David — y su ausencia es correcta, no un fallo.
    if (mias.length === 0 && completoPedido) continue

    if (!completoPedido) incompletos++
    prendas += mias.length
    pedidos.push({
      PEDIDO_ID: p.pedido_id,
      TIENDA_ID: p.tienda_id ?? '',
      FECHA_PEDIDO: p.fecha_pedido ?? '',
      FECHA_ENTREGA_PROMETIDA: p.fecha_entrega_prometida ?? '',
      DIRECCION_PEDIDO: p.direccion_pedido ?? '',
      DIRECCION_TEXTO: p.direccion_pedido ?? '',
      CLIENTE_NOMBRE: p.clientes?.nombre ?? '',
      CLIENTE_CEDULA: p.clientes?.cedula ?? '',
      CLIENTE_CELULAR: p.clientes?.celular ?? '',
      ESTADO_PEDIDO: 'EN_FABRICA',
      // Para el botón: si no cuadran, a este pedido le faltan prendas.
      PRENDAS_LLEGARON: llegaron,
      PRENDAS_TOTAL: hayConteo ? totalPrendas : null,
      COMPLETO: completoPedido,
      items: mias.map(aPrenda),
    })
  }

  return {
    pedidos,
    meta: {
      pedidos: pedidos.length, prendas, completo, pedidosIncompletos: incompletos,
      ...(String(usuario?.ROL).toUpperCase() === 'ADMIN' ? { diag } : {}),
    },
  }
}
