export const dynamic = 'force-dynamic'

// Muestra el RIDE (PDF) de una factura de Dátil.
//
// El navegador NO puede abrir el API de Dátil directamente porque exige el
// header X-Key. Este route consulta Dátil del lado servidor con la llave y
// entrega el PDF por una de estas vías (en orden):
//   1. Busca en el documento (GET /invoices/{id}) cualquier URL pública de PDF
//      (campos conocidos + escaneo profundo de todo el JSON).
//   2. Pide el documento/endpoints candidatos con Accept: application/pdf y,
//      si la respuesta ES un PDF, la transmite.
//   3. Si nada funciona, loguea el documento completo y devuelve el estado
//      real de la factura para diagnóstico.
//
// Requiere env var: DATIL_API_KEY (X-Key). Opcional: DATIL_API_PASSWORD.

// Busca recursivamente en el JSON cualquier string que parezca URL de un PDF/RIDE.
function buscarUrlPdf(obj, depth = 0) {
  if (obj == null || depth > 6) return null
  if (typeof obj === 'string') {
    const s = obj.trim()
    if (/^https?:\/\//i.test(s) && /(\.pdf(\?|$)|ride|printable|representacion|comprobante)/i.test(s)) {
      // Evitar volver a apuntar al mismo API que exige X-Key
      if (!/link\.datil\.co\/invoices\/[^/]+\/ride/i.test(s)) return s
    }
    return null
  }
  if (Array.isArray(obj)) {
    for (const v of obj) { const r = buscarUrlPdf(v, depth + 1); if (r) return r }
    return null
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) { const r = buscarUrlPdf(v, depth + 1); if (r) return r }
  }
  return null
}

// ¿La respuesta es realmente un PDF? (por content-type o por la firma %PDF)
function esPdf(res, buf) {
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('application/pdf')) return true
  if (buf && buf.byteLength > 4) {
    const head = new Uint8Array(buf.slice(0, 5))
    // %PDF-
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return true
  }
  return false
}

export async function GET(req, { params }) {
  const { id } = params
  if (!id) return new Response('Falta el ID de la factura', { status: 400 })

  const key = process.env.DATIL_API_KEY
  if (!key) {
    return new Response('Falta configurar DATIL_API_KEY en el servidor', { status: 500 })
  }

  const headers = { 'X-Key': key }
  if (process.env.DATIL_API_PASSWORD) headers['X-Password'] = process.env.DATIL_API_PASSWORD
  const base = `https://link.datil.co/invoices/${encodeURIComponent(id)}`

  try {
    // 1) Leer el documento
    const docRes = await fetch(base, { headers, cache: 'no-store' })
    const docText = await docRes.text()
    let doc = null
    try { doc = JSON.parse(docText) } catch {}

    // 1a) Campos conocidos + escaneo profundo del JSON
    const conocido =
      doc?.printable_version_url || doc?.ride_url || doc?.pdf_url ||
      doc?.url_ride || doc?.link_ride || null
    const printable = conocido || (doc ? buscarUrlPdf(doc) : null)

    console.log('[RIDE] id=%s docStatus=%s estado=%s printable=%s',
      id, docRes.status, doc?.estado || doc?.autorizacion?.estado || '?', printable || 'NINGUNO')

    if (printable) return Response.redirect(printable, 302)

    // 2) Intentar obtener el PDF pidiéndolo con Accept: application/pdf
    const pdfHeaders = { ...headers, Accept: 'application/pdf' }
    const candidatos = [
      `${base}/ride`,
      base,
      `${base}.pdf`,
      `${base}/pdf`,
    ]
    for (const url of candidatos) {
      try {
        const r = await fetch(url, { headers: pdfHeaders, cache: 'no-store' })
        if (!r.ok) { console.log('[RIDE] cand %s -> %s', url, r.status); continue }
        const buf = await r.arrayBuffer()
        if (esPdf(r, buf)) {
          console.log('[RIDE] PDF OK desde %s (%s bytes)', url, buf.byteLength)
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
              'Cache-Control': 'private, max-age=3600',
            },
          })
        }
        console.log('[RIDE] cand %s -> 200 pero no es PDF (ctype=%s)', url, r.headers.get('content-type'))
      } catch (err) {
        console.log('[RIDE] cand %s -> error %s', url, err.message)
      }
    }

    // 3) Nada funcionó: log completo del documento para diagnóstico
    console.log('[RIDE] SIN PDF id=%s doc=%s', id,
      doc ? JSON.stringify(doc).slice(0, 4000) : `(no-json) ${docText.slice(0, 500)}`)

    const estado = doc?.estado || doc?.autorizacion?.estado || 'DESCONOCIDO'
    return new Response(
      `No se pudo obtener el RIDE (PDF) de la factura en Dátil.\n` +
      `Estado del comprobante: ${estado}.\n` +
      `${estado !== 'AUTORIZADO' ? 'La factura debe estar AUTORIZADA para tener RIDE.' : 'La factura está autorizada pero Dátil no expuso el PDF por API; revísalo en el portal de Dátil o en el correo enviado al cliente.'}`,
      { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  } catch (e) {
    console.error('[RIDE] error', id, e)
    return new Response('Error al obtener el RIDE de Dátil: ' + e.message, { status: 502 })
  }
}
