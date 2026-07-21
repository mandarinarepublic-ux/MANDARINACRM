'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha, diasHastaEntrega } from '@/lib/parseFecha'

const CORTE_CONFIG = {
  PENDIENTE:   { label: '✂️ Pendiente',  color: 'bg-gray-600' },
  SOLICITADO:  { label: '🛒 Solicitado', color: 'bg-yellow-500' },
  CORTADO:     { label: '✅ Cortado',    color: 'bg-green-500' },
}
const CORTE_ORDEN = ['PENDIENTE', 'SOLICITADO', 'CORTADO']

function CorteCard({ item, userId, onCorteChange }) {
  const [subestadoCorte, setSubestadoCorte] = useState(item.SUBESTADO_CORTE || 'PENDIENTE')
  const fotos = ['FOTO_PECHO_URL','FOTO_ESPALDA_URL','FOTO_MANGA_D_URL','FOTO_MANGA_I_URL']
    .map(k => ({ key: k, url: item[k] })).filter(f => f.url)
  const [fotoActiva, setFotoActiva] = useState(fotos[0]?.key || null)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)

  async function handleCorte(s) {
    const prev = subestadoCorte
    setSubestadoCorte(s)
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ SUBESTADO_CORTE: s, _usuarioId: userId }),
      })
      if (!res.ok) setSubestadoCorte(prev)
      else onCorteChange?.(item.ITEM_ID, s)
    } catch { setSubestadoCorte(prev) }
  }

  return (
    <div className="p-4">

      {/* Fila superior: info + foto */}
      <div className="flex gap-4 mb-4">

        {/* Info — izquierda, texto grande */}
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Producto</div>
            <div className="text-lg font-bold text-white leading-tight">{item.PRODUCTO_NOMBRE}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Color</div>
              <div className="text-base font-semibold text-white">{item.COLOR || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Talla</div>
              <div className="text-base font-semibold text-white">{item.TALLA || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Cantidad</div>
              <div className="text-base font-semibold text-white">{item.CANTIDAD}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Área</div>
              <div className="text-base font-semibold text-mandarina-400">{item.AREA || '—'}</div>
            </div>
          </div>
          {item.DETALLE_PERSONALIZADO && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Detalle</div>
              <div className="text-sm text-gray-200 mt-0.5 bg-gray-800/60 rounded-lg px-3 py-2 leading-relaxed">{item.DETALLE_PERSONALIZADO}</div>
            </div>
          )}
        </div>

        {/* Foto — derecha */}
        <div className="flex-shrink-0">
          {fotos.length > 0 ? (
            <>
              <div className="w-28 h-28 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 cursor-pointer mb-2"
                onClick={() => setFotoFullscreen(item[fotoActiva || fotos[0].key])}>
                <img src={item[fotoActiva || fotos[0].key]} loading="lazy" className="w-full h-full object-cover" alt="foto" />
              </div>
              {fotos.length > 1 && (
                <div className="flex gap-1 justify-center flex-wrap">
                  {fotos.map(f => (
                    <button key={f.key} onClick={() => setFotoActiva(f.key)}
                      className={`p-0.5 rounded border transition-all ${(fotoActiva||fotos[0].key)===f.key ? 'border-mandarina-500' : 'border-gray-700'}`}>
                      <img src={f.url} loading="lazy" className="w-8 h-8 rounded object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1 text-center">👆 Toca para ampliar</div>
            </>
          ) : (
            <div className="w-28 h-28 rounded-xl border border-gray-800 bg-gray-800/50 flex items-center justify-center">
              <span className="text-gray-600 text-xs text-center px-2">Sin foto</span>
            </div>
          )}
        </div>
      </div>

      {/* Botones de corte — ancho completo, grandes para mobile */}
      <div className="grid grid-cols-3 gap-2">
        {CORTE_ORDEN.map(s => (
          <button key={s} onClick={() => handleCorte(s)}
            className={`py-3 rounded-xl text-sm font-bold transition-all
              ${subestadoCorte === s
                ? `${CORTE_CONFIG[s].color} text-white shadow-lg ring-2 ring-white/20`
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
            {CORTE_CONFIG[s].label}
          </button>
        ))}
      </div>

      {fotoFullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setFotoFullscreen(null)}>
          <img src={fotoFullscreen} className="max-w-full max-h-full object-contain rounded-xl" />
          <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  )
}

export default function CortePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('PENDIENTE')
  const [busqueda, setBusqueda] = useState('')
  const [expandedPedido, setExpandedPedido] = useState(null)
  const [visibles, setVisibles] = useState(20)
  const PAGE_SIZE_C = 20

  useEffect(() => { setVisibles(20) }, [busqueda, filtro])

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (!['CORTE', 'ADMIN'].includes(u.rol)) { router.push('/dashboard'); return }
    setUser(u)
    loadItems()
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const resultado = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .sort((a, b) => {
          const diff = (parseFecha(a.FECHA_PEDIDO)||new Date(0)) - (parseFecha(b.FECHA_PEDIDO)||new Date(0))
          if (diff !== 0) return diff
          return (a.PEDIDO_ID || '').localeCompare(b.PEDIDO_ID || '')
        })
        .map(p => ({
          ...p,
          itemsFiltrados: (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
        }))
        .filter(p => p.itemsFiltrados.length > 0)
      setPedidos(resultado)
    } finally { setLoading(false) }
  }, [])

  function handleCorteChange(itemId, nuevoEstado) {
    setPedidos(prev => prev.map(p => ({
      ...p,
      itemsFiltrados: p.itemsFiltrados.map(i => i.ITEM_ID === itemId ? {...i, SUBESTADO_CORTE: nuevoEstado} : i)
    })))
  }

  const contadores = pedidos.reduce((acc, p) => {
    p.itemsFiltrados.forEach(i => {
      const c = i.SUBESTADO_CORTE || 'PENDIENTE'
      acc[c] = (acc[c] || 0) + 1
    })
    return acc
  }, {})

  const filtered = pedidos.map(p => ({
    ...p,
    itemsFiltrados: p.itemsFiltrados.filter(i => {
      const corte = i.SUBESTADO_CORTE || 'PENDIENTE'
      const matchF = filtro === 'TODOS' || corte === filtro
      const matchB = !busqueda || coincideBusqueda(p, busqueda) ||
        i.PRODUCTO_NOMBRE?.toLowerCase().includes(busqueda.toLowerCase())
      return matchF && matchB
    })
  })).filter(p => p.itemsFiltrados.length > 0)

  const totalItems = filtered.reduce((s, p) => s + p.itemsFiltrados.length, 0)
  const paginados = filtered.slice(0, visibles)
  const hayMas = filtered.length > visibles

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1 text-lg">←</button>
            <div className="flex-1">
              <h1 className="text-xl font-display font-bold text-white">✂️ Corte de Tela</h1>
              <p className="text-xs text-gray-500">{totalItems} ítem(s)</p>
            </div>
          </div>

          <input className="input w-full mb-3" placeholder="Buscar por pedido, producto, nombre, cédula o celular..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />

          {/* Filtros con contadores grandes */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'TODOS',      label: 'Todos',          icon: '📋', count: Object.values(contadores).reduce((s,n)=>s+n,0), cls: 'bg-mandarina-500 border-mandarina-400' },
              { key: 'PENDIENTE',  label: 'Pendiente',      icon: '✂️',  count: contadores.PENDIENTE||0,  cls: 'bg-gray-600 border-gray-500' },
              { key: 'SOLICITADO', label: 'Solicitado',     icon: '🛒', count: contadores.SOLICITADO||0, cls: 'bg-yellow-500 border-yellow-400' },
              { key: 'CORTADO',    label: 'Cortado',        icon: '✅', count: contadores.CORTADO||0,    cls: 'bg-green-500 border-green-400' },
            ].map(f => (
              <button key={f.key} onClick={() => setFiltro(f.key)}
                className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 text-white transition-all
                  ${filtro === f.key ? f.cls : 'border-gray-700 bg-gray-800/50 text-gray-500 hover:text-gray-300'}`}>
                <span className="text-xl mb-1">{f.icon}</span>
                <span className="text-lg font-black">{f.count}</span>
                <span className="text-xs font-medium">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">✂️</div>
              <div className="font-medium text-white">Sin ítems en este estado</div>
            </div>
          ) : (
            <>
            <div className="space-y-3">
              {paginados.map(pedido => {
                const diasR = diasHastaEntrega(pedido.FECHA_ENTREGA_PROMETIDA)
                const urgente = diasR !== null && diasR <= 2
                const isExpanded = expandedPedido === pedido.PEDIDO_ID

                return (
                  <div key={pedido.PEDIDO_ID} className={`card overflow-hidden ${urgente ? 'border-red-500/40' : ''}`}>
                    <button onClick={() => setExpandedPedido(isExpanded ? null : pedido.PEDIDO_ID)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-800/30 transition-all text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/dashboard/pedido/${pedido.PEDIDO_ID}`} onClick={e => e.stopPropagation()}
                            className="font-mono text-sm font-medium text-mandarina-400 hover:underline">
                            {pedido.PEDIDO_ID}
                          </Link>
                          {urgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                          <span className="text-xs text-gray-600">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                          {/* Estado corte: resumen + dots */}
                          <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end max-w-[55%]">
                            <span className="text-xs font-medium text-gray-400">
                              {pedido.itemsFiltrados.filter(i => (i.SUBESTADO_CORTE||'PENDIENTE') === 'CORTADO').length}/{pedido.itemsFiltrados.length} cortados
                            </span>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {pedido.itemsFiltrados.map(i => (
                                <span key={i.ITEM_ID}
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    (i.SUBESTADO_CORTE||'PENDIENTE') === 'CORTADO' ? 'bg-green-500'
                                    : (i.SUBESTADO_CORTE||'PENDIENTE') === 'SOLICITADO' ? 'bg-yellow-500' : 'bg-gray-600'
                                  }`} title={i.PRODUCTO_NOMBRE} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {pedido.itemsFiltrados.length} prenda(s)
                          {diasR !== null && ` · ${diasR}d restantes`}
                          {' · '}{pedido.FECHA_PEDIDO?.split(' ')[0]}
                        </div>
                      </div>
                      <span className="text-gray-600 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800">
                        {pedido.itemsFiltrados.map(item => (
                          <CorteCard key={item.ITEM_ID} item={item} userId={user?.id} onCorteChange={handleCorteChange} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {hayMas && (
              <button
                onClick={() => setVisibles(v => v + PAGE_SIZE_C)}
                className="w-full mt-3 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 hover:text-white transition-all">
                Cargar más ({filtered.length - visibles} restantes)
              </button>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
