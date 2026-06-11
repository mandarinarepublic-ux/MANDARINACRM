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

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    // Set default area filter for DISEÑO role
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
          clienteId: p.CLIENTE_ID,
          fechaEntrega: p.FECHA_ENTREGA_PROMETIDA,
        })))
      setItems(allItems)
    } finally {
      setLoading(false)
    }
  }

  async function updateSubestado(itemId, subestado) {
    await fetch(`/api/pedidos/item/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SUBESTADO: subestado }),
    })
    loadItems()
  }

  const areas = ['TODAS', 'ESTAMPADO', 'SUBLIMACION', 'BORDADO']
  const subestados = ['TODOS', 'SOLICITADO', 'EN_PROCESO', 'LISTO']

  const filtered = items.filter(i => {
    if (filtroArea !== 'TODAS' && !i.AREA?.includes(filtroArea)) return false
    if (filtroSubestado !== 'TODOS' && i.SUBESTADO !== filtroSubestado) return false
    return true
  })

  const urgentes = filtered.filter(i => {
    if (!i.fechaEntrega) return false
    const dias = Math.ceil((new Date(i.fechaEntrega) - new Date()) / 86400000)
    return dias <= 2
  })

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-6 pt-2">
        <h1 className="text-xl font-display font-bold text-white">Producción</h1>
        <p className="text-gray-500 text-sm">{filtered.length} producto(s) en proceso</p>
      </div>

      {urgentes.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <div className="text-red-400 font-semibold text-sm mb-1">🚨 {urgentes.length} pedido(s) urgente(s)</div>
          <div className="text-red-300 text-xs">Entrega en 2 días o menos</div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {areas.map(a => (
            <button key={a} onClick={() => setFiltroArea(a)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${filtroArea === a ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500'}`}>
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {subestados.map(s => (
            <button key={s} onClick={() => setFiltroSubestado(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${filtroSubestado === s ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              {s === 'TODOS' ? 'Todos' : s === 'SOLICITADO' ? '⏳ Solicitado' : s === 'EN_PROCESO' ? '🔧 En proceso' : '✅ Listo'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          <div className="text-3xl mb-3">🏭</div>
          No hay productos con estos filtros
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const diasRestantes = item.fechaEntrega
              ? Math.ceil((new Date(item.fechaEntrega) - new Date()) / 86400000) : null
            const esUrgente = diasRestantes !== null && diasRestantes <= 2

            return (
              <div key={item.ITEM_ID} className={`card p-4 ${esUrgente ? 'border-red-500/40' : ''}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/dashboard/pedido/${item.pedidoId}`}
                        className="font-mono text-xs text-mandarina-400 hover:underline">{item.pedidoId}</Link>
                      {esUrgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                    </div>
                    <div className="font-medium text-white text-sm">{item.PRODUCTO_NOMBRE}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {item.COLOR} · {item.TALLA} · {item.CANTIDAD} uni · <span className="text-mandarina-400">{item.AREA}</span>
                    </div>
                  </div>
                  {diasRestantes !== null && (
                    <div className={`text-right text-xs ${esUrgente ? 'text-red-400' : 'text-gray-500'}`}>
                      <div className="font-semibold">{diasRestantes}d</div>
                      <div>restantes</div>
                    </div>
                  )}
                </div>

                {item.DETALLE_PERSONALIZADO && (
                  <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 mb-3">
                    {item.DETALLE_PERSONALIZADO}
                  </div>
                )}

                {/* Fotos */}
                {(item.FOTO_PECHO_URL || item.FOTO_ESPALDA_URL || item.FOTO_MANGA_D_URL || item.FOTO_MANGA_I_URL) && (
                  <div className="flex gap-2 mb-3">
                    {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','M.Der'],['FOTO_MANGA_I_URL','M.Izq']].map(([key,label]) =>
                      item[key] ? (
                        <a key={key} href={item[key]} target="_blank"
                          className="flex flex-col items-center gap-1">
                          <img src={item[key]} className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                          <span className="text-xs text-gray-500">{label}</span>
                        </a>
                      ) : null
                    )}
                    {item.ARCHIVO_DISENO_URL && (
                      <a href={item.ARCHIVO_DISENO_URL} target="_blank"
                        className="flex flex-col items-center gap-1 justify-center w-14">
                        <div className="w-14 h-14 rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center text-xl">📁</div>
                        <span className="text-xs text-gray-500">Archivo</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Estado buttons */}
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
  )
}
