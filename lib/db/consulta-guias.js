// lib/db/consulta-guias.js
//
// 🚚 Consultar guías (20-nov-2026): "¿ya salió el pedido de este cliente?, ¿con
// qué guía?". Solo LECTURA. La regla pura (qué se escribió, cómo se puntúa) está
// en lib/consulta-guias.js.
//
// ☠️ El alcance es el MISMO del Historial (`aplicarAlcance`): un VENDEDOR ve solo
// sus pedidos (salvo VER_TODAS_LAS_VENTAS) y de sus tiendas. Se aplica a TODA
// consulta de pedidos de acá, también cuando se llega por el número de guía: si
// no, buscando números al azar se vería a quién le llegó qué.
//
// Las listas de ids que van en `.in()` se quedan muy por debajo del tope de 200
// (la URL revienta con ~1000 ids; ver lib/historial-busqueda.js).

import { getSupabase } from '../supabase.js'
import { aplicarAlcance } from './historial.js'
import {
  tipoDeBusqueda, pareceNumeroDeGuia, palabrasParaBuscar, patronSinTildes, puntuarCliente,
  fotoSegura, ordenarResultados, cola9,
} from '../consulta-guias.js'

const COLS_CLIENTE = ['cliente_id', 'nombre', 'cedula', 'celular', 'ciudad', 'direccion'].join(',')
const COLS_PEDIDO = ['pedido_id', 'tienda_id', 'vendedor_id', 'cliente_id', 'fecha_pedido', 'estado_pedido', 'ciudad_pedido', 'direccion_pedido'].join(',')
const MAX_CLIENTES = 30
const MAX_PEDIDOS = 40

const datos = ({ data, error }) => { if (error) throw error; return data || [] }

/**
 * @returns {Promise<{ resultados: object[], tipo: string }>}
 */
