// lib/metaCapi.js
// Envío del evento Purchase a la Conversions API de Meta, DIRECTO desde el CRM.
//
// Antes esto pasaba por un webhook de Make ("CAPI_MANDARINA Y INDSTORE CONECTADO
// A CRM"): el CRM mandaba los datos del cliente en claro, Make los hasheaba y los
// reenviaba a Meta. Este módulo hace exactamente lo mismo sin intermediario, para
// poder dar de baja esa suscripción.
//
// Se replica el comportamiento del escenario al pie de la letra para no alterar
// el matching que Meta ya venía haciendo:
//   - SHA-256 de email/teléfono/nombre/apellido/cédula/ciudad
//   - email, nombre, apellido y ciudad en minúsculas y recortados
//   - country siempre 'EC'
//   - event_name 'Purchase', action_source 'chat' (la venta se cierra por WhatsApp)
//   - event_id = PEDIDO_ID, que además deduplica contra el pixel de la web
//   - currency USD, value = monto total, order_id = PEDIDO_ID
//
// Mejora sobre Make: el teléfono se normaliza a formato internacional sin '+'
// (593…) ANTES de hashear. Make hasheaba lo que le llegara, así que un número
// guardado como '0991234567' generaba un hash que Meta nunca podía emparejar.

import crypto from 'crypto'
import { registrarEvento } from './eventos'
import { getCtwaDeCliente, getDatasetDeWaba, registrarCapiEvent } from './inbox-supabase'
import { origenDeLaVenta } from './canalVenta'
// La regla de a dónde va cada Purchase vive aparte para poder probarla sin red.
// Ver lib/capi-destino.js: es lo único que impide repetir la pérdida del 3-ago.
import { decidirDestino } from './capi-destino.js'

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * phone_id de Meta → WABA que lo aloja.
 *
 * Los eventos de business_messaging exigen el whatsapp_business_account_id por el
 * que ENTRÓ el click, y las dos marcas tienen dos números cada una, en WABAs
 * distintas. Estos valores salieron del tráfico real (entry[0].id de
 * inbox.webhook_eventos), no de la documentación.
 *
 * Si un número se migra de WABA (le pasó al 3326 de IND el 28-jul-2026) hay que
 * actualizar esto Y el lib/canales.js de cada inbox. Mientras tanto el pedido se
 * envía igual, solo que sin atribución: es lo mismo que pasaba antes.
 */
const WABA_POR_PHONE_ID = {
  '1024077200794372': '1250794910496982', // MANDARINA · +593 98 374 5757
  '118582961194601':  '110133805380815',  // REPUBLIC  · +593 97 910 4167
  '1153686904504422': '1043571971409840', // IND STORE · +593 99 995 3326
  '2241248862581450': '396966121059860',  // IND STORE · +593 98 415 9804
}

/** SHA-256 en hexadecimal, o undefined si el valor viene vacío. */
function hash(valor) {
  const v = String(valor ?? '').trim()
  if (!v) return undefined
  return crypto.createHash('sha256').update(v).digest('hex')
}

/** Igual que hash() pero pasando a minúsculas primero (email, nombre, ciudad). */
function hashLower(valor) {
  const v = String(valor ?? '').trim().toLowerCase()
  if (!v) return undefined
  return crypto.createHash('sha256').update(v).digest('hex')
}

/**
 * Teléfono ecuatoriano a formato internacional sin '+' ni separadores, que es lo
 * que Meta espera antes del hash: '099 123 4567' → '593991234567'.
 */
export function normalizarTelefono(valor) {
  let t = String(valor ?? '').replace(/\D/g, '')
  if (!t) return ''
  if (t.startsWith('593')) return t
  if (t.startsWith('0')) return '593' + t.slice(1)
  if (t.length === 9) return '593' + t          // sin el 0 inicial
  return t
}

/**
 * YAW no pauta en Meta: sus ventas no deben ensuciar la señal de ninguna tienda.
 *
 * Esto NUNCA estuvo implementado. El CRM rotulaba la tienda con
 * `includes('IND') ? 'INDSTORE' : 'MANDARINA'`, así que YAW caía en MANDARINA y
 * sus compras se enviaban al pixel de Mandarina. Entre el 02-jul (alta del CAPI)
 * y el 21-jul fueron 42 pedidos por $1.608 contados como si fueran de Mandarina.
 */
export function debeEnviarCapi(tiendaId) {
  return String(tiendaId || '').trim().toUpperCase() !== 'YAW'
}

/** ¿A qué pixel va cada tienda? null = no se envía. */
export function pixelDeTienda(tiendaId) {
  if (!debeEnviarCapi(tiendaId)) return null
  const esInd = String(tiendaId || '').toUpperCase().includes('IND')
  return esInd
    ? process.env.META_PIXEL_INDSTORE
    : process.env.META_PIXEL_MANDARINA
}

