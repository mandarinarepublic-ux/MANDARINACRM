/**
 * Paginación de la orden de confección.
 *
 * Vive aparte del componente (que es 'use client' + JSX) para que sea lógica
 * pura, importable desde las tres pantallas que generan PDF y verificable sin
 * un navegador.
 */

// Capacidad de una hoja de confección, en "pesos" de ítem. Un ítem normal pesa 1,
// así que siguen entrando 3 como siempre. El 0.2 de holgura permite que tres
// ítems con notas CORTAS sigan compartiendo hoja (caben de sobra en el papel);
// solo el texto de verdad largo obliga a partir.
export const CAPACIDAD_HOJA_CONF = 3.2

/**
 * Cuánto espacio ocupa un ítem en la hoja. La hoja tiene alto FIJO (1123px) con
 * overflow:hidden, así que un ítem con instrucciones largas empujaba al tercero
 * fuera del papel y se perdía SIN AVISO — la fábrica recibía una orden incompleta.
 * Los ítems "pesados" ocupan más y por tanto entran menos por hoja.
 */
export function pesoItem(item) {
  const fotos = [item?.FOTO_PECHO_URL, item?.FOTO_ESPALDA_URL, item?.FOTO_MANGA_D_URL, item?.FOTO_MANGA_I_URL]
    .filter(Boolean).length

  // Cada bloque de texto se mide APARTE: son dos recuadros distintos en la hoja
  // (📋 Instrucciones y 📝 Nota de área), cada uno con su título y sus márgenes.
  // Sumarlos en un solo string subestimaba el alto real de un ítem con ambos.
  // El crecimiento es CONTINUO, no por escalones: con Math.floor, 199 y 200
  // caracteres daban pesos muy distintos y la paginación se volvía caprichosa.
  const OVERHEAD_BLOQUE = 20   // título + padding del recuadro, en "equivalente a caracteres"
  const bloques = [item?.DETALLE_PERSONALIZADO, item?.NOTAS_AREA].filter(Boolean)
  let peso = 1
  for (const t of bloques) {
    peso += ((String(t).length + OVERHEAD_BLOQUE) / 200) * 0.4   // ~3 líneas de 10px cada 200 chars
  }
  if (fotos >= 3) peso += 0.25                // 2 filas de fotos en vez de 1
  if (item?.ARCHIVO_DISENO_URL) peso += 0.15
  return peso
}

/** Un ítem que ni solo cabe en una hoja: su texto se va a recortar. */
export function itemDesborda(item, capacidad = CAPACIDAD_HOJA_CONF) {
  return pesoItem(item) > capacidad
}

// ─── Hoja del cliente ────────────────────────────────────────────────────────
// Tope de prendas por hoja, definido por el negocio: hasta 4 en la hoja principal
// (2×2) y hasta 8 en cada hoja adicional.
export const MAX_PRENDAS_CLIENTE_PRIMERA = 4
export const MAX_PRENDAS_CLIENTE_EXTRA   = 8

// Tope de ESPACIO, en múltiplos de una fila de DOS prendas (~100px: foto de 72 +
// paddings + borde + separación). Medido sobre el layout real de
// PdfGraciasPagina, contando que el contenido útil termina en y=1093 (el footer
// absoluto ocupa los últimos 30px):
//
//   primera hoja: 1093 − 676 (saludo + cupón + datos de envío + título) = 417px → 4,1 filas
//   adicional:    1093 − 184 (cabecera compacta + título) − 66 (bloque de pago) = 843px → 8,4 filas
//
// Los dos topes se aplican a la vez: el de prendas manda en el caso normal, y el
// de espacio evita el recorte cuando las instrucciones son largas.
export const CAPACIDAD_CLIENTE_PRIMERA = 4
export const CAPACIDAD_CLIENTE_EXTRA   = 8

// Una franja de ancho completo es más alta que una fila de dos: la foto pasa de
// 72 a 92px (124px de fila contra 100px).
const FACTOR_FILA_ANCHA = 1.24

// A partir de este largo, las instrucciones no entran cómodas en media hoja y la
// prenda pasa a ocupar una franja de ancho completo.
export const LARGO_INSTRUCCIONES_ANCHA = 180

/** ¿Esta prenda necesita la fila entera para que quepan sus instrucciones? */
export function prendaEsAncha(item) {
  return String(item?.DETALLE_PERSONALIZADO || '').length > LARGO_INSTRUCCIONES_ANCHA
}

/**
 * Alto de una prenda en la hoja del cliente, en múltiplos de una fila simple.
 * En media columna el texto ocupa el doble de líneas (la mitad de ancho útil).
 */
