// Canjes del club de premios → pedido de $0 en el CRM (14-oct-2026).
// PURO a propósito: sin red y sin base, para probarlo con node --test.
//
// La app del club (Desktop\FIDELIZACION\premios) descuenta los puntos y llama a
// POST /api/fidelidad/canje con este cuerpo. Aquí se valida y se traduce al
// mismo cuerpo que usa Nueva Venta, igual que lib/shopifyPedido.js con Shopify.
//
// ☠️ Un canje NUNCA cobra. Precio, pagos y factura se fuerzan aquí y no se
// confía en lo que mande el cuerpo: un pedido de canje con precio entraría a
// caja como deuda del cliente y a Meta como una venta.

import { timingSafeEqual } from 'node:crypto'
import { normalizarCelular, identificacionPendiente } from './shopifyPedido.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIENDAS = new Set(['MANDARINA', 'INDSTORE'])
const AREA_CANJE = 'PRODUCTO SIN DISEÑO'
const limpio = (x) => String(x ?? '').replace(/[^\x21-\x7E]/g, '') // BOM y espacios de PowerShell

/** Authorization: Bearer <FIDELIDAD_TOKEN>. Sin token configurado, no entra nadie. */
export function tokenFidelidadValido(cabecera, esperado) {
  const e = limpio(esperado)
  if (!e) return false
  const r = limpio(String(cabecera ?? '').replace(/^Bearer\s+/i, ''))
  const a = Buffer.from(r), b = Buffer.from(e)
  return a.length === b.length && timingSafeEqual(a, b)
}

const texto = (x, max = 200) => String(x ?? '').trim().slice(0, max)

/**
 * Valida el canje y arma el cuerpo de /api/pedidos.
 * @returns {{ok:true, canjeId:string, cuerpo:object} | {ok:false, error:string}}
 */
export function armarPedidoDeCanje(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'cuerpo inválido' }
  if (!UUID.test(String(p.canjeId ?? ''))) return { ok: false, error: 'canjeId inválido' }
  if (!TIENDAS.has(p.tiendaId)) return { ok: false, error: 'tienda inválida' }
  // Un canje es UNA prenda. Sin prendas, el pedido se auto-despacharía
  // (`todosItemsListos` usa .every(), que sobre vacío da true).
  if (!Array.isArray(p.items) || p.items.length !== 1) return { ok: false, error: 'un canje lleva exactamente una prenda' }
  const nombre = texto(p.cliente?.nombre, 120)
  const celular = normalizarCelular(p.cliente?.celular)
  if (!nombre || !celular) return { ok: false, error: 'falta nombre o celular' }
  const item = p.items[0]
  const producto = texto(item?.productoNombre, 120)
  if (!producto) return { ok: false, error: 'falta el producto' }

  const cedula = texto(p.cliente?.cedula, 20)
  return {
    ok: true,
    canjeId: String(p.canjeId).toLowerCase(),
    cuerpo: {
      tiendaId: p.tiendaId,
      cliente: {
        nombre,
        // Sin cédula se usa PENDIENTE-<celular> (se lee como PASAPORTE), igual que Shopify.
        cedula: /^[A-Za-z0-9-]{3,20}$/.test(cedula) ? cedula : identificacionPendiente(celular, p.canjeId),
        celular,
        email: '',
        ciudad: texto(p.cliente?.ciudad, 80),
        direccion: texto(p.cliente?.direccion, 300),
      },
      items: [{
        productoNombre: producto,
        talla: texto(item.talla, 20),
        color: texto(item.color, 40),
        cantidad: 1,
        precioUnit: 0,
        area: texto(item.area, 60) || AREA_CANJE,
        esPersonalizado: false,
      }],
      pagos: [],
      emitirFactura: false,
      ciudadPedido: texto(p.ciudadPedido, 80),
      direccionTexto: texto(p.direccionTexto, 300),
      notasVendedor: texto(p.notasVendedor, 500) || '🎁 CANJE DE PUNTOS',
    },
  }
}
