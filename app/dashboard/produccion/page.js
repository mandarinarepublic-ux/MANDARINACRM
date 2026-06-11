'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProduccionPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroArea, setFiltroArea] = useState('TODAS')
  const [filtroSubestado, setFiltroSubestado] = useState('SOLICITADO')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    if (u.rol === 'DISEÑO' && u.areas?.length > 0) setFiltroArea(u.areas[0])
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const allItems = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA' || p.ESTADO_PEDIDO === 'PENDIENTE_FABRICA')
        .flatMap(p => (p.items || []).map(item => ({
          ...item,
          pedidoId: p.PEDIDO_ID,
          tiendaId: p.TIENDA_ID,
          fechaEntrega: p.FECHA_ENTREGA_PROMETIDA,
        })))
      setItems(allItems)
    } finally { setLoading(false) }
  }

  async function updateSubestado(itemId, subestado) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SUBESTADO: subestado }),
    })
    loadItems()
  }

  const areas = ['TODAS','ESTAMPADO','SUBLIMACION','BORDADO']

  const filtered = items.filter(i => {
    if (filtroArea !== 'TODAS' && !i.AREA?.includes(filtroArea)) return false
    if (filtroSubestado !== 'TODOS' && i.SUBESTADO !== filtroSubestado) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!i.pedidoId?.toLowerCase().includes(q) && !i.PRODUCTO_NOMBRE?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const urgentes = filtered.filter(i => {
    if (!i.fechaEntrega) return false
    return Math.ceil((new Date(i.fechaEntrega) - new Date()) / 86400000) <= 2
  })

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Producción</h1>
            <span className="text-gray-500 text-sm">{filtered.length} ítems</span>
          </div>
          <input className="input mb-3" placeholder="Buscar por pedido o producto..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
            {areas.map(a => (
              <button key={a} onClick={() => setFiltroArea(a)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0
                  ${filtroArea === a ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500'}`}>
                {a}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {['TODOS','SOLICITADO','EN_PROCESO','LISTO'].map(s => (
              <button key={s} onClick={() => setFiltroSubestado(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all flex-shrink-0
                  ${filtroSubestado === s ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
                {s === 'TODOS' ? 'Todos' : s === 'SOLICITADO' ? '⏳ Solicitado' : s === 'EN_PROCESO' ? '🔧 En proceso' : '✅ Listo'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {urgentes.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <div className="text-red-400 font-semibold text-sm">🚨 {urgentes.length} urgente(s) — entrega en 2 días o menos</div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600"><div className="text-3xl mb-3">🏭</div>No hay ítems con estos filtros</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(item => {
                const diasR = item.fechaEntrega ? Math.ceil((new Date(item.fechaEntrega) - new Date()) / 86400000) : null
                const urgente = diasR !== null && diasR <= 2
                return (
                  <div key={item.ITEM_ID} className={`card p-4 ${urgente ? 'border-red-500/40' : ''}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/dashboard/pedido/${item.pedidoId}`} className="font-mono text-xs text-mandarina-400 hover:underline">{item.pedidoId}</Link>
                          {urgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                        </div>
                        <div className="font-medium text-white text-sm">{item.PRODUCTO_NOMBRE}</div>
                        <div className="text-xs text-gray-500">{item.COLOR} · {item.TALLA} · {item.CANTIDAD} uni · <span className="text-mandarina-400">{item.AREA}</span></div>
                      </div>
                      {diasR !== null && (
                        <div className={`text-right text-xs ${urgente ? 'text-red-400' : 'text-gray-500'}`}>
                          <div className="font-bold">{diasR}d</div>
                          <div>restantes</div>
                        </div>
                      )}
                    </div>
                    {item.DETALLE_PERSONALIZADO && (
                      <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 mb-3">{item.DETALLE_PERSONALIZADO}</div>
                    )}
                    {(item.FOTO_PECHO_URL || item.FOTO_ESPALDA_URL) && (
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M.Der'],['FOTO_MANGA_I_URL','M.Izq']].map(([k,l]) =>
                          item[k] ? (
                            <a key={k} href={item[k]} target="_blank" className="flex flex-col items-center gap-1">
                              <img src={item[k]} className="w-12 h-12 rounded-lg object-cover border border-gray-700" />
                              <span className="text-xs text-gray-500">{l}</span>
                            </a>
                          ) : null
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {['SOLICITADO','EN_PROCESO','LISTO'].map(s => (
                        <button key={s} onClick={() => updateSubestado(item.ITEM_ID, s)}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all
                            ${item.SUBESTADO === s
                              ? s === 'LISTO' ? 'bg-green-500 text-white' : s === 'EN_PROCESO' ? 'bg-blue-500 text-white' : 'bg-yellow-500 text-white'
                              : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                          {s === 'SOLICITADO' ? '⏳' : s === 'EN_PROCESO' ? '🔧' : '✅'} {s.replace('_',' ')}
                        </button>
                      ))}
                    </div>
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
