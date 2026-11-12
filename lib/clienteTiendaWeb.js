// lib/clienteTiendaWeb.js — Qué hacer con la ficha del cliente cuando el pedido
// viene de la TIENDA WEB (12-nov-2026). Puro: sin red, sin '@/'.
//
// ☠️ La tienda es pública: cualquiera puede escribir la cédula de otra persona.
// Antes, el upsert por cédula pisaba nombre, celular, correo y dirección de esa
// ficha con lo que escribiera el comprador — y el CRM, el despacho y los avisos
// terminaban apuntando al desconocido.
//
// Regla (endurecida tras dos revisiones de seguridad, 12-nov): desde la tienda
// una ficha que YA EXISTE solo se LLENA, nunca se pisa.
//   - no existe la cédula → crear
//   - existe              → se llenan SOLO los campos vacíos (nombre, correo,
//                           ciudad, dirección) y SOLO si el celular de la ficha
//                           coincide (3.ª revisión). El CELULAR nunca se escribe desde
//                           la tienda: es lo que identifica a la persona, y llenarlo
//                           dejaba tomar la ficha en dos compras (1.ª pone su celular
//                           en una ficha sin celular, 2.ª "coincide" y pisa todo).
//   - si algo de lo escrito no coincide con la ficha → el pedido lleva una nota
//     con los datos del comprador para que el vendedor confirme antes de despachar.

const digitos9 = (v) => String(v || '').replace(/\D/g, '').slice(-9)

/** ¿Dos celulares de Ecuador son el mismo? Compara los últimos 9 dígitos. */
export function mismoCelular(a, b) {
  const x = digitos9(a), y = digitos9(b)
  return x.length === 9 && x === y
}

/**
 * @param existente ficha del CRM (forma de toCliente: NOMBRE, CELULAR…) o null
 * @param data      lo que escribió el comprador { nombre, celular, email, ciudad, direccion }
 * @returns { accion: 'crear' | 'completar' | 'conservar', nota: string, campos? }
 *          `campos` (solo en 'completar'): lo que se escribe, únicamente donde la ficha estaba vacía
 */
export function decidirClienteWeb(existente, data = {}) {
  if (!existente) return { accion: 'crear', nota: '' }

  const campos = {}
  let distinto = false
  for (const [k, col] of Object.entries(COLUMNAS)) {
    const nuevo = String(data[k] || '').trim()
    const viejo = String(existente[col] || '').trim()
    if (!nuevo) continue
    if (k === 'celular') {
      // nunca se escribe; solo cuenta si la ficha tenía uno y es otro
      if (viejo && !mismoCelular(viejo, nuevo)) distinto = true
      continue
    }
    if (!viejo) campos[k] = nuevo
    else if (normal(viejo) !== normal(nuevo)) distinto = true
  }
  // compra sin celular contra una ficha que sí tiene: no se puede comprobar
  if (!String(data.celular || '').trim() && digitos9(existente.CELULAR).length === 9) distinto = true

  const nota = distinto ? notaComprador(data) : ''
  // Solo se escribe si el comprador DEMUESTRA ser el dueño: el celular que ya
  // tenía la ficha (puesto por un vendedor) coincide. Sin eso (ficha sin
  // celular, u otro celular) la ficha no se toca: los datos van en el pedido.
  const dueño = mismoCelular(existente.CELULAR, data.celular)
  return dueño && Object.keys(campos).length
    ? { accion: 'completar', campos, nota }
    : { accion: 'conservar', nota }
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
  return `⚠️ Los datos de esta compra web no coinciden con la ficha de esta cédula (lo que ya tenía la ficha no se cambió). ` +
    `Datos del comprador: ${comprador || 'sin datos'}. Confirma con quién hablar antes de despachar.`
}
