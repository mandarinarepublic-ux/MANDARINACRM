export const dynamic = 'force-dynamic'

// Proxy del RIDE de Dátil.
// El navegador NO puede abrir https://link.datil.co/invoices/{id}/ride
// directamente porque ese endpoint exige el header X-Key (da 403 Forbidden).
// Este route lo pide del lado servidor con la llave y devuelve el PDF.
//
// Requiere en las env vars: DATIL_API_KEY (X-Key de Dátil).
// Opcional: DATIL_API_PASSWORD (X-Password) si tu cuenta lo exige para lectura.
export async function GET(req, { params }) {
  const { id } = params
  if (!id) return new Response('Falta el ID de la factura', { status: 400 })

  const key = process.env.DATIL_API_KEY
  if (!key) {
    return new Response('Falta configurar DATIL_API_KEY en el servidor', { status: 500 })
  }

  try {
    const headers = { 'X-Key': key }
    if (process.env.DATIL_API_PASSWORD) headers['X-Password'] = process.env.DATIL_API_PASSWORD

    const r = await fetch(`https://link.datil.co/invoices/${encodeURIComponent(id)}/ride`, {
      headers,
      cache: 'no-store',
    })

    if (!r.ok) {
      const detalle = await r.text().catch(() => '')
      return new Response(
        `Dátil respondió ${r.status} al pedir el RIDE. ${detalle.slice(0, 300)}`,
        { status: r.status },
      )
    }

    const buf = await r.arrayBuffer()
    const contentType = r.headers.get('content-type') || 'application/pdf'
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e) {
    return new Response('Error al obtener el RIDE de Dátil: ' + e.message, { status: 502 })
  }
}
