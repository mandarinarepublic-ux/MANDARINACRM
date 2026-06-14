'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const SUBESTADO_CONFIG = {
  SOLICITADO:         { label: '⏳ Solicitado',          color: 'bg-yellow-500' },
  EN_PROCESO:         { label: '🔧 En proceso',          color: 'bg-blue-500' },
  ENVIADO_APROBACION: { label: '📤 Enviado aprobación',  color: 'bg-purple-500' },
  LISTO:              { label: '✅ Listo',               color: 'bg-green-500' },
  ENTREGADO_TIENDA:   { label: '🏪 Entregado en tienda', color: 'bg-gray-500' },
}
const SUBESTADOS_ORDEN = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO']

function parseFecha(str) {
  if (!str) return null
  if (str.match(/^\d{4}-/)) return new Date(str)
  const months = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11}
  const m = str.match(/^(\d{2})([A-Za-z]{3})(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]))
}

function itemEsDeUsuario(itemArea, u) {
  if (!itemArea) return false
  if (u.rol === 'ADMIN') return true
  const areas = u.areas || []
  if (areas.length > 0 && !(areas.length === 1 && areas[0] === 'TODAS')) {
    return areas.some(a => itemArea.includes(a))
  }
  if (u.rol === 'ESTAMPADO')   return itemArea.includes('ESTAMPADO')
  if (u.rol === 'SUBLIMACION') return itemArea.includes('SUBLIMACION')
  if (u.rol === 'BORDADO')     return itemArea.includes('BORDADO')
  return true
}

