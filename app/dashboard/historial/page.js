'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ESTADO_LABELS, ESTADO_COLORS } from '@/lib/labels'
import { parseFecha, formatFechaCorta, inicioDiaEcuador, finDiaEcuador } from '@/lib/parseFecha'
import { SkeletonList } from '@/components/Skeleton'
import { imagenAncho } from '@/lib/imagenes'

const ESTADOS = ['TODOS','PENDIENTE_FABRICA','EN_FABRICA','DESPACHO','COMPLETADO','ENTREGADO']
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
  const [paginaActual, setPaginaActual] = useState(0)
  const [hayMasPaginas, setHayMasPaginas] = useState(false)
  const [totalServidor, setTotalServidor] = useState(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  // CARGANDO | ERROR | VACIO | LISTA. Antes solo había `loading`, y "vacío"
  // significaba tanto "no hay nada" como "no se pudo leer".
  const [estado, setEstado] = useState('CARGANDO')
  const [errorTexto, setErrorTexto] = useState('')
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

      // Un `?estado=` en la URL manda sobre lo que quedó guardado. Lo usa el
      // enlace "Ver despachados" de la bandeja de Despacho: quien viene de ahí
      // espera ver los despachados, no los filtros de su última visita.
      //
      // Se lee de window y no con useSearchParams a propósito: ese hook obliga a
      // envolver la pantalla en <Suspense> o el build falla (ver la nota en
      // app/dashboard/layout.js). Acá estamos dentro de un useEffect, que solo
      // corre en el navegador, así que window siempre existe.
      try {
        const pedido = new URLSearchParams(window.location.search).get('estado')
        if (pedido && ESTADOS.includes(pedido)) setFiltroEstado(pedido)
      } catch (_) {}
    }
    // Los pedidos NO se piden acá: los dispara el efecto de los filtros en
    // cuanto `user` deja de ser null. Llamarlos también aquí traería la primera
    // página dos veces, y con los filtros todavía sin restaurar del localStorage.
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

  // Cada filtro dispara una consulta nueva y vuelve a la primera página. Antes
  // se traían los 680 pedidos y se filtraba en el navegador.
  useEffect(() => {
    if (!user) return
    cargarPagina(0, true)
  }, [user, busquedaDebounced, filtroEstado, filtroTienda, filtroPago, fechaDesde, fechaHasta])

  /**
   * Trae UNA página del historial ya filtrada por el servidor.
   *
   * `reemplazar` distingue "cambiaste un filtro" (se pinta de cero) de "diste a
   * cargar más" (se agrega abajo).
   */
  async function cargarPagina(pag, reemplazar) {
    if (reemplazar) { setLoading(true); setEstado('CARGANDO') } else { setCargandoMas(true) }
    setErrorTexto('')
    try {
      // NO se manda `rol`: el alcance de cada quien (un VENDEDOR solo lo suyo,
      // YAW solo su tienda, las tiendas asignadas) lo aplica el servidor contra
      // la cookie firmada. Acá solo viajan los filtros de la pantalla.
      const q = new URLSearchParams({ pagina: String(pag) })
      if (filtroEstado !== 'TODOS')  q.set('estado', filtroEstado)
      if (filtroTienda !== 'TODAS')  q.set('tienda', filtroTienda)
      if (filtroPago !== 'TODOS')    q.set('pago', filtroPago)
      if (busquedaDebounced.trim())  q.set('q', busquedaDebounced.trim())
      if (fechaDesde) { const d = inicioDiaEcuador(fechaDesde); if (d) q.set('desde', d.toISOString()) }
      if (fechaHasta) { const h = finDiaEcuador(fechaHasta);    if (h) q.set('hasta', h.toISOString()) }

      const res = await fetch(`/api/historial?${q}`, { cache: 'no-store' })
      if (!res.ok) {
        const detalle = await res.json().catch(() => ({}))
        setErrorTexto(detalle.error || `HTTP ${res.status}`)
        if (reemplazar) setPedidos([])
        setEstado('ERROR')
        return
      }
      const data = await res.json()
      const lista = data.pedidos || []
      setPedidos(prev => (reemplazar ? lista : [...prev, ...lista]))
      setPaginaActual(data.pagina ?? pag)
      setHayMasPaginas(!!data.hayMas)
      setTotalServidor(typeof data.total === 'number' ? data.total : null)
      setEstado(lista.length === 0 && reemplazar ? 'VACIO' : 'LISTA')
    } catch (e) {
      // Una respuesta que no es JSON también es un fallo, no una lista vacía.
      setErrorTexto(e?.message || 'Error de conexión')
      if (reemplazar) setPedidos([])
      setEstado('ERROR')
    } finally { setLoading(false); setCargandoMas(false) }
  }

  const isYAW = user?.rol === 'VENDEDOR_YAW'
  const hayFecha = fechaDesde || fechaHasta

  // Ya viene filtrado por el servidor: estado, tienda, pago, fechas, búsqueda y
  // el alcance del rol. Volver a filtrar acá solo podría ESCONDER de más — y
  // sobre una página de 30, escondería justo lo que el servidor decidió mostrar.
  const filtered = pedidos

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
    if (fechaDesde) { const f = parseFecha(c.fecha), d = inicioDiaEcuador(fechaDesde); if (!f || (d && f < d)) return false }
    if (fechaHasta) { const f = parseFecha(c.fecha), h = finDiaEcuador(fechaHasta); if (!f || (h && f > h)) return false }
    return true
  })

  // Lista combinada (pedido | cotizacion) ordenada por fecha desc.
  //
  // Las cotizaciones siguen viniendo enteras y se mezclan acá: hay UNA en toda
  // la base. Si algún día fueran cientos habría que paginarlas también, pero
  // montar eso hoy sería resolver un problema que no existe.
  const paginados = [
    ...filtered.map(p => ({ _tipo: 'pedido', _fecha: parseFecha(p.FECHA_PEDIDO) || new Date(0), p })),
    ...filteredCot.map(c => ({ _tipo: 'cotizacion', _fecha: new Date(c.created_at || c.fecha) || new Date(0), c })),
  ].sort((a, b) => b._fecha - a._fecha)

  const hayMas = hayMasPaginas

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
            {/* El total lo cuenta la BASE, no la página: antes decía "30 de 30"
                porque solo había traído 30. */}
            <div className="text-xs text-gray-600">
              {loading
                ? 'Cargando...'
                : totalServidor !== null
                  ? `Mostrando ${filtered.length} de ${totalServidor} pedido(s)`
                  : `${paginados.length} registro(s)`}
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
          ) : estado === 'ERROR' ? (
            /* Un fallo NO es "no hay registros". Antes los dos se veían igual, y
               encima había 3 reintentos silenciosos que convertían el error en
               una espera larga y después en una lista vacía. */
            <div className="card p-8 text-center border-red-500/40">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="font-medium text-white">No se pudo cargar el historial</div>
              <div className="text-sm text-gray-500 mt-1">{errorTexto}</div>
              <div className="text-xs text-gray-600 mt-2">No es que no haya nada: es que no pudimos leerlo.</div>
              <button onClick={() => cargarPagina(0, true)} className="btn-primary text-sm px-4 py-2 mt-4">
                Reintentar
              </button>
            </div>
          ) : paginados.length === 0 ? (
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
                                ? <img src={imagenAncho(item.FOTO_PECHO_URL, 120)} loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-700" />
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
              {/* Trae la SIGUIENTE página de la base, no recorta una lista que
                  ya estaba entera en el navegador. */}
              {hayMas && (
                <button
                  onClick={() => cargarPagina(paginaActual + 1, false)}
                  disabled={cargandoMas}
                  className="w-full mt-3 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 hover:text-white transition-all disabled:opacity-50">
                  {cargandoMas
                    ? 'Cargando...'
                    : `Cargar más${totalServidor !== null ? ` (${Math.max(0, totalServidor - filtered.length)} restantes)` : ''}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