export function pesoItemCliente(item, mediaColumna = false) {
  let peso = 1
  const instrucciones = item?.DETALLE_PERSONALIZADO
  if (instrucciones) {
    // El recuadro tiene ~25px fijos de caja y título aunque el texto sea de una
    // línea; por eso el overhead equivale a ~130 caracteres, no a 20.
    const base = ((String(instrucciones).length + 130) / 200) * 0.35
    peso += mediaColumna ? base * 2 : base
  }
  return peso
}

/**
 * Agrupa las prendas en filas de 1 o 2 según lo pedido:
 *   1 prenda  → una franja de ancho completo
 *   2 prendas → dos franjas de ancho completo (una debajo de la otra)
 *   3 prendas → dos arriba compartiendo fila + una franja ancha abajo
 *   4 prendas → cuadrícula 2×2
 *   más       → de a dos por fila; si sobra una impar, va en franja ancha
 * Una prenda con instrucciones largas siempre se lleva la fila entera.
 */
export function distribuirFilasCliente(items) {
  const lista = items || []
  // Con una o dos prendas hay papel de sobra: se lucen a lo ancho.
  if (lista.length <= 2) return lista.map(it => [it])

  const filas = []
  let pendiente = null
  for (const it of lista) {
    if (prendaEsAncha(it)) {
      if (pendiente) { filas.push([pendiente]); pendiente = null }
      filas.push([it])
      continue
    }
    if (pendiente) { filas.push([pendiente, it]); pendiente = null }
    else pendiente = it
  }
  if (pendiente) filas.push([pendiente])
  return filas
}

/** Alto de una fila = el de la prenda más alta que contenga. */
export function pesoFilaCliente(fila) {
  const mitad = fila.length > 1
  const base = mitad ? 1 : FACTOR_FILA_ANCHA
  // pesoItemCliente devuelve 1 + texto; se reemplaza ese 1 por la base de la fila.
  return Math.max(...fila.map(it => pesoItemCliente(it, mitad) - 1 + base))
}

/**
 * Reparte las prendas entre la hoja principal (que va apretada por el saludo y
 * los datos de envío) y las adicionales.
 * Devuelve [{ items, filas, offset }] — `filas` es lo que se pinta; `items` se
 * mantiene para conservar el contrato anterior.
 */
export function paginarItemsCliente(items) {
  const lista = items || []
  if (lista.length === 0) return [{ items: [], filas: [], offset: 0 }]

  const paginas = []
  let actual = []          // filas de la hoja en curso
  let nItems = 0
  let peso = 0
  let offset = 0

  const esPrimera = () => paginas.length === 0
  const maxItems = () => (esPrimera() ? MAX_PRENDAS_CLIENTE_PRIMERA : MAX_PRENDAS_CLIENTE_EXTRA)
  const maxPeso  = () => (esPrimera() ? CAPACIDAD_CLIENTE_PRIMERA : CAPACIDAD_CLIENTE_EXTRA)

  function cerrarHoja() {
    const items = actual.flat()
    paginas.push({ items, filas: actual, offset })
    offset += items.length
    actual = []
    nItems = 0
    peso = 0
  }

  // Las filas se arman sobre TODA la lista y después se reparten entre hojas, de
  // modo que el emparejado no dependa de dónde caiga el corte de página.
  for (const fila of distribuirFilasCliente(lista)) {
    const p = pesoFilaCliente(fila)
    const excedeItems = nItems + fila.length > maxItems()
    const excedePeso  = peso + p > maxPeso()
    if (actual.length > 0 && (excedeItems || excedePeso)) cerrarHoja()
    actual.push(fila)
    nItems += fila.length
    peso += p
  }
  if (actual.length > 0) cerrarHoja()
  return paginas
}

/**
 * Reparte los ítems en hojas respetando la capacidad real de cada una.
 * Devuelve [{ items, offset }] para que la numeración (#1, #2, ...) siga corrida
 * entre hojas. Fuente ÚNICA de la paginación: antes el "3 por hoja" estaba
 * duplicado a mano en la página de impresión, la del pedido y el componente.
 *
 * Garantías (verificadas en scripts/test-impresion.mjs):
 *  - nunca pierde ni duplica un ítem
 *  - siempre devuelve al menos una página (un pedido sin ítems imprime la hoja vacía)
 *  - los offsets son consecutivos, así que la numeración no se repite entre hojas
 */
export function paginarItems(items, capacidad = CAPACIDAD_HOJA_CONF) {
  const lista = items || []
  if (lista.length === 0) return [{ items: [], offset: 0 }]

  const paginas = []
  let actual = []
  let peso = 0
  let offset = 0

  for (const item of lista) {
    const p = Math.min(pesoItem(item), capacidad)   // un ítem gigante ocupa su hoja
    if (actual.length > 0 && peso + p > capacidad) {
      paginas.push({ items: actual, offset })
      offset += actual.length
      actual = []
      peso = 0
    }
    actual.push(item)
    peso += p
  }
  if (actual.length > 0) paginas.push({ items: actual, offset })
  return paginas
}