// ── ItemCard — todo el estado es LOCAL, nunca se recrea desde fuera ───────────
function ItemCard({ item, userId, onSubestadoChange }) {
  const fotos = [
    { key: 'FOTO_PECHO_URL', label: 'Pecho' },
    { key: 'FOTO_ESPALDA_URL', label: 'Espalda' },
    { key: 'FOTO_MANGA_D_URL', label: 'M.Der' },
    { key: 'FOTO_MANGA_I_URL', label: 'M.Izq' },
  ].filter(f => item[f.key])

  const [fotoActiva, setFotoActiva] = useState(fotos[0]?.key || null)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)

  // Subestado local — se actualiza optimistically sin recargar
  const [subestado, setSubestado] = useState(item.SUBESTADO || 'SOLICITADO')

  // Nota completamente local
  const [editingNota, setEditingNota] = useState(false)
  const [notaText, setNotaText] = useState(item.NOTAS_AREA || '')
  const [notaGuardada, setNotaGuardada] = useState(item.NOTAS_AREA || '')
  const [savingNota, setSavingNota] = useState(false)
  const [notaError, setNotaError] = useState('')

  async function handleSubestado(s) {
    const anterior = subestado
    setSubestado(s) // optimistic update inmediato
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ SUBESTADO: s, _usuarioId: userId }),
      })
      if (!res.ok) {
        setSubestado(anterior) // revertir si falla
      } else {
        // Notificar al padre solo si el item pasa a LISTO (para sacarlo del filtro Todos)
        onSubestadoChange?.(item.ITEM_ID, s)
      }
    } catch {
      setSubestado(anterior)
    }
  }

  async function handleGuardarNota() {
    setSavingNota(true)
    setNotaError('')
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ NOTAS_AREA: notaText, _usuarioId: userId }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setNotaGuardada(notaText)
        setEditingNota(false)
      } else {
        setNotaError(data.error || 'Error al guardar')
      }
    } catch {
      setNotaError('Error de conexión')
    } finally {
      setSavingNota(false)
    }
  }

  function handleCancelar() {
    setNotaText(notaGuardada)
    setEditingNota(false)
    setNotaError('')
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-white">{item.PRODUCTO_NOMBRE}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.COLOR} · {item.TALLA} · {item.CANTIDAD} uni</div>
        </div>
        <span className={`badge text-xs text-white ${SUBESTADO_CONFIG[subestado]?.color || 'bg-gray-700'}`}>
          {SUBESTADO_CONFIG[subestado]?.label || subestado}
        </span>
      </div>

      <div className="flex gap-4">
        {/* Fotos */}
        <div className="w-40 flex-shrink-0">
          {fotos.length > 0 ? (
            <>
              <div className="w-40 h-40 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 mb-2 cursor-pointer"
                onDoubleClick={() => setFotoFullscreen(item[fotoActiva || fotos[0].key])}>
                <img src={item[fotoActiva || fotos[0].key]} className="w-full h-full object-contain" alt="foto" />
              </div>
              {fotos.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {fotos.map(f => (
                    <button key={f.key} onClick={() => setFotoActiva(f.key)}
                      className={`flex flex-col items-center gap-0.5 p-0.5 rounded-lg border transition-all
                        ${(fotoActiva || fotos[0].key) === f.key ? 'border-mandarina-500' : 'border-gray-700'}`}>
                      <img src={item[f.key]} className="w-10 h-10 rounded object-cover" alt={f.label} />
                      <span className="text-xs text-gray-500">{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1 text-center">2× clic = pantalla completa</div>
            </>
          ) : (
            <div className="w-40 h-40 rounded-xl border border-gray-800 bg-gray-800/50 flex items-center justify-center">
              <span className="text-gray-600 text-xs text-center px-2">Sin fotos de diseño</span>
            </div>
          )}
        </div>

        {/* Detalle + nota + subestado */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="bg-gray-800/50 rounded-xl px-3 py-2 space-y-1.5">
            <div className="text-xs">
              <span className="text-gray-500">Área:</span>{' '}
              <span className="text-mandarina-400 font-medium">{item.AREA}</span>
            </div>
            {item.DETALLE_PERSONALIZADO && (
              <div className="text-xs">
                <span className="text-gray-500">Detalle:</span>{' '}
                <span className="text-gray-300">{item.DETALLE_PERSONALIZADO}</span>
              </div>
            )}
          </div>

          {/* Nota */}
          {editingNota ? (
            <div>
              <textarea
                className="input resize-none text-sm mb-2 w-full"
                rows={2}
                placeholder="Nota para este producto..."
                value={notaText}
                onChange={e => setNotaText(e.target.value)}
                autoFocus
              />
              {notaError && <div className="text-xs text-red-400 mb-2">⚠️ {notaError}</div>}
              <div className="flex gap-2">
                <button onClick={handleGuardarNota} disabled={savingNota}
                  className="btn-primary text-xs px-3 py-1.5">
                  {savingNota ? '⏳ Guardando...' : 'Guardar'}
                </button>
                <button onClick={handleCancelar} className="btn-secondary text-xs px-3 py-1.5">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              {notaGuardada && (
                <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-1">
                  📝 {notaGuardada}
                </div>
              )}
              <button
                onClick={() => { setNotaText(notaGuardada); setEditingNota(true) }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                {notaGuardada ? '✏️ Editar nota' : '+ Agregar nota'}
              </button>
            </div>
          )}

          {/* Botones subestado — usan estado local */}
          <div className="grid grid-cols-2 gap-1.5 mt-auto">
            {SUBESTADOS_ORDEN.map(s => (
              <button key={s} onClick={() => handleSubestado(s)}
                className={`py-2 rounded-xl text-xs font-semibold transition-all
                  ${subestado === s
                    ? `${SUBESTADO_CONFIG[s]?.color} text-white`
                    : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                {SUBESTADO_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {fotoFullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoFullscreen(null)}>
          <img src={fotoFullscreen} className="max-w-full max-h-full object-contain rounded-xl" alt="fullscreen" />
          <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  )
}

export default function ProduccionPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroSubestado, setFiltroSubestado] = useState('TODOS')
  const [expandedPedido, setExpandedPedido] = useState(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [mostrarFecha, setMostrarFecha] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadItems(u)
  }, [])

  const loadItems = useCallback(async (u) => {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const pedidosConItems = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .sort((a, b) => {
          const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
          const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
          return fb - fa
        })
        .map(p => ({
          ...p,
          itemsFiltrados: (p.items || []).filter(item => {
            if (item.SUBESTADO === 'ELIMINADO' || item.SUBESTADO === 'ENTREGADO_TIENDA') return false
            if (u.rol !== 'ADMIN') return itemEsDeUsuario(item.AREA, u)
            return true
          })
        }))
        .filter(p => p.itemsFiltrados.length > 0)
      setPedidos(pedidosConItems)
    } finally { setLoading(false) }
  }, [])

  // Al cambiar subestado: actualizar SOLO ese item en el estado local
  // Si pasa a LISTO, sacarlo del filtro "Todos" sin recargar el sheet
  function handleSubestadoChange(itemId, nuevoSubestado) {
    setPedidos(prev => prev.map(p => ({
      ...p,
      itemsFiltrados: p.itemsFiltrados.map(item =>
        item.ITEM_ID === itemId ? { ...item, SUBESTADO: nuevoSubestado } : item
      )
    })))
  }

  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos
    .map(p => ({
      ...p,
      itemsFiltrados: p.itemsFiltrados.filter(item => {
        if (filtroSubestado === 'TODOS') return item.SUBESTADO !== 'LISTO'
        return item.SUBESTADO === filtroSubestado
      })
    }))
    .filter(p => {
      if (p.itemsFiltrados.length === 0) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        if (!p.PEDIDO_ID?.toLowerCase().includes(q) &&
            !p.itemsFiltrados.some(i => i.PRODUCTO_NOMBRE?.toLowerCase().includes(q))) return false
      }
      if (fechaDesde) {
        const f = parseFecha(p.FECHA_PEDIDO)
        if (!f || f < new Date(fechaDesde)) return false
      }
      if (fechaHasta) {
        const f = parseFecha(p.FECHA_PEDIDO)
        const h = new Date(fechaHasta); h.setHours(23,59,59)
        if (!f || f > h) return false
      }
      return true
    })

  const totalPendientes = filtered.reduce((s, p) => s + p.itemsFiltrados.length, 0)
  const urgentes = filtered.filter(p => p.FECHA_ENTREGA_PROMETIDA &&
    Math.ceil((new Date(p.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000) <= 2).length

  const areaLabel = user?.rol === 'ADMIN' ? '' :
    (user?.areas?.length > 0 && user.areas[0] !== 'TODAS')
      ? ` · ${user.areas.join(', ')}`
      : ` · ${user?.rol}`

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">Producción</h1>
                <p className="text-xs text-gray-500">{totalPendientes} ítem(s) pendientes{areaLabel}</p>
              </div>
            </div>
            <Link href="/dashboard/impresion" className="btn-secondary text-xs px-3 py-2">🖨️ Imprimir</Link>
          </div>

          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="Buscar por pedido o producto..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={() => setMostrarFecha(v => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0
                ${hayFecha ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              📅 {hayFecha ? 'Fecha ✓' : 'Fecha'}
            </button>
          </div>

          {mostrarFecha && (
            <div className="flex gap-2 mb-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                <input type="date" className="input text-sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                <input type="date" className="input text-sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              </div>
              {hayFecha && (
                <button onClick={() => { setFechaDesde(''); setFechaHasta('') }}
                  className="text-xs text-gray-500 hover:text-red-400 pb-2 px-2">✕</button>
              )}
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
            {[
              { key: 'TODOS', label: 'Todos' },
              { key: 'SOLICITADO', label: '⏳ Solicitado' },
              { key: 'EN_PROCESO', label: '🔧 En proceso' },
              { key: 'ENVIADO_APROBACION', label: '📤 Enviado aprobación' },
              { key: 'LISTO', label: '✅ Listo' },
            ].map(f => (
              <button key={f.key} onClick={() => setFiltroSubestado(f.key)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0
                  ${filtroSubestado === f.key ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {urgentes > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <div className="text-red-400 font-semibold text-sm">🚨 {urgentes} pedido(s) urgente(s) — entrega en ≤2 días</div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="font-medium text-white">¡Todo al día!</div>
              <div className="text-sm text-gray-500 mt-1">No hay ítems pendientes en tu área</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(pedido => {
                const diasR = pedido.FECHA_ENTREGA_PROMETIDA
                  ? Math.ceil((new Date(pedido.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000) : null
                const urgente = diasR !== null && diasR <= 2
                const isExpanded = expandedPedido === pedido.PEDIDO_ID
                return (
                  <div key={pedido.PEDIDO_ID} className={`card overflow-hidden ${urgente ? 'border-red-500/40' : ''}`}>
                    <button onClick={() => setExpandedPedido(isExpanded ? null : pedido.PEDIDO_ID)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-800/30 transition-all text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Link href={`/dashboard/pedido/${pedido.PEDIDO_ID}?from=historial`}
                            onClick={e => e.stopPropagation()}
                            className="font-mono text-sm font-medium text-mandarina-400 hover:underline">
                            {pedido.PEDIDO_ID}
                          </Link>
                          {urgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                          <span className="text-xs text-gray-600">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {pedido.itemsFiltrados.length} ítem(s){diasR !== null && ` · ${diasR}d restantes`} · {pedido.FECHA_PEDIDO?.split(' ')[0] || ''}
                        </div>
                      </div>
                      <span className="text-gray-600 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800">
                        {pedido.itemsFiltrados.map(item => (
                          <ItemCard
                            key={item.ITEM_ID}
                            item={item}
                            userId={user?.id}
                            onSubestadoChange={handleSubestadoChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
