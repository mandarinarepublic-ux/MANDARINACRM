'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CatalogoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  useEffect(() => {
    if (user) loadProductos()
  }, [tienda, user])

  async function loadProductos(q = '') {
    setLoading(true)
    try {
      const url = `/api/shopify/products?tienda=${tienda}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setProductos(data.products || [])
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  function handleBusqueda(val) {
    setBusqueda(val)
    if (val.length === 0) loadProductos()
    else if (val.length >= 2) loadProductos(val)
  }

  const filtered = productos.filter(p =>
    !busqueda || p.title?.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Catálogo Shopify</h1>
            <span className="text-xs text-gray-500">{filtered.length} producto(s)</span>
          </div>

          {/* Tienda selector */}
          <div className="flex gap-2 mb-3">
            {['MANDARINA','INDSTORE'].map(t => (
              <button key={t} onClick={() => { setTienda(t); setSelected(null) }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all border
                  ${tienda === t ? 'text-white border-transparent' : 'border-gray-700 text-gray-500'}`}
                style={tienda === t ? { backgroundColor: t === 'MANDARINA' ? '#FF6B00' : '#E91E8C' } : {}}>
                {t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}
              </button>
            ))}
          </div>

          <input className="input" placeholder="Buscar producto..."
            value={busqueda} onChange={e => handleBusqueda(e.target.value)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600">
              <div className="text-3xl mb-3">📦</div>
              {busqueda ? 'No se encontraron productos' : 'No hay productos en esta tienda'}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(p => (
                <button key={p.id} onClick={() => setSelected(selected?.id === p.id ? null : p)}
                  className={`card text-left transition-all hover:border-gray-600 overflow-hidden
                    ${selected?.id === p.id ? 'border-mandarina-500' : ''}`}>
                  {/* Imagen */}
                  <div className="aspect-square bg-gray-800 relative">
                    {p.image
                      ? <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">👕</div>}
                    {/* Tienda badge */}
                    <div className="absolute top-2 right-2">
                      <span className="text-xs px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: tienda === 'MANDARINA' ? '#FF6B00' : '#E91E8C' }}>
                        {tienda === 'MANDARINA' ? 'MAN' : 'IND'}
                      </span>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <div className="text-xs font-medium text-white leading-tight mb-1 line-clamp-2">{p.title}</div>
                    <div className="text-xs text-mandarina-400 font-medium">
                      desde ${Math.min(...(p.variants || []).map(v => parseFloat(v.price || 0))).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">{p.variants?.length || 0} variante(s)</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Product detail panel */}
          {selected && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setSelected(null)}>
              <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gray-900 flex items-center justify-between p-4 border-b border-gray-800">
                  <h3 className="font-semibold text-white text-sm">{selected.title}</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white p-1">✕</button>
                </div>

                {/* Image */}
                {selected.image && (
                  <div className="aspect-video bg-gray-800">
                    <img src={selected.image} alt={selected.title} className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="p-4">
                  {/* Tags */}
                  {selected.tags && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {selected.tags.split(',').map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">{tag.trim()}</span>
                      ))}
                    </div>
                  )}

                  {/* Opciones */}
                  {selected.options?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Opciones</div>
                      <div className="flex flex-wrap gap-2">
                        {selected.options.map(opt => (
                          <div key={opt.name} className="text-xs">
                            <span className="text-gray-400">{opt.name}:</span>{' '}
                            <span className="text-white">{opt.values?.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Variantes */}
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Variantes</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selected.variants?.map(v => (
                      <div key={v.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                        <div>
                          <span className="text-sm text-white">{v.title}</span>
                          {v.sku && <span className="text-xs text-gray-500 ml-2">SKU: {v.sku}</span>}
                        </div>
                        <span className="text-mandarina-400 font-medium text-sm">${parseFloat(v.price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Shopify ID */}
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <div className="text-xs text-gray-600">Shopify ID: {selected.id}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
