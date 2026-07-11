import { readSheet, appendRow, fechaAhora } from '@/lib/sheets'
import { v4 as uuid } from 'uuid'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.toLowerCase() || ''
    const byId = searchParams.get('id') || ''
    const all = searchParams.get('all')

    const clientes = await readSheet('CLIENTES')

    // Devuelve TODA la hoja en UNA sola lectura. Lo usa la impresión masiva
    // para no disparar N lecturas paralelas a Sheets (que provocaban 429 y
    // pedidos impresos sin la sección de datos del cliente).
    if (all) {
      return Response.json({ clientes })
    }

    if (byId) {
      const found = clientes.find(c => c.CLIENTE_ID === byId)
      return Response.json({ clientes: found ? [found] : [] })
    }

    if (!q) return Response.json({ clientes: clientes.slice(0, 20) })

    const filtered = clientes.filter(c =>
      c.NOMBRE?.toLowerCase().includes(q) ||
      c.CEDULA?.includes(q) ||
      c.CELULAR?.includes(q) ||
      c.CLIENTE_ID === q
    ).slice(0, 10)

    return Response.json({ clientes: filtered })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const id = uuid()
    await appendRow('CLIENTES', [
      id, body.nombre, String(body.cedula), String(body.celular),
      body.email || '', body.ciudad || '', body.direccion || '', fechaAhora(),
    ])
    return Response.json({ id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
