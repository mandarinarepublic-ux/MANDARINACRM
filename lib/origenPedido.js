// lib/origenPedido.js — De dónde vino esta venta, resuelto UNA vez al grabarla.
//
// POR QUÉ CONGELARLO Y NO CALCULARLO CADA VEZ: el cruce por teléfono da una
// respuesta que cambia con el tiempo. Si el cliente vuelve a escribir desde otro
// anuncio, el cruce le asigna el nuevo y una venta de julio "cambia de origen"
// en octubre. Un reporte deja de cuadrar consigo mismo.
//
// Además, esto es exactamente lo que se le reporta a Meta. Congelarlo deja por
// escrito por qué una venta se envió como se envió, que antes no se podía
// auditar en ninguna parte.
//
// Las cinco categorías son las mismas del tablero (crm.pauta_origen_ventas):
//
//   por_chat          vino de un anuncio y cerró por WhatsApp
//   digital_a_fisico  vino de un anuncio y compró en el mostrador
//   cliente_de_paso   mostrador, sin chat
//   mensaje_directo   escribió por su cuenta, sin venir de un anuncio
//   sin_rastro        ni chat ni mostrador — no hay de dónde agarrarse
//
// Nunca lanza: si esto falla, el pedido se graba igual sin origen. Una venta no
// se puede perder por no saber de dónde vino.
import { esVendedorDeTienda } from './canalVenta'
import { getChatDeCliente } from './inbox-supabase'

export async function resolverOrigen({ celular, tiendaId, vendedorId }) {
  try {
    const chat = await getChatDeCliente(celular, tiendaId)
    const esTienda = esVendedorDeTienda(vendedorId)

    // Sin chat: o es cliente de paso del mostrador, o no hay nada que decir.
    if (!chat) {
      return { origen: esTienda ? 'cliente_de_paso' : 'sin_rastro' }
    }

    // Con chat pero sin anuncio: escribió por su cuenta. Sigue siendo una venta
    // del inbox, no un hueco de datos.
    if (!chat.adId) {
      return { origen: 'mensaje_directo', origenTelefono: chat.telefono }
    }

    return {
      origen: esTienda ? 'digital_a_fisico' : 'por_chat',
      origenAdId: chat.adId,
      origenCtwaClid: chat.ctwaClid || null,
      origenTelefono: chat.telefono,
    }
  } catch (e) {
    console.error('resolverOrigen:', e.message)
    return { origen: null }
  }
}

/** Las columnas listas para escribir en crm.pedidos. */
export function columnasDeOrigen(r) {
  if (!r?.origen) return {}
  return {
    origen: r.origen,
    origenAdId: r.origenAdId || null,
    origenCtwaClid: r.origenCtwaClid || null,
    origenTelefono: r.origenTelefono || null,
    origenAt: new Date().toISOString(),
  }
}
