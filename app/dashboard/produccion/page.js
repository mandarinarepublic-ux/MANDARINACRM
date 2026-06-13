'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { areaAplica } from '@/lib/pedidos-client'

const SUBESTADO_CONFIG = {
  SOLICITADO:          { label: '⏳ Solicitado',           color: 'bg-yellow-500' },
  EN_PROCESO:          { label: '🔧 En proceso',           color: 'bg-blue-500' },
  ENVIADO_APROBACION:  { label: '📤 Enviado aprobación',   color: 'bg-purple-500' },
  LISTO:               { label: '✅ Listo',                color: 'bg-green-500' },
  ENTREGADO_TIENDA:    { label: '🏪 Entregado en tienda',  color: 'bg-gray-500' },
}

const SUBESTADOS_ORDEN = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO']

export default function ProduccionPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [expandedPedido, setExpandedPedido] = useState(null)
  const [editingNota, setEditingNota] = useState(null)
  const [notaText, setNotaText] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadItems(u)
  }, [])

  async function loadItems(u) {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()

      // Group by pedido, filter items by user area
      const pedidosConItems = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .map(p => ({
          ...p,
          itemsFiltrados: (p.items || []).filter(item => {
            if (item.SUBESTADO === 'ELIMINADO' || item.SUBESTADO === 'ENTREGADO_TIENDA') return false
            if (item.SUBESTADO === 'LISTO') return false // solo pendientes
            // ADMIN ve todo, cada rol ve su área
            if (u.rol === 'ADMIN') return true
            return areaAplica(item.AREA, u.rol)
          })
        }))
        .filter(p => p.itemsFiltrados.length > 0)

      setPedidos(pedidosConItems)
    } finally { setLoading(false) }
  }

  async function updateSubestado(itemId, subestado, pedidoId) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SUBESTADO: subestado, _usuarioId: user?.id }),
    })
    loadItems(user)
  }

  async function saveNota(itemId) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ NOTAS_AREA: notaText, _usuarioId: user?.id }),
    })
    setEditingNota(null)
    loadItems(user)
  }

  const filtered = pedidos.filter(p => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return p.PEDIDO_ID?.toLowerCase().includes(q) ||
      p.itemsFiltrados.some(i => i.PRODUCTO_NOMBRE?.toLowerCase().includes(q))
  })

  const totalPendientes = filtered.reduce((s, p) => s + p.itemsFiltrados.length, 0)
  const urgentes = filtered.filter(p => {
    if (!p.FECHA_ENTREGA_PROMETIDA) return false
    return Math.ceil((new Date(p.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000) <= 2
  }).length

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">Producción</h1>
                <p className="text-xs text-gray-500">
                  {totalPendientes} ítem(s) pendientes
                  {user?.rol !== 'ADMIN' && ` · ${user?.rol}`}
                </p>
              </div>
            </div>
            <Link href="/dashboard/impresion" className="btn-secondary text-xs px-3 py-2">🖨️ Imprimir</Link>
          </div>
          <input className="input" placeholder="Buscar por pedido o producto..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
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
              <div className="text-sm text-gray-500 mt-1">No hay ítems pendientes</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(pedido => {
                const diasR = pedido.FECHA_ENTREGA_PROMETIDA
                  ? Math.ceil((new Date(pedido.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000)
                  : null
                const urgente = diasR !== null && diasR <= 2
                const isExpanded = expandedPedido === pedido.PEDIDO_ID

                return (
                  <div key={pedido.PEDIDO_ID} className={`card overflow-hidden ${urgente ? 'border-red-500/40' : ''}`}>
                    {/* Pedido header */}
                    <button onClick={() => setExpandedPedido(isExpanded ? null : pedido.PEDIDO_ID)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-800/30 transition-all text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Link href={`/dashboard/pedido/${pedido.PEDIDO_ID}`}
                            onClick={e => e.stopPropagation()}
                            className="font-mono text-sm font-medium text-mandarina-400 hover:underline">
                            {pedido.PEDIDO_ID}
                          </Link>
                          {urgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                          <span className="text-xs text-gray-600">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {pedido.itemsFiltrados.length} ítem(s) pendiente(s)
                          {diasR !== null && ` · ${diasR}d restantes`}
                        </div>
                      </div>
                      <span className="text-gray-600 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Items */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800">
                        {pedido.itemsFiltrados.map(item => (
                          <div key={item.ITEM_ID} className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1">
                                <div className="font-medium text-white text-sm">{item.PRODUCTO_NOMBRE}</div>
                                <div className="text-xs text-gray-500">
                                  {item.COLOR} · {item.TALLA} · {item.CANTIDAD} uni
                                </div>
                                <div className="text-xs text-mandarina-400 mt-0.5">{item.AREA}</div>
                              </div>
                              <span className={`badge text-xs text-white ${SUBESTADO_CONFIG[item.SUBESTADO]?.color || 'bg-gray-700'}`}>
                                {SUBESTADO_CONFIG[item.SUBESTADO]?.label || item.SUBESTADO}
                              </span>
                            </div>

                            {item.DETALLE_PERSONALIZADO && (
                              <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 mb-3">
                                {item.DETALLE_PERSONALIZADO}
                              </div>
                            )}

                            {/* Fotos */}
                            {(item.FOTO_PECHO_URL || item.FOTO_ESPALDA_URL) && (
                              <div className="flex gap-2 mb-3 flex-wrap">
                                {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M.Der'],['FOTO_MANGA_I_URL','M.Izq']].map(([k,l]) =>
                                  item[k] ? (
                                    <a key={k} href={item[k]} target="_blank" className="flex flex-col items-center gap-1">
                                      <img src={item[k]} className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                                      <span className="text-xs text-gray-500">{l}</span>
                                    </a>
                                  ) : null
                                )}
                              </div>
                            )}

                            {/* Nota del área */}
                            {editingNota === item.ITEM_ID ? (
                              <div className="mb-3">
                                <textarea className="input resize-none text-sm mb-2" rows={2}
                                  placeholder="Nota para este producto..."
                                  value={notaText} onChange={e => setNotaText(e.target.value)} />
                                <div className="flex gap-2">
                                  <button onClick={() => saveNota(item.ITEM_ID)} className="btn-primary text-xs px-3 py-1.5">Guardar</button>
                                  <button onClick={() => setEditingNota(null)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="mb-3">
                                {item.NOTAS_AREA && (
                                  <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-2">
                                    📝 {item.NOTAS_AREA}
                                  </div>
                                )}
                                <button onClick={() => { setEditingNota(item.ITEM_ID); setNotaText(item.NOTAS_AREA || '') }}
                                  className="text-xs text-gray-600 hover:text-gray-400">
                                  {item.NOTAS_AREA ? '✏️ Editar nota' : '+ Agregar nota'}
                                </button>
                              </div>
                            )}

                            {/* Subestado buttons */}
                            <div className="grid grid-cols-2 gap-1.5">
                              {SUBESTADOS_ORDEN.map(s => (
                                <button key={s} onClick={() => updateSubestado(item.ITEM_ID, s, pedido.PEDIDO_ID)}
                                  className={`py-2 rounded-xl text-xs font-semibold transition-all
                                    ${item.SUBESTADO === s
                                      ? `${SUBESTADO_CONFIG[s]?.color} text-white`
                                      : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                                  {SUBESTADO_CONFIG[s]?.label}
                                </button>
                              ))}
                            </div>
                          </div>
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
