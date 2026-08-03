import { getSupabase } from './supabase'

// lib/canalVenta.js — ¿Esta venta se cerró por chat o en el mostrador?
//
// Existe porque la pauta también manda gente a la TIENDA FÍSICA, y esas ventas
// eran invisibles: Meta veía el anuncio y nunca se enteraba de que terminó en
// compra. Medido del 13-jul al 2-ago, Jackeline hizo 43 pedidos y solo 8 tenían
// chat — el resto no es un error de registro, es otro canal.
//
// LA REGLA DEL NEGOCIO (2-ago-2026), en tres casos:
//
//   1. El cliente tiene ctwa_clid → DIGITAL A FÍSICO. Vio el anuncio, escribió
//      por WhatsApp y días después compró en la tienda (Jackeline promedia 14
//      días entre el chat y la venta). Se atribuye al anuncio EXACTO, igual que
//      una venta por chat: da lo mismo quién la cerró.
//
//   2. Vendedor de tienda y SIN ctwa_clid → CLIENTE DE PASO. Puede que haya
//      visto el anuncio y entrado directo sin escribir; no hay forma de saberlo
//      desde acá. Se manda como venta de mostrador y que Meta haga el cruce:
//      él sí sabe quién vio la pauta.
//
//   3. Todo lo demás → como siempre.
//
// POR QUÉ POR VENDEDOR Y NO POR UN CAMPO EN EL PEDIDO: era la condición del
// usuario — no tocar el flujo de venta. Es frágil a propósito y hay que saberlo:
// el día que Jackeline también atienda chats, esto empieza a mentir. Si eso
// pasa, la salida es un campo `canal` en crm.pedidos, no estirar esta lista.

/**
 * Quién vende en el mostrador.
 *
 * OJO: se compara por NOMBRE, no por uuid. `crm.pedidos.vendedor_id` NO guarda
 * el id del usuario — guarda `vendedorNombre || vendedorId` (ver
 * app/api/pedidos/route.js), y en la práctica lo que hay son nombres:
 * 'JACKELINE BARRETO', 'CAMILA', 'Clever ' (con espacio al final)…
 *
 * Comparar contra 'uuid-007' habría fallado SIEMPRE y en silencio: ninguna venta
 * se habría marcado como de tienda y nadie se habría enterado. Por eso la
 * comparación normaliza mayúsculas y espacios.
 */
// La lista vive en crm.vendedores_tienda, no acá.
//
// La necesitan TRES lugares: este módulo (para el CAPI), el trigger que resuelve
// el origen al insertar el pedido, y la función del tablero. Tenerla copiada en
// cada uno garantizaba que algún día dijeran cosas distintas — el tablero
// mostrando una cosa y a Meta reportándose otra— sin ningún error que lo
// delatara. Una tabla es el único sitio que los tres pueden leer.
//
// Se cachea en memoria: esto se llama por cada venta y la lista cambia una vez
// al año. El proceso se recicla solo en Vercel, así que un cambio entra sin
// tener que desplegar nada.
let _cache = null
let _cacheAt = 0
const CACHE_MS = 5 * 60 * 1000

export async function vendedoresDeTienda() {
  if (_cache && Date.now() - _cacheAt < CACHE_MS) return _cache
  try {
    const { data } = await getSupabase().from('vendedores_tienda').select('nombre')
    _cache = new Set((data || []).map((v) => String(v.nombre).trim().toUpperCase()))
    _cacheAt = Date.now()
  } catch (e) {
    console.error('vendedoresDeTienda:', e.message)
    // Si la base no responde se usa lo último que se supo; y si nunca se supo,
    // un conjunto vacío. Nunca se inventa: marcar de más una venta como de
    // mostrador la mandaría a Meta con el action_source equivocado.
    _cache = _cache || new Set()
  }
  return _cache
}

export async function esVendedorDeTienda(vendedor) {
  const lista = await vendedoresDeTienda()
  return lista.has(String(vendedor || '').trim().toUpperCase())
}

/**
 * El action_source que le corresponde a esta venta.
 *
 * @param {boolean} tieneClid  el cliente llegó por un anuncio Click-to-WhatsApp
 * @param {string} vendedorId
 * @returns {'business_messaging'|'physical_store'|'chat'}
 */
export async function origenDeLaVenta({ tieneClid, vendedorId }) {
  if (tieneClid) return 'business_messaging'          // digital a físico, o venta por chat
  if (await esVendedorDeTienda(vendedorId)) return 'physical_store'  // cliente de paso
  return 'chat'
}
