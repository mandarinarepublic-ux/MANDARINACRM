'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ESTADO_LABELS, ESTADO_COLORS } from '@/lib/labels'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha, formatFechaCorta } from '@/lib/parseFecha'
import { filtrarPedidosPorTienda } from '@/lib/tiendasUsuario'
import { SkeletonList } from '@/components/Skeleton'

const ESTADOS = ['TODOS','PENDIENTE_FABRICA','EN_FABRICA','DESPACHO','COMPLETADO','ENTREGADO']
const PAGE_SIZE = 30
const LS_FILTROS = 'mp_historial_filtros_v2'

export default function HistorialPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [cotizaciones, setCotizaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [mostrarFecha, setMostrarFecha] = useState(false)
  const [visibles, setVisibles] = useState(PAGE_SIZE)
  const [expandedPedidos, setExpandedPedidos] = useState(new Set())
  const [filtroPago, setFiltroPago] = useState('TODOS')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    if (u.rol !== 'VENDEDOR_YAW') {
      try {
        const f = JSON.parse(localStorage.getItem(LS_FILTROS) || '{}')
        if (f.filtroEstado) setFiltroEstado(f.filtroEstado)
        if (f.filtroTienda) setFiltroTienda(f.filtroTienda)
        if (f.fechaDesde)   setFechaDesde(f.fechaDesde)
        if (f.fechaHasta)   setFechaHasta(f.fechaHasta)
        if (f.fechaDesde || f.fechaHasta) setMostrarFecha(true)
      } catch (_) {}
    }
    loadPedidos(u)
    loadCotizaciones(u)
  }, [])

  // Cotizaciones (tabla aparte, NO son pedidos ni entran a producción).
  // VENDEDOR/VENDEDOR_YAW → solo las suyas; ADMIN → todas.
  async function loadCotizaciones(u) {
    try {
      const res = await fetch(`/api/cotizaciones?createdBy=${encodeURIComponent(u.id || '')}&rol=${encodeURIComponent(u.rol || '')}&_t=${Date.now()}`, { cache: 'no-store' })
      const data = await res.json()
      setCotizaciones(data.cotizaciones || [])
    } catch (_) { /* best-effort: si falla, el historial de pedidos sigue igual */ }
  }

  useEffect(() => {
    if (!user) return
    localStorage.setItem(LS_FILTROS, JSON.stringify({ filtroEstado, filtroTienda, fechaDesde, fechaHasta }))
  }, [user, filtroEstado, filtroTienda, fechaDesde, fechaHasta])

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 250)
    return () => clearTimeout(t)
  }, [busqueda])

  useEffect(() => { setVisibles(PAGE_SIZE) }, [busquedaDebounced, filtroEstado, filtroTienda, filtroPago, fechaDesde, fechaHasta])

  async function loadPedidos(u, intentos = 0) {
    setLoading(true)
    try {
      // Un VENDEDOR solo ve sus propias ventas (filtro server-side scope=mios,
      // igual que Mis Pedidos y que las cotizaciones). ADMIN y los roles de
      // fábrica/despacho necesitan verlo todo para trabajar.
      const query = u.rol === 'VENDEDOR'
        ? `vendedor=${encodeURIComponent(u.nombre || u.id)}&vendedorId=${encodeURIComponent(u.id)}&rol=VENDEDOR&scope=mios`
        : 'rol=ADMIN'
      const res = await fetch(`/api/pedidos?${query}&_t=` + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      if (!data.pedidos?.length && intentos < 3) {
        setTimeout(() => loadPedidos(u, intentos + 1), 1500)
        return
      }
      let lista = data.pedidos || []
      if (u.rol === 'VENDEDOR_YAW') lista = lista.filter(p => p.TIENDA_ID === 'YAW')
      // Acceso por tienda: un vendedor solo ve las tiendas que tiene asignadas
      // en Usuarios (ADMIN y los roles de fábrica no se filtran).
      lista = filtrarPedidosPorTienda(u, lista)
      lista = lista.sort((a, b) => {
        const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
        const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
        if (fb - fa !== 0) return fb - fa
        return (b.PEDIDO_ID || '').localeCompare(a.PEDIDO_ID || '')
      })
      setPedidos(lista)
    } finally { setLoading(false) }
  }

  const isYAW = user?.rol === 'VENDEDOR_YAW'
  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos.filter(p => {
    if (filtroEstado !== 'TODOS' && p.ESTADO_PEDIDO !== filtroEstado) return false
    if (!isYAW && filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
    if (filtroPago !== 'TODOS' && p.ESTADO_PAGO !== filtroPago) return false
    if (busquedaDebounced && !coincideBusqueda(p, busquedaDebounced)) return false
    if (fechaDesde) { const f = parseFecha(p.FECHA_PEDIDO); if (!f || f < new Date(fechaDesde)) return false }
    if (fechaHasta) { const f = parseFecha(p.FECHA_PEDIDO); const h = new Date(fechaHasta); h.setHours(23,59,59); if (!f || f > h) return false }
    return true
  })

  // Cotizaciones (aparte de producción): se muestran solo cuando el filtro es
  // TODOS o COTIZACIÓN, y sin filtro de pago (no aplican estados/pago de pedido).
  // No aplican a la vista YAW.
  const mostrarCot = !isYAW && (filtroEstado === 'TODOS' || filtroEstado === 'COTIZACIÓN') && filtroPago === 'TODOS'
  const filteredCot = !mostrarCot ? [] : cotizaciones.filter(c => {
    if (filtroTienda !== 'TODAS') {
      const tMap = c.tienda === 'indstore' ? 'INDSTORE' : 'MANDARINA'
      if (tMap !== filtroTienda) return false
    }
    if (busquedaDebounced) {
      const hay = `${c.numero||''} ${c.cliente_nombre||''} ${c.cliente_cedula||''} ${c.cliente_tel||''}`.toLowerCase()
      if (!hay.includes(busquedaDebounced.toLowerCase())) return false
    }
    if (fechaDesde) { const f = new Date(c.fecha); if (isNaN(f) || f < new Date(fechaDesde)) return false }
    if (fechaHasta) { const f = new Date(c.fecha); const h = new Date(fechaHasta); h.setHours(23,59,59); if (isNaN(f) || f > h) return false }
    return true
  })

  // Lista combinada (pedido | cotizacion) ordenada por fecha desc.
  const combinados = [
    ...filtered.map(p => ({ _tipo: 'pedido', _fecha: parseFecha(p.FECHA_PEDIDO) || new Date(0), p })),
    ...filteredCot.map(c => ({ _tipo: 'cotizacion', _fecha: new Date(c.created_at || c.fecha) || new Date(0), c })),
  ].sort((a, b) => b._fecha - a._fecha)

  const paginados = combinados.slice(0, visibles)
  const hayMas = combinados.length > visibles

  function expandirTodos() { setExpandedPedidos(new Set(paginados.filter(x => x._tipo === 'pedido').map(x => x.p.PEDIDO_ID))) }
  function contraerTodos()  { setExpandedPedidos(new Set()) }

  const estadoColor = {
    PENDIENTE_FABRICA: 'text-yellow-400 bg-yellow-500/10',
    EN_FABRICA:        'text-blue-400 bg-blue-500/10',
    DESPACHO:          'text-purple-400 bg-purple-500/10',
    COMPLETADO:        'text-green-400 bg-green-500/10',
    ENTREGADO:         'text-green-400 bg-green-500/10',
    CANCELADO:         'text-gray-400 bg-gray-800',
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">
              {isYAW ? 'Historial YAW' : 'Historial de Ventas'}
            </h1>
            {(user?.rol === 'ADMIN' || user?.rol === 'VENDEDOR' || isYAW) && (
              <Link href="/dashboard/nuevo-pedido" className="btn-primary text-sm px-4 py-2">+ Nueva</Link>
            )}
          </div>
          {/* Fila 1: Buscador */}
          <div className="mb-2">
            <input className="input w-full" placeholder="Buscar por pedido, nombre, cedula o celular..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>

          {/* Fila 2: combos — 2 por fila en movil, 3 en desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Estado */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider px-1">Estado</span>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                  ${filtroEstado !== 'TODOS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE_FABRICA">Pend. Fábrica</option>
                <option value="EN_FABRICA">En Producción</option>
                <option value="DESPACHO">En Despacho</option>
                <option value="COMPLETADO">Completado</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="COTIZACIÓN">📄 Cotizaciones</option>
              </select>
            </div>
            {/* Tienda */}
            {!isYAW && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-gray-400 uppercase tracking-wider px-1">Tienda</span>
                <select
                  value={filtroTienda}
                  onChange={e => setFiltroTienda(e.target.value)}
                  className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                    ${filtroTienda !== 'TODAS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
                  <option value="TODAS">Todas</option>
                  <option value="MANDARINA">🍊 Mandarina</option>
                  <option value="INDSTORE">Indstore</option>
                </select>
              </div>
            )}
            {/* Pago */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider px-1">Pago</span>
              <select
                value={filtroPago}
                onChange={e => setFiltroPago(e.target.value)}
                className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                  ${filtroPago !== 'TODOS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
                <option value="TODOS">Todos</option>
                <option value="PENDIENTE">⚠ Pendiente</option>
                <option value="ABONO">🔶 Abono</option>
                <option value="PAGADO">✅ Pagado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-gray-600">
              {loading
                ? 'Cargando...'
                : hayMas
                  ? `Mostrando ${paginados.length} de ${combinados.length} registro(s)`
                  : `${combinados.length} registro(s)`}
            </div>
            {!loading && filtered.length > 0 && (
              <div className="flex gap-2">
                <button onClick={expandirTodos}
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-all">⊞ Expandir</button>
                <button onClick={contraerTodos}
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-all">⊟ Contraer</button>
              </div>
            )}
          </div>
          {loading ? (
            <SkeletonList count={6} />
          ) : combinados.length === 0 ? (
            <div className="card p-8 text-center text-gray-600"><div className="text-3xl mb-3">📭</div>No hay registros con estos filtros</div>
          ) : (
            <>
              <div className="space-y-2">
                {paginados.map(row => {
                  // ── COTIZACIÓN (tarjeta aparte, abre el módulo de cotización) ──
                  if (row._tipo === 'cotizacion') {
                    const c = row.c
                    return (
                      <Link key={`cot-${c.id}`} href={`/dashboard/cotizacion/${c.id}`}
                        className="card overflow-hidden block p-4 hover:bg-gray-800/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-mandarina-500/15 text-mandarina-400">📄 COTIZACIÓN</span>
                              <span className="font-mono text-sm font-medium text-white truncate">{c.numero}</span>
                              <span className="text-gray-600 text-xs">{c.tienda === 'indstore' ? '🏪' : '🍊'}</span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {c.cliente_nombre || 'Sin cliente'} · {formatFechaCorta(c.fecha)}
                            </div>
                          </div>
                          <div className="flex flex-col items-end flex-shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full text-gray-300 bg-gray-800">${parseFloat(c.total||0).toFixed(2)}</span>
                            <span className="text-[10px] text-gray-600 mt-1">solo consulta</span>
                          </div>
                          <span className="text-gray-600 text-xs flex-shrink-0">→</span>
                        </div>
                      </Link>
                    )
                  }
                  // ── PEDIDO (comportamiento original) ──
                  const p = row.p
                  const isExpanded = expandedPedidos.has(p.PEDIDO_ID)
                  const itemsActivos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO')
                  return (
                    <div key={p.PEDIDO_ID} className="card overflow-hidden">
                      {/* Fila principal — clic expande inline */}
                      <button
                        onClick={() => setExpandedPedidos(prev => {
                          const n = new Set(prev)
                          n.has(p.PEDIDO_ID) ? n.delete(p.PEDIDO_ID) : n.add(p.PEDIDO_ID)
                          return n
                        })}
                        className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-800/20 transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                            {!isYAW && <span className="text-gray-600 text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>}
                            {user?.rol !== 'VENDEDOR' && !isYAW && p.VENDEDOR_ID && (
                              <span className="text-xs text-gray-600 font-mono">{p.VENDEDOR_ID}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {itemsActivos.length} prenda(s) · {formatFechaCorta(p.FECHA_PEDIDO)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estadoColor[p.ESTADO_PEDIDO] || 'text-gray-400 bg-gray-800'}`}>
                            {ESTADO_LABELS[p.ESTADO_PEDIDO] || p.ESTADO_PEDIDO}
                          </span>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              p.ESTADO_PAGO === 'PAGADO' ? 'text-green-400 bg-green-500/10' :
                              p.ESTADO_PAGO === 'ABONO'  ? 'text-yellow-400 bg-yellow-500/10' :
                                                            'text-red-400 bg-red-500/10'}`}>
                              ${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}
                            </span>
                            {parseFloat(p.MONTO_PENDIENTE||0) > 0.009 && (
                              <span className="text-xs text-red-400 font-medium">Debe ${parseFloat(p.MONTO_PENDIENTE).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-gray-600 text-xs flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {/* Items expandidos inline */}
                      {isExpanded && (
                        <div className="border-t border-gray-800 p-3 space-y-2">
                          <Link href={`/dashboard/pedido/${p.PEDIDO_ID}?from=historial`}
                            className="text-xs text-mandarina-400 hover:underline block mb-2">
                            Ver pedido completo →
                          </Link>
                          {itemsActivos.length === 0 ? (
                            <div className="text-xs text-gray-600 py-2">Sin prendas registradas</div>
                          ) : itemsActivos.map(item => (
                            <div key={item.ITEM_ID} className="flex items-center gap-3 bg-gray-800/40 rounded-xl px-3 py-2">
                              {item.FOTO_PECHO_URL
                                ? <img src={item.FOTO_PECHO_URL} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-700" />
                                : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0"><span className="text-gray-600 text-sm">👕</span></div>}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-white font-medium truncate">{item.PRODUCTO_NOMBRE}</div>
                                <div className="text-xs text-gray-500">{item.TALLA} · {item.COLOR}</div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                                item.SUBESTADO === 'LISTO'       ? 'bg-green-500/20 text-green-400' :
                                item.SUBESTADO === 'EN_PROCESO'  ? 'bg-blue-500/20 text-blue-400' :
                                                                    'bg-yellow-500/20 text-yellow-400'
                              }`}>{item.SUBESTADO || 'SOLICITADO'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {hayMas && (
                <button
                  onClick={() => setVisibles(v => v + PAGE_SIZE)}
                  className="w-full mt-3 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 hover:text-white transition-all">
                  Cargar más ({combinados.length - visibles} restantes)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