export async function consultarGuias({ usuario, q }) {
  const sb = getSupabase()
  const texto = String(q ?? '').trim()
  const b = tipoDeBusqueda(texto)
  if (b.tipo === 'vacio' || texto.length < 3) return { resultados: [], tipo: b.tipo }

  // Acotada AQUÍ (no solo donde se usa): así ninguna rama nueva puede olvidar el tope.
  const pedidosQ = () => aplicarAlcance(sb.from('pedidos').select(COLS_PEDIDO).limit(MAX_PEDIDOS * 2), usuario)
  const porPedido = new Map()   // pedido_id → { p, puntos, razones }
  const sumar = (lista, puntos, razon) => {
    for (const p of lista) {
      const ya = porPedido.get(p.pedido_id)
      if (ya) { ya.puntos += puntos; if (!ya.razones.includes(razon)) ya.razones.push(razon) }
      else porPedido.set(p.pedido_id, { p, puntos, razones: [razon] })
    }
  }
  const tareas = []

  // 1) Por número de pedido.
  if (b.tipo === 'pedido') {
    tareas.push(pedidosQ().ilike('pedido_id', `%${b.valor}%`).order('fecha_pedido', { ascending: false }).limit(MAX_PEDIDOS)
      .then(datos).then((l) => sumar(l, 100, '🧾 pedido')))
  }

  if (b.tipo === 'numero') {
    const d = b.valor
    // 2) Por número de guía → sus pedidos (con el alcance).
    if (pareceNumeroDeGuia(texto)) {
      tareas.push(sb.from('guias_despacho').select('pedido_id').ilike('numero_guia', `%${d}%`).limit(MAX_PEDIDOS).then(datos)
        .then(async (gs) => {
          const ids = [...new Set(gs.map((g) => g.pedido_id).filter(Boolean))]
          if (!ids.length) return
          sumar(await pedidosQ().in('pedido_id', ids).then(datos), 100, '🚚 número de guía')
        }))
    }
    // …y el número del pedido sin la marca ("6314" → MAN-AND-6314).
    if (d.length <= 6) {
      tareas.push(pedidosQ().ilike('pedido_id', `%-${d}`).limit(MAX_PEDIDOS).then(datos).then((l) => sumar(l, 90, '🧾 pedido')))
    }
  }

  // 3) Por cliente: celular, cédula, nombre o dirección, cada dato por su lado.
  const consultas = []
  const clientesPor = (campo, op, valor) =>
    consultas.push(sb.from('clientes').select(COLS_CLIENTE).filter(campo, op, valor).limit(200).then(datos))
  if (b.tipo === 'numero' && b.valor.length >= 7) {
    clientesPor('celular', 'ilike', `%${cola9(b.valor)}%`)
    clientesPor('cedula', 'ilike', `${b.valor}%`)
  }
  if (b.tipo === 'texto') {
    for (const w of palabrasParaBuscar(texto)) {
      clientesPor('nombre', 'imatch', patronSinTildes(w, { palabraEntera: w.length < 4 }))
      if (w.length >= 4) clientesPor('direccion', 'imatch', patronSinTildes(w))
    }
  }
  tareas.push(Promise.all(consultas).then(async (listas) => {
    const clientes = new Map()
    for (const l of listas) for (const c of l) clientes.set(c.cliente_id, c)
    const entrada = b.tipo === 'numero' ? { numero: b.valor } : { texto }
    const mejores = [...clientes.values()]
      .map((c) => ({ c, ...puntuarCliente(c, entrada) }))
      .filter((x) => x.puntos > 0)
      .sort((x, y) => y.puntos - x.puntos)
      .slice(0, MAX_CLIENTES)
    if (!mejores.length) return
    const de = new Map(mejores.map((m) => [m.c.cliente_id, m]))
    const peds = await pedidosQ().in('cliente_id', [...de.keys()]).order('fecha_pedido', { ascending: false }).limit(MAX_PEDIDOS * 2).then(datos)
    for (const p of peds) {
      const m = de.get(p.cliente_id)
      for (const r of m.razones) sumar([p], 0, r)
      porPedido.get(p.pedido_id).puntos += m.puntos
    }
  }))

  await Promise.all(tareas)
  if (!porPedido.size) return { resultados: [], tipo: b.tipo }

  // 4) Los datos del cliente y TODAS las guías de esos pedidos.
  const lista = ordenarResultados([...porPedido.values()].map((x) => ({ ...x, fecha_pedido: x.p.fecha_pedido })))
    .slice(0, MAX_PEDIDOS)
  const pedidoIds = lista.map((x) => x.p.pedido_id)
  const clienteIds = [...new Set(lista.map((x) => x.p.cliente_id).filter(Boolean))]
  const [guias, clientes] = await Promise.all([
    sb.from('guias_despacho').select('pedido_id,numero_guia,transportista,fecha_despacho,registrado_por,foto_guia_url')
      .in('pedido_id', pedidoIds).order('fecha_despacho', { ascending: false }).then(datos),
    clienteIds.length ? sb.from('clientes').select(COLS_CLIENTE).in('cliente_id', clienteIds).then(datos) : [],
  ])
  const guiasDe = new Map()
  for (const g of guias) {
    if (!guiasDe.has(g.pedido_id)) guiasDe.set(g.pedido_id, [])
    guiasDe.get(g.pedido_id).push({
      numero: String(g.numero_guia ?? '').trim(), transportista: g.transportista || '',
      fecha: g.fecha_despacho, registrado_por: g.registrado_por || '', foto: fotoSegura(g.foto_guia_url),
    })
  }
  const cliDe = new Map(clientes.map((c) => [c.cliente_id, c]))

  return {
    tipo: b.tipo,
    resultados: lista.map(({ p, puntos, razones }) => {
      const c = cliDe.get(p.cliente_id) || {}
      return {
        pedido_id: p.pedido_id, tienda: p.tienda_id || '', vendedor: String(p.vendedor_id ?? '').trim(),
        estado: p.estado_pedido || '', fecha_pedido: p.fecha_pedido,
        cliente: String(c.nombre ?? '').trim(), celular: c.celular || '',
        ciudad: String(p.ciudad_pedido || c.ciudad || '').trim(),
        guias: guiasDe.get(p.pedido_id) || [], puntos, razones,
      }
    }),
  }
}
