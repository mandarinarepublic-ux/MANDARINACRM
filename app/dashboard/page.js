'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadData(u)
  }, [])

  async function loadData(u) {
    try {
      const res = await fetch(`/api/pedidos?vendedor=${u.id}&rol=${u.rol}`)
      const data = await res.json()
      const all = data.pedidos || []
      setPedidos(all.slice(0, 5))
      setStats({
        total: all.length,
        pendientes: all.filter(p => p.ESTADO_PEDIDO === 'PENDIENTE_FABRICA').length,
        enFabrica: all.filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA').length,
        despacho: all.filter(p => p.ESTADO_PEDIDO === 'DESPACHO').length,
        montoMes: all.filter(p => p.FECHA_PEDIDO?.startsWith(new Date().toISOString().slice(0,7)))
          .reduce((s, p) => s + parseFloat(p.MONTO_TOTAL || 0), 0),
      })
    } finally {
      setLoading(false)
    }
  }

  if (!user || loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const statusLabel = {
    PENDIENTE_FABRICA: 'Pendiente fábrica',
    EN_FABRICA: 'En fábrica',
    DESPACHO: 'Para despacho',
    ENTREGADO: 'Entregado',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-white">
          Hola, {user.nombre.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Quick action */}
      {(user.rol === 'ADMIN' || user.rol === 'VENDEDOR') && (
        <Link href="/dashboard/nuevo-pedido"
          className="flex items-center gap-4 card p-5 mb-6 border-mandarina-500/30 hover:border-mandarina-500/60 transition-all group">
          <div className="w-12 h-12 bg-mandarina-500 rounded-xl flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
            ➕
          </div>
          <div>
            <div className="font-semibold text-white">Nueva Venta</div>
            <div className="text-gray-500 text-sm">Registrar un pedido nuevo</div>
          </div>
          <div className="ml-auto text-gray-600 group-hover:text-mandarina-400 transition-colors">→</div>
        </Link>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total pedidos', value: stats.total, color: 'text-white' },
            { label: 'Pendientes', value: stats.pendientes, color: 'text-yellow-400' },
            { label: 'En fábrica', value: stats.enFabrica, color: 'text-blue-400' },
            { label: 'Mes actual $', value: `$${stats.montoMes.toFixed(0)}`, color: 'text-mandarina-400' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</div>
              <div className="text-gray-500 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Pedidos recientes</h2>
          <Link href="/dashboard/historial" className="text-mandarina-400 text-sm hover:underline">Ver todos</Link>
        </div>
        {pedidos.length === 0 ? (
          <div className="p-8 text-center text-gray-600">No hay pedidos aún</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {pedidos.map(p => (
              <div key={p.PEDIDO_ID} className="px-5 py-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
                <div>
                  <div className="font-medium text-white text-sm">{p.PEDIDO_ID}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{p.CLIENTE_ID}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge status-${p.ESTADO_PEDIDO?.toLowerCase()}`}>
                    {statusLabel[p.ESTADO_PEDIDO] || p.ESTADO_PEDIDO}
                  </span>
                  <span className="text-white text-sm font-medium">${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