/**
 * ¿Con qué token se autentica cada tienda?
 *
 * Los tokens de CAPI quedan atados al dataset desde el que se generan: el que
 * hay hoy en META_CAPI_TOKEN sirve para el pixel de Mandarina y Meta rechaza con
 * él los envíos a IND WEB ("Object with ID … does not exist, cannot be loaded due
 * to missing permissions"). Así estaba montado en Make, que nunca falló: dos
 * conexiones, una por tienda (usuarios del sistema mandarina_republic_apps_01 e
 * ind_apps001).
 *
 * Si META_CAPI_TOKEN_INDSTORE no está puesto se usa el token único, así que esto
 * no cambia nada hasta que exista esa variable.
 */
export function tokenDeTienda(tiendaId) {
  const esInd = String(tiendaId || '').toUpperCase().includes('IND')
  if (esInd && process.env.META_CAPI_TOKEN_INDSTORE) return process.env.META_CAPI_TOKEN_INDSTORE
  return process.env.META_CAPI_TOKEN
}

/** ¿Está configurado el envío directo? Si no, el llamador puede usar Make. */
export function capiConfigurado() {
  return Boolean(
    process.env.META_CAPI_TOKEN &&
    (process.env.META_PIXEL_MANDARINA || process.env.META_PIXEL_INDSTORE)
  )
}

/**
 * Envía el Purchase a Meta. No lanza nunca: devuelve {ok, error} para que el
 * llamador decida, porque esto no debe impedir que se registre una venta.
 */
