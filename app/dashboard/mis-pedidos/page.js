'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'

const ESTADO_LABELS = { EN_FABRICA:'En Producción', DESPACHO:'Para despacho', ENTREGADO:'Entregado' }
const ESTADO_COLORS = { EN_FABRICA:'text-blue-400 bg-blue-500/10', DESPACHO:'text-purple-400 bg-purple-500/10', ENTREGADO:'text-green-400 bg-green-500/10' }

function parseFecha(str) {
  if (!str) return null
  if (str.match(/^\d{4}-/)) return new Date(str)
  const months = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11}
  const m = str.match(/^(\d{2})([A-Za-z]{3})(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]))
}

export default function MisPedidosPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [mostrarFecha, setMostrarFecha] = useState(false)

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
      const res = await fetch(`/api/pedidos?vendedor=${encodeURIComponent(u.nombre || u.id)}&vendedorId=${u.id}&rol=${u.rol}&scope=mios`)
      const data = await res.json()
      const ordenados = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .sort((a, b) => {
          const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
          const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
          return fb - fa
        })
      setPedidos(ordenados)
    } finally { setLoading(false) }
  }

  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos.filter(p => {
    if (busqueda && !coincideBusqueda(p, busqueda)) return false
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

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-display font-bold text-white">Mis Pedidos</h1>
              <p className="text-xs text-gray-500">En producción — editables</p>
            </div>
            <Link href="/dashboard/nuevo-pedido" className="btn-primary text-sm px-4 py-2">+ Nueva</Link>
          </div>
          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="Buscar por pedido, nombre, cédula o celular..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={() => setMostrarFecha(v => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0
                ${hayFecha ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              📅 {hayFecha ? 'Fecha ✓' : 'Fecha'}
            </button>
          </div>
          {mostrarFecha && (
            <div className="flex gap-2 mb-2 items-end">
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
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600">
              <div className="text-3xl mb-3">📦</div>
              <div className="font-medium text-gray-400">No tienes pedidos en producción</div>
              <div className="text-sm text-gray-600 mt-1">Los pedidos entregados o despachados están en Historial</div>
              <Link href="/dashboard/nuevo-pedido" className="btn-primary mt-4 inline-block text-sm px-6 py-2">Crear nuevo pedido</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => (
                <Link key={p.PEDIDO_ID} href={`/dashboard/editar-pedido/${p.PEDIDO_ID}`}
                  className="card p-4 flex items-center gap-4 hover:border-gray-700 transition-all block">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                      <span className="text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                    </div>
                    <div className="text-xs text-gray-500">{p.items?.length || 0} prenda(s) · {p.FECHA_PEDIDO?.split(' ')[0] || ''}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`badge text-xs ${ESTADO_COLORS[p.ESTADO_PEDIDO]}`}>{ESTADO_LABELS[p.ESTADO_PEDIDO] || p.ESTADO_PEDIDO}</span>
                    <span className={`badge text-xs ${p.ESTADO_PAGO === 'PAGADO' ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10'}`}>${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
