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
