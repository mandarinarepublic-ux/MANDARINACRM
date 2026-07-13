import { listClientes, createCliente } from '@/lib/db/clientes'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.toLowerCase() || ''
    const byId = searchParams.get('id') || ''
    const all = searchParams.get('all')

    // Lectura vía repo (respeta DATA_BACKEND). La ruta aplica los mismos modos.
    const clientes = await listClientes()

    // Devuelve TODA la lista en UNA sola lectura. Lo usa la impresión masiva
    // para no disparar N lecturas paralelas (que provocaban 429 y pedidos
    // impresos sin la sección de datos del cliente).
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
    // dual-write: Sheets (primario) + Supabase (espejo). Misma fila de Sheets que antes.
    const id = await createCliente({
      nombre: body.nombre,
      cedula: body.cedula,
      celular: body.celular,
      email: body.email,
      ciudad: body.ciudad,
      direccion: body.direccion,
    })
    return Response.json({ id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
