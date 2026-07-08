export const dynamic = 'force-dynamic'

// Muestra el RIDE (PDF) de una factura de Dátil.
//
// El navegador NO puede abrir el API de Dátil directamente porque exige el
// header X-Key. Este route consulta Dátil del lado servidor con la llave y:
//   1. Lee el documento (GET /invoices/{id}) y busca la URL pública del PDF
//      (campo printable_version_url / ride_url / ride).
//   2. Si la encuentra, redirige el navegador a ese PDF.
//   3. Si no, intenta el endpoint /invoices/{id}/ride y transmite el PDF.
//
// Requiere env var: DATIL_API_KEY (X-Key). Opcional: DATIL_API_PASSWORD.
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
    // 1) Leer el documento para encontrar la URL pública del PDF
    const docRes = await fetch(base, { headers, cache: 'no-store' })
    const docText = await docRes.text()
    let doc = null
    try { doc = JSON.parse(docText) } catch {}

    const printable =
      doc?.printable_version_url || doc?.ride_url || doc?.ride ||
      doc?.pdf_url || doc?.url_ride || doc?.link_ride || null

    // Log de diagnóstico (visible en Vercel > Logs)
    console.log('[RIDE] id=%s docStatus=%s printable=%s keys=%s',
      id, docRes.status, printable || 'NINGUNO',
      doc ? Object.keys(doc).join(',') : `(no-json) ${docText.slice(0, 200)}`)

    if (printable) {
      return Response.redirect(printable, 302)
    }

    // 2) Fallback: endpoint /ride directo
    const rideRes = await fetch(`${base}/ride`, { headers, cache: 'no-store' })
    console.log('[RIDE] id=%s rideStatus=%s ctype=%s', id, rideRes.status, rideRes.headers.get('content-type'))

    if (rideRes.ok) {
      const buf = await rideRes.arrayBuffer()
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': rideRes.headers.get('content-type') || 'application/pdf',
          'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    return new Response(
      `No se pudo obtener el RIDE en Dátil (documento: ${docRes.status}, ride: ${rideRes.status}). ` +
      `Verifica que la factura exista y esté autorizada.`,
      { status: 502 },
    )
  } catch (e) {
    console.error('[RIDE] error', id, e)
    return new Response('Error al obtener el RIDE de Dátil: ' + e.message, { status: 502 })
  }
}
