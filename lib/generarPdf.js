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

// ── Un documento de ALTO LIBRE en A4 (la cotización) ────────────────────────
//
// El resto del CRM captura nodos que YA están diseñados como una hoja A4 y los
// estira a 210×297 (`generarPdfDesdeIds`). La cotización no es así: mide 820 px
// de ancho y lo que haga falta de alto, según cuántas prendas lleve. Estirarla a
// 297 mm la aplastaría o la estiraría según el caso.
//
// Antes esto no existía y «Exportar PDF» hacía `window.print()`: paginaba el
// NAVEGADOR, con sus márgenes, su cabecera y su pie. Por eso una cotización de
// UNA prenda salía en dos hojas —la segunda casi vacía— aunque el contenido
// entrara de sobra en una.

/** La hoja, en milímetros. */
export const A4_MM = { ancho: 210, alto: 297 }

/**
 * Cuánto se tolera encoger con tal de no partir el documento en dos.
 *
 * 1.30 = si el contenido se pasa hasta un 30%, entra igual en una hoja
 * dibujándolo al 77%. Más que eso la letra empieza a costar de leer y es
 * preferible una segunda hoja honesta a una sola ilegible.
 */
export const TOLERANCIA_UNA_HOJA = 1.3

/**
 * Qué parte de una hoja puede sobrar sin que se abra otra.
 *
 * 0.5% de un A4 son ~1.5 mm: menos de media línea de texto. Lo que cae ahí es
 * redondeo, no contenido.
 */
export const SOBRA_DESPRECIABLE = 0.005

/**
 * Dónde y de qué tamaño va el lienzo capturado dentro del PDF.
 *
 * Función PURA (no toca el DOM) para poder probar la cuenta, que es la parte
 * que decide si el cliente recibe una hoja o dos.
 *
 *  · `una-hoja`  cabe tal cual, a tamaño natural. El caso normal.
 *  · `encogida`  se pasa poco: se dibuja más chico y centrado, en UNA hoja.
 *  · `paginada`  se pasa mucho: se corta en hojas de A4.
 */
export function encajeEnA4(anchoPx, altoPx, tolerancia = TOLERANCIA_UNA_HOJA) {
  const w = Number(anchoPx) || 0
  const h = Number(altoPx) || 0
  if (w <= 0 || h <= 0) throw new Error('el lienzo no tiene tamaño')

  const altoMm = A4_MM.ancho * (h / w)

  if (altoMm <= A4_MM.alto) {
    return { modo: 'una-hoja', x: 0, y: 0, ancho: A4_MM.ancho, alto: altoMm, hojas: 1, escala: 1 }
  }

  if (altoMm <= A4_MM.alto * tolerancia) {
    const escala = A4_MM.alto / altoMm
    const ancho = A4_MM.ancho * escala
    return { modo: 'encogida', x: (A4_MM.ancho - ancho) / 2, y: 0, ancho, alto: A4_MM.alto, hojas: 1, escala }
  }

  // Alto de una hoja MEDIDO EN PÍXELES DEL LIENZO, que es como hay que cortarlo.
  //
  // ⚠️ Redondeado, NO truncado. Con `Math.floor` cada hoja quedaba una fracción
  // de píxel corta, y al tercer corte esa deuda sumaba lo bastante como para
  // dejar una sobra de 3 px: una CUARTA hoja con una franja blanca. Es
  // exactamente el defecto del que veníamos huyendo.
  const altoHojaPx = Math.round(w * (A4_MM.alto / A4_MM.ancho))
  // Y aun redondeando puede quedar una tira de nada. Una sobra más fina que
  // esto no es contenido —es redondeo de subpíxel— y no se gana una hoja: media
  // línea de texto mide seis veces más.
  const sobra = altoHojaPx * SOBRA_DESPRECIABLE
  return {
    modo: 'paginada',
    hojas: Math.max(1, Math.ceil((h - sobra) / altoHojaPx)),
    altoHojaPx, sobra, escala: 1,
  }
}

