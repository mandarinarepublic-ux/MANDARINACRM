'use client'
// Helper de generación de PDF por captura de nodos ya renderizados (html2canvas +
// jsPDF). Centraliza las opciones y el bucle que estaban repetidos en la página
// de impresión, la del pedido y la de producción.

export const H2C_OPTS = {
  scale: 2,
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  width: 794,
  windowWidth: 794,
  scrollX: 0,
  scrollY: 0,
  logging: false,
}

/**
 * Captura los nodos cuyos IDs se pasan (en orden) y arma un PDF A4 vertical,
 * una hoja por nodo, y lo descarga como `filename`.
 * Lanza si no encuentra ningún nodo. Devuelve cuántas hojas capturó.
 *
 * Los nodos deben existir en el DOM (típicamente en una zona oculta off-screen)
 * ANTES de llamar a esta función.
 */
export async function generarPdfDesdeIds(ids, filename) {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let primera = true
  let capturadas = 0

  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    const canvas = await html2canvas(el, H2C_OPTS)
    if (!primera) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
    canvas.width = 1; canvas.height = 1   // liberar memoria del canvas
    primera = false
    capturadas++
  }

  if (capturadas === 0) throw new Error('No se pudo generar el PDF (sin hojas)')
  pdf.save(filename)
  return capturadas
}

// ── La hoja del pedido como FOTO, para mandársela al cliente ─────────────────
//
// Mismo camino que el PDF (capturar los nodos que ya están en la zona oculta),
// pero el resultado no es un archivo que se descarga: es un JPG que viaja por
// postMessage hasta el inbox y de ahí a WhatsApp.
//
// JPG y no PNG a propósito: la hoja del cliente lleva degradado y fotos de las
// prendas, y en PNG la misma hoja pesa varias veces más. Todo ese peso se paga
// dos veces (el postMessage y después la subida a WhatsApp), y WhatsApp igual
// recomprime la foto al recibirla.

/** Calidad del JPG de la hoja. Calibrada para que el texto se lea sin engordar. */
export const CALIDAD_JPG_HOJA = 0.82

/**
 * Cede el hilo para que React alcance a pintar antes de que html2canvas (que es
 * síncrono y pesado) bloquee todo. Sin esto el botón nunca llega a mostrar que
 * está trabajando. Es el mismo truco de la pantalla de impresión.
 */
export const dejarPintar = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))

/**
 * Cuánto pesa de verdad un data URL, en KB. Función pura: sirve para avisarle al
 * vendedor y para las pruebas.
 *
 * Un data URL en base64 lleva 4 caracteres por cada 3 bytes, y el `=` del final
 * es relleno que NO son bytes.
 */
export function pesoKbDataUrl(dataUrl) {
  const s = String(dataUrl || '')
  const i = s.indexOf(',')
  if (i < 0) return 0
  const b64 = s.slice(i + 1)
  const relleno = (b64.match(/=+$/) || [''])[0].length
  const bytes = Math.max(0, Math.floor((b64.length * 3) / 4) - relleno)
  return Math.round(bytes / 1024)
}

/**
 * Captura los nodos cuyos IDs se pasan (en orden) y devuelve UN solo JPG con
 * todas las hojas apiladas una debajo de otra, como data URL.
 *
 * Lanza si falta cualquiera de las hojas: mandarle al cliente media hoja es peor
 * que no mandarle nada, porque nadie se entera de lo que falta.
 *
 * Los nodos deben existir en el DOM (la zona oculta off-screen) ANTES de llamar.
 */
export async function capturarHojasComoJpg(ids, calidad = CALIDAD_JPG_HOJA) {
  const lista = Array.isArray(ids) ? ids : []
  if (lista.length === 0) throw new Error('no hay ninguna hoja que capturar')

  const html2canvas = (await import('html2canvas')).default

  const lienzos = []
  try {
    for (const id of lista) {
      const el = document.getElementById(id)
      if (!el) throw new Error(`no se pudo renderizar la hoja ${id}`)
      lienzos.push(await html2canvas(el, H2C_OPTS))
    }

    // Una sola hoja es el caso normal: se usa tal cual, sin armar un segundo
    // lienzo del tamaño de la hoja solo para copiarla.
    if (lienzos.length > 1) lienzos.push(apilar(lienzos))
    const jpg = lienzos[lienzos.length - 1].toDataURL('image/jpeg', calidad)

    // Un canvas "manchado" por una imagen de otro dominio no lanza al dibujarse
    // sino acá, y algunos navegadores devuelven un PNG vacío en vez de lanzar.
    if (!jpg.startsWith('data:image/jpeg')) throw new Error('el navegador no pudo generar el JPG')
    return jpg
  } finally {
    // Liberar la memoria de los lienzos pase lo que pase: son ~14 MB cada uno.
    for (const c of lienzos) { c.width = 1; c.height = 1 }
  }
}

/** Pega los lienzos uno debajo de otro sobre fondo blanco. */
function apilar(lienzos) {
  const ancho = Math.max(...lienzos.map((c) => c.width))
  const alto = lienzos.reduce((s, c) => s + c.height, 0)
  const destino = document.createElement('canvas')
  destino.width = ancho
  destino.height = alto
  const ctx = destino.getContext('2d')
  // Sin esto los bordes que sobran quedarían transparentes, y en JPG lo
  // transparente se pinta NEGRO.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)
  let y = 0
  for (const c of lienzos) { ctx.drawImage(c, 0, y); y += c.height }
  return destino
}
