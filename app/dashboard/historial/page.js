'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ESTADOS = ['TODOS', 'PENDIENTE_FABRICA', 'EN_FABRICA', 'DESPACHO', 'ENTREGADO']
const ESTADO_LABELS = {
  PENDIENTE_FABRICA: 'Pendiente fábrica',
  EN_FABRICA: 'En fábrica',
  DESPACHO: 'Para despacho',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}
const ESTADO_COLORS = {
  PENDIENTE_FABRICA: 'status-pendiente_fabrica',
  EN_FABRICA: 'status-en_fabrica',
  DESPACHO: 'status-despacho',
  ENTREGADO: 'status-entregado',
  CANCELADO: 'status-cancelado',
}

export default function HistorialPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadPedidos(u)
  }, [])

  async function loadPedidos(u) {
    setLoading(true)
    try {
      const res = await fetch(`/api/pedidos?vendedor=${u.id}&rol=${u.rol}`)
      const data = await res.json()
      setPedidos(data.pedidos || [])
    } finally {
      setLoading(false)
    }
  }

  const filtered = pedidos.filter(p => {
    if (filtroEstado !== 'TODOS' && p.ESTADO_PEDIDO !== filtroEstado) return false
    if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
    if (busqueda && !p.PEDIDO_ID?.toLowerCase().includes(busqueda.toLowerCase()) &&
        !p.CLIENTE_ID?.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 pt-2">
        <h1 className="text-xl font-display font-bold text-white">Historial de Ventas</h1>
        <Link href="/dashboard/nuevo-pedido" className="btn-primary text-sm px-4 py-2">
          + Nueva Venta
        </Link>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <input className="input" placeholder="Buscar por ID o cliente..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ESTADOS.map(e => (
            <button key={e}
              onClick={() => setFiltroEstado(e)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                ${filtroEstado === e ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
              {e === 'TODOS' ? 'Todos' : ESTADO_LABELS[e]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['TODAS', 'MANDARINA', 'INDSTORE'].map(t => (
            <button key={t}
              onClick={() => setFiltroTienda(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                ${filtroTienda === t ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              {t === 'TODAS' ? 'Todas las tiendas' : t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-600 mb-3">{filtered.length} pedido(s)</div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          <div className="text-3xl mb-3">📭</div>
          No hay pedidos con estos filtros
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Link key={p.PEDIDO_ID} href={`/dashboard/pedido/${p.PEDIDO_ID}`}
              className="card p-4 flex items-center gap-4 hover:border-gray-700 transition-all block">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                  <span className="text-gray-600 text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {p.items?.length || 0} prenda(s) ·{' '}
                  {p.FECHA_PEDIDO ? new Date(p.FECHA_PEDIDO).toLocaleDateString('es-EC') : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`badge ${ESTADO_COLORS[p.ESTADO_PEDIDO] || 'bg-gray-800 text-gray-400'}`}>
                  {ESTADO_LABELS[p.ESTADO_PEDIDO] || p.ESTADO_PEDIDO}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`badge ${p.ESTADO_PAGO === 'PAGADO' ? 'status-pagado' : p.ESTADO_PAGO === 'ABONO' ? 'status-abono' : 'status-pendiente'}`}>
                    ${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