/**
 * Espera a que las fotos del nodo estén cargadas.
 *
 * ⚠️ Sin esto el PDF sale con huecos donde van las prendas y NADIE se entera
 * hasta que el cliente abre el archivo. Antes se esperaba `setTimeout(400)` a
 * ojo: alcanzaba con que Cloudinary tardara medio segundo —o con una conexión
 * de celular— para mandar una cotización sin fotos.
 *
 * El tope existe porque una foto rota nunca dispara `load`, y es mejor un PDF
 * con un hueco que un botón que se queda colgado para siempre.
 */
export async function esperarImagenes(nodo, msMax = 6000) {
  const imgs = Array.from(nodo?.querySelectorAll?.('img') || [])
  const pendientes = imgs.filter((i) => !i.complete)
  if (pendientes.length === 0) return
  await Promise.race([
    Promise.all(pendientes.map((i) => new Promise((r) => { i.onload = r; i.onerror = r }))),
    new Promise((r) => setTimeout(r, msMax)),
  ])
}

/**
 * Captura UN nodo de alto libre y devuelve el PDF A4 armado (sin guardarlo).
 *
 * Devuelve el documento y no un archivo a propósito: de acá salen los DOS
 * botones —guardar y compartir por WhatsApp— y tienen que producir exactamente
 * el mismo PDF. Si cada uno lo armara por su lado, un día se separarían y el
 * cliente recibiría algo distinto de lo que el vendedor revisó.
 */
export async function pdfDeDocumento(id, { tolerancia = TOLERANCIA_UNA_HOJA, calidad = 0.92, anchoPx } = {}) {
  const el = document.getElementById(id)
  if (!el) throw new Error(`no se pudo renderizar el documento (${id})`)

  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default

  await esperarImagenes(el)

  // ⚠️ NO se usa el `width` de H2C_OPTS (794 px, un A4 exacto). Ese vale para
  // las hojas del pedido, que están diseñadas a esa medida; a un documento más
  // ancho —la cotización mide 820— le RECORTARÍA el borde derecho, en silencio.
  //
  // ⚠️ Y tampoco se deja al ancho de la ventana: el mismo botón daría un PDF
  // distinto desde un celular que desde un escritorio. Se captura al ancho de
  // DISEÑO, que quien llama conoce y comparte con el documento en pantalla.
  const ancho = Math.round(Number(anchoPx) || el.offsetWidth || H2C_OPTS.width)
  const lienzo = await html2canvas(el, { ...H2C_OPTS, width: ancho, windowWidth: ancho })
  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const encaje = encajeEnA4(lienzo.width, lienzo.height, tolerancia)

    if (encaje.modo !== 'paginada') {
      const img = lienzo.toDataURL('image/jpeg', calidad)
      // Un lienzo "manchado" por una foto de otro dominio no lanza al dibujarse
      // sino acá, y algún navegador devuelve un PNG vacío en vez de lanzar.
      if (!img.startsWith('data:image/jpeg')) throw new Error('el navegador no pudo generar el PDF')
      pdf.addImage(img, 'JPEG', encaje.x, encaje.y, encaje.ancho, encaje.alto)
      return { pdf, encaje }
    }

    // Se pasa de largo: se corta en hojas. El corte puede partir una prenda por
    // la mitad — es lo mismo que hacía el navegador, y por eso se prefiere
    // encoger mientras se pueda.
    let y = 0
    let primera = true
    // `- encaje.sobra`: una tira más fina que eso no se lleva una hoja propia.
    while (y < lienzo.height - encaje.sobra) {
      const alto = Math.min(encaje.altoHojaPx, lienzo.height - y)
      const tajada = document.createElement('canvas')
      tajada.width = lienzo.width
      tajada.height = alto
      const ctx = tajada.getContext('2d')
      // Lo transparente se pinta NEGRO en JPG: la última hoja, que casi nunca
      // llega abajo, saldría con una franja negra.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, lienzo.width, alto)
      ctx.drawImage(lienzo, 0, y, lienzo.width, alto, 0, 0, lienzo.width, alto)
      if (!primera) pdf.addPage()
      pdf.addImage(
        tajada.toDataURL('image/jpeg', calidad), 'JPEG',
        0, 0, A4_MM.ancho, A4_MM.ancho * (alto / lienzo.width),
      )
      tajada.width = 1; tajada.height = 1
      primera = false
      y += alto
    }
    return { pdf, encaje }
  } finally {
    lienzo.width = 1; lienzo.height = 1   // ~14 MB por lienzo
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
