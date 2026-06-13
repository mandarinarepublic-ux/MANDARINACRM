'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function DespachosPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState(null)
  const [guia, setGuia] = useState({ numero: '', transportista: 'SERVIENTREGA', foto: null })
  const [saving, setSaving] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    loadPedidos()
  }, [])

  async function loadPedidos() {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const listos = (data.pedidos || []).filter(p =>
        p.ESTADO_PEDIDO === 'DESPACHO' ||
        (p.items || []).every(i => i.SUBESTADO === 'LISTO') && p.ESTADO_PEDIDO === 'EN_FABRICA'
      )
      setPedidos(listos)
    } finally { setLoading(false) }
  }

  const filtered = pedidos.filter(p => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return p.PEDIDO_ID?.toLowerCase().includes(q) || p.CLIENTE_ID?.toLowerCase().includes(q)
  })

  function handleFotoGuia(file) {
    const reader = new FileReader()
    reader.onload = e => setGuia(g => ({...g, foto: e.target.result}))
    reader.readAsDataURL(file)
  }

  async function registrarDespacho(pedidoId) {
    if (!guia.numero.trim()) { alert('El número de guía es obligatorio'); return }
    setSaving(true)
    try {
      await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ESTADO_PEDIDO: 'DESPACHO',
          GUIA_NUMERO: guia.numero.trim(),
          GUIA_TRANSPORTISTA: guia.transportista,
          _usuarioId: user?.id,
        }),
      })
      setSelectedPedido(null)
      setGuia({ numero: '', transportista: 'SERVIENTREGA', foto: null })
      loadPedidos()
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Despachos</h1>
            <span className="text-gray-500 text-sm">{filtered.length} pedido(s)</span>
          </div>
          <input className="input" placeholder="Buscar por pedido o cliente..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600"><div className="text-3xl mb-3">🚚</div>No hay pedidos para despachar</div>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => (
                <div key={p.PEDIDO_ID} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="font-mono text-sm font-medium text-white hover:text-mandarina-400">{p.PEDIDO_ID}</Link>
                      <div className="text-xs text-gray-500">{p.items?.length || 0} prendas · {p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</div>
                    </div>
                    {p.ESTADO_PEDIDO === 'DESPACHO'
                      ? <span className="badge status-despacho">Despachado ✓</span>
                      : <button onClick={() => setSelectedPedido(p.PEDIDO_ID === selectedPedido ? null : p.PEDIDO_ID)}
                          className="btn-primary text-xs py-1.5 px-3">Registrar guía</button>}
                  </div>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {(p.items || []).map(item => (
                      <span key={item.ITEM_ID}
                        className={`text-xs px-2 py-0.5 rounded-full ${item.SUBESTADO === 'LISTO' ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {item.TALLA} · {item.AREA?.slice(0,3)}
                      </span>
                    ))}
                  </div>

                  {selectedPedido === p.PEDIDO_ID && (
                    <div className="border-t border-gray-800 pt-4 mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Número de guía *</label>
                          <input className="input" placeholder="123456789"
                            value={guia.numero} onChange={e => setGuia(g => ({...g, numero: e.target.value}))} />
                        </div>
                        <div>
                          <label className="label">Transportista</label>
                          <select className="input" value={guia.transportista}
                            onChange={e => setGuia(g => ({...g, transportista: e.target.value}))}>
                            {['SERVIENTREGA','TRAMACO','LAAR','RETIRO_TIENDA'].map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all
                        ${guia.foto ? 'border-mandarina-500 bg-mandarina-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleFotoGuia(e.target.files[0])} />
                        {guia.foto
                          ? <div className="flex items-center gap-3"><img src={guia.foto} className="w-12 h-12 rounded-lg object-cover" /><span className="text-mandarina-400 text-sm">✓ Foto cargada</span></div>
                          : <span className="text-gray-500 text-sm">📷 Foto de la guía Servientrega</span>}
                      </label>
                      <button onClick={() => registrarDespacho(p.PEDIDO_ID)}
                        disabled={saving || !guia.numero} className="btn-primary w-full">
                        {saving ? '⏳ Guardando...' : '🚚 Confirmar despacho'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