export async function enviarPurchase({ pedidoId, tiendaId, cliente, montoTotal, eventTime, vendedorId }) {
  if (!debeEnviarCapi(tiendaId)) return { ok: true, omitido: 'YAW no pauta en Meta' }

  const pixelId = pixelDeTienda(tiendaId)
  const token = tokenDeTienda(tiendaId)
  if (!pixelId || !token) return { ok: false, error: 'CAPI no configurado' }

  const userData = {
    em: hashLower(cliente?.email),
    ph: hash(normalizarTelefono(cliente?.celular)),
    fn: hashLower(cliente?.nombre),
    // El CRM guarda el nombre completo en un solo campo; Make mandaba apellido
    // vacío y aquí se mantiene igual para no cambiar el matching.
    ln: undefined,
    ct: hashLower(cliente?.ciudad),
    external_id: hash(cliente?.cedula),
    country: hashLower('EC'),
  }
  // Meta rechaza las claves con valor nulo.
  for (const k of Object.keys(userData)) if (!userData[k]) delete userData[k]

  // ¿El cliente llegó por un anuncio Click-to-WhatsApp? Si sí, ESTE MISMO evento
  // sale por el canal de business messaging con el click id, y Meta puede cerrar
  // el círculo anuncio → conversación → venta.
  //
  // Se cambia el evento existente en vez de mandar uno nuevo A PROPÓSITO: un
  // evento solo puede tener un action_source, así que enviar además un
  // 'business_messaging' aparte significaría dos Purchase por la misma venta y
  // el revenue reportado saldría al doble.
  const ctwa = await getCtwaDeCliente(cliente?.celular, tiendaId)
  const wabaId = ctwa ? WABA_POR_PHONE_ID[String(ctwa.phoneId)] : null
  const atribuido = Boolean(ctwa?.ctwaClid && wabaId)

  // Tres orígenes posibles (ver lib/canalVenta.js):
  //   business_messaging → el cliente vino de un anuncio y escribió. Incluye la
  //     venta "digital a físico": si tiene clid se atribuye al anuncio exacto,
  //     aunque la haya cerrado el mostrador dos semanas después.
  //   physical_store → cliente de paso. No hay clid que mandar, así que va con
  //     los datos hasheados y el cruce lo hace Meta, que sí sabe quién vio la
  //     pauta aunque nunca haya escrito. Sin esto esas ventas son invisibles.
  //   chat → lo de siempre.
  const origenPedido = await origenDeLaVenta({ tieneClid: atribuido, vendedorId })

  /**
   * ⚠️ EL DESTINO NO ES EL MISMO PARA LOS TRES ORÍGENES, y confundirlo cuesta caro.
   *
   * Un evento `business_messaging` va al DATASET de la WABA por la que entró el
   * click. Al pixel de la web NO se puede: el pixel no tiene cuenta de WhatsApp
   * asociada y Meta rechaza el evento ENTERO con "Invalid parameter".
   *
   * Medido el 8-ago-2026: entre el 3 y el 8-ago se perdieron así **21 compras por
   * $1.624,98** — el 100% de las que venían de un anuncio, o sea justo las únicas
   * que le enseñan a Meta a buscar compradores. El evento se armaba perfecto
   * (`atribuido: true`) y se estrellaba contra el destino equivocado.
   *
   * El token también es otro: el dataset de una WABA rechaza los tokens de CAPI
   * con "missing permissions" (subcode 33). Hay que usar META_TOKEN, el de la
   * Cloud API, que es el que manda sobre la WABA. Es el mismo que usan los inbox.
   */
  const datasetId = origenPedido === 'business_messaging' ? await getDatasetDeWaba(wabaId) : null
  // Un token cargado a Vercel desde PowerShell trae un BOM invisible que falla
  // SOLO en producción. Se limpia al leerlo, como hace lib/env.js de los inbox.
  const tokenWaba = String(process.env.META_TOKEN || '').replace(/^﻿/, '').trim()

  const { porDataset, origen, destinoId } = decidirDestino({
    origenPedido, datasetId, tokenWaba, pixelId,
  })

  const evento = {
    event_name: 'Purchase',
    // Al REENVIAR se manda la hora real de la venta, no la de ahora, para que Meta
    // la atribuya al día en que ocurrió. Meta rechaza eventos de más de 7 días.
    event_time: eventTime || Math.floor(Date.now() / 1000),
    event_id: pedidoId,                    // deduplica contra el pixel del sitio
    action_source: origen,
    ...(porDataset && { messaging_channel: 'whatsapp' }),
    user_data: porDataset
      // Copiado tal cual del payload que YA funciona en los inbox (lib/capi.js,
      // 127+ eventos aceptados): en el canal de mensajería el emparejamiento lo
      // hace el click id, y los datos hasheados NO van. Mandarlos además es
      // arriesgarse a un segundo rechazo por otro motivo.
      ? { whatsapp_business_account_id: wabaId, ctwa_clid: ctwa.ctwaClid }
      // En physical_store el cruce lo hace Meta con los datos hasheados, así que
      // acá el user_data es lo único que hay: mientras más completo, mejor
      // emparejamiento. Ya lleva teléfono, correo, nombre, ciudad y cédula.
      : userData,
    custom_data: {
      currency: 'USD',
      value: Number(parseFloat(montoTotal || 0).toFixed(2)),
      order_id: pedidoId,
    },
  }

  const tokenDelDestino = porDataset ? tokenWaba : token

  // Para la bitácora: dónde cayó el evento de verdad. Con solo `pixelId` no se
  // podía distinguir "fue al pixel" de "fue al dataset", que es justo lo que hubo
  // que averiguar leyendo el código cuando esto falló.
  const bitacoraDestino = porDataset
    ? { destino: 'dataset_waba', datasetId, wabaId }
    : { destino: 'pixel', pixelId, ...(wabaId ? { wabaId } : {}) }

  try {
    const res = await fetch(`${GRAPH}/${destinoId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [evento], access_token: tokenDelDestino }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // El detalle de Meta es lo único que permite diagnosticar un token vencido
      // o un destino mal puesto: sin esto el fallo es invisible.
      const detalle = body?.error?.message || `HTTP ${res.status}`
      console.error(`META CAPI ${pedidoId} (${bitacoraDestino.destino} ${destinoId}): ${detalle}`)
      registrarEvento({ fuente: 'meta', nivel: 'error', mensaje: detalle, pedidoId, detalle: { ...bitacoraDestino, atribuido, origen } })
      return { ok: false, error: detalle, atribuido }
    }
    const recibidos = body?.events_received ?? 0

    // El Purchase que fue al dataset queda en la MISMA bitácora que usan los
    // inbox para LeadSubmitted e InitiateCheckout. Así se ven las tres señales de
    // una conversación juntas, que es la única forma de comprobar de un vistazo
    // que el círculo anuncio → chat → venta se está cerrando.
    if (porDataset) {
      await registrarCapiEvent({
        cuenta: String(tiendaId || '').toUpperCase().includes('IND') ? 'IND' : 'MANDI',
        telefono: normalizarTelefono(cliente?.celular),
        eventId: pedidoId,
        ctwaClid: ctwa.ctwaClid,
        wabaId,
        value: Number(parseFloat(montoTotal || 0).toFixed(2)),
        httpStatus: res.status,
        metaResponse: body,
      })
    }

    // Que la venta llevara atribución o no queda en la bitácora: es lo único que
    // permite ver, sin abrir Events Manager, si la pauta está cerrando el círculo.
    registrarEvento({
      fuente: 'meta', nivel: 'ok', pedidoId,
      mensaje: `Purchase recibido (${recibidos}) · ${origen}`,
      detalle: { ...bitacoraDestino, atribuido, origen },
    })
    return { ok: true, recibidos, destino: bitacoraDestino.destino, atribuido, origen }
  } catch (e) {
    console.error(`META CAPI ${pedidoId}: ${e.message}`)
    registrarEvento({ fuente: 'meta', nivel: 'error', mensaje: e.message, pedidoId })
    return { ok: false, error: e.message }
  }
}
