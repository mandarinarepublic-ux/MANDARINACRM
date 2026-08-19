import { searchClientes, getClienteById, listClientesPorIds, createCliente } from '@/lib/db/clientes'

// La consulta de clientes.
//
// ☠️ ANTES, hiciera lo que hiciera, empezaba por traer la TABLA ENTERA y recién
// después miraba qué le habían pedido: incluso buscar UN cliente por su id se
// llevaba los 900. Dos daños:
//
//   · PostgREST corta en 1000 filas EN SILENCIO. Con `crm.clientes` en 900 y
//     creciendo 44/semana, en septiembre un cliente que existe empezaba a verse
//     como inexistente — y el vendedor lo retecleaba, sobrescribiendo el nombre
//     bueno al guardar.
//   · `?all=1` mandaba 900 cédulas al navegador de cualquier sesión.
//
// Ahora cada modo pide EXACTAMENTE lo que necesita, y la lectura más pesada de
// esta ruta pasó de 900 filas a 20.
const TOPE_BUSQUEDA = 10
const TOPE_LISTA = 20

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const byId = searchParams.get('id') || ''
    const ids = searchParams.get('ids') || ''

    // UN cliente por su id: una fila, no novecientas.
    if (byId) {
      const found = await getClienteById(byId)
      return Response.json({ clientes: found ? [found] : [] })
    }

    // Los clientes de una lista concreta. Reemplaza al viejo `?all=1`: quien
    // los pedía (Impresión) ya sabe de qué pedidos son, así que no hay ninguna
    // razón para mandarle la agenda completa.
    if (ids) {
      const lista = ids.split(',').map((s) => s.trim()).filter(Boolean)
      if (lista.length === 0) return Response.json({ clientes: [] })
      const clientes = await listClientesPorIds(lista)
      return Response.json({ clientes })
    }

    // Búsqueda: filtra en la BASE contra la columna `busqueda`, que ya viene sin
    // tildes y con cédula y celular reducidos a dígitos. Buscar "maria"
    // encontraba 23 de las 50 Marías reales; ahora las encuentra todas.
    if (q) {
      const clientes = await searchClientes(q, TOPE_BUSQUEDA)
      // Se conserva poder pegar un CLIENTE_ID en el buscador. Solo se intenta
      // si no hubo coincidencias: es un caso raro y no vale una consulta extra.
      if (clientes.length === 0) {
        const porId = await getClienteById(q.trim())
        if (porId) return Response.json({ clientes: [porId] })
      }
      return Response.json({ clientes })
    }

    // Sin término: los primeros, para arrancar el buscador. NO son "todos".
    const clientes = await searchClientes('', TOPE_LISTA)
    return Response.json({ clientes })
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
