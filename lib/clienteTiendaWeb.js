// lib/clienteTiendaWeb.js — Qué hacer con la ficha del cliente cuando el pedido
// viene de la TIENDA WEB (12-nov-2026). Puro: sin red, sin '@/'.
//
// ☠️ La tienda es pública: cualquiera puede escribir la cédula de otra persona.
// Antes, el upsert por cédula pisaba nombre, celular, correo y dirección de esa
// ficha con lo que escribiera el comprador — y el CRM, el despacho y los avisos
// terminaban apuntando al desconocido.
//
// Regla: el CELULAR prueba que es la misma persona.
//   - no existe la cédula            → crear
//   - mismo celular                  → actualizar (como siempre)
//   - ficha SIN celular              → completar: solo se llenan los campos
//                                      VACÍOS, nada se pisa (revisión de
//                                      seguridad 12-nov: si no, cualquiera ponía
//                                      su celular y se quedaba con la ficha)
//   - otro celular (o compra sin)    → conservar la ficha intacta
// Siempre que algo no coincida, el pedido lleva una nota con los datos del comprador.

const digitos9 = (v) => String(v || '').replace(/\D/g, '').slice(-9)

/** ¿Dos celulares de Ecuador son el mismo? Compara los últimos 9 dígitos. */
export function mismoCelular(a, b) {
  const x = digitos9(a), y = digitos9(b)
  return x.length === 9 && x === y
}

/**
 * @param existente ficha del CRM (forma de toCliente: NOMBRE, CELULAR…) o null
 * @param data      lo que escribió el comprador { nombre, celular, email, ciudad, direccion }
 * @returns { accion: 'crear' | 'actualizar' | 'completar' | 'conservar', nota: string, campos? }
 *          `campos` (solo en 'completar'): lo que se escribe, únicamente donde la ficha estaba vacía
 */
export function decidirClienteWeb(existente, data = {}) {
  if (!existente) return { accion: 'crear', nota: '' }
  if (mismoCelular(existente.CELULAR, data.celular)) return { accion: 'actualizar', nota: '' }

  if (digitos9(existente.CELULAR).length < 9) {
    const campos = {}
    let distinto = false
    for (const [k, col] of Object.entries(COLUMNAS)) {
      const nuevo = String(data[k] || '').trim()
      const viejo = String(existente[col] || '').trim()
      if (!nuevo) continue
      if (!viejo) campos[k] = nuevo
      else if (normal(viejo) !== normal(nuevo)) distinto = true
    }
    return { accion: 'completar', campos, nota: distinto ? notaComprador(data) : '' }
  }

  return { accion: 'conservar', nota: notaComprador(data) }
}

const COLUMNAS = { nombre: 'NOMBRE', celular: 'CELULAR', email: 'EMAIL', ciudad: 'CIUDAD', direccion: 'DIRECCION' }
const normal = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ')

function notaComprador(data) {
  const comprador = [
    data.nombre && `nombre ${data.nombre}`,
    data.celular && `celular ${data.celular}`,
    data.email && `correo ${data.email}`,
    (data.ciudad || data.direccion) && `envío ${[data.direccion, data.ciudad].filter(Boolean).join(', ')}`,
  ].filter(Boolean).join(' · ')
  return `⚠️ Los datos de esta compra web no coinciden con la ficha de esta cédula (no se cambió la ficha). ` +
    `Datos del comprador: ${comprador || 'sin datos'}. Confirma con quién hablar antes de despachar.`
}
