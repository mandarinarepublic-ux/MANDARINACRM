'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function CatalogoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)

  // Sucursal
  const [sucursal, setSucursal] = useState([])
  const [loadingSuc, setLoadingSuc] = useState(false)
  const [modalAgregar, setModalAgregar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ nombre: '', tienda: 'Mandarina', talla: 'U', color: '', stock: '', precio: '', foto_base64: '', foto_preview: '' })
  const fileRef = useRef()

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [])

  useEffect(() => {
    if (!user) return
    if (tienda === 'SUCURSAL') loadSucursal()
    else loadProductos()
  }, [tienda, user])

  // ── Shopify ──────────────────────────────────────────────────────────────
  async function loadProductos(q = '') {
    setLoading(true)
    try {
      const url = `/api/shopify/products?tienda=${tienda}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      setProductos(data.products || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // Sincroniza el catálogo desde Shopify hacia la hoja PRODUCTOS_SHOPIFY (ambas tiendas),
  // luego recarga la vista. Para el caso raro de subir un producto y quererlo ver ya.
  async function handleSync() {
    setSincronizando(true)
    try {
      const res = await fetch('/api/shopify/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        const detalle = Object.entries(data.porTienda || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')
        alert(`Catálogo actualizado ✓  (${data.total} productos)\n${detalle}`)
        await loadProductos(busqueda)
      } else {
        alert('No se pudo actualizar: ' + (data.error || 'error desconocido'))
      }
    } catch (e) {
      alert('Error al sincronizar con Shopify')
    } finally {
      setSincronizando(false)
    }
  }

  function handleBusqueda(val) {
    setBusqueda(val)
    if (val.length === 0) loadProductos()
    else if (val.length >= 2) loadProductos(val)
  }

  const filtered = productos.filter(p =>
    !busqueda || p.title?.toLowerCase().includes(busqueda.toLowerCase())
  )

  // ── Sucursal ─────────────────────────────────────────────────────────────
  async function loadSucursal() {
    setLoadingSuc(true)
    try {
      const res = await fetch('/api/sucursal?todos=true')
      const data = await res.json()
      setSucursal(data.productos || [])
    } catch (e) { console.error(e) }
    finally { setLoadingSuc(false) }
  }

  function handleFoto(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, foto_base64: ev.target.result, foto_preview: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleGuardar() {
    if (!form.nombre || !form.stock) return alert('Nombre y stock son obligatorios')
    setGuardando(true)
    try {
      const res = await fetch('/api/sucursal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, usuario: user?.nombre || user?.email || 'desconocido' })
      })
      const data = await res.json()
      if (data.ok) {
        setModalAgregar(false)
        setForm({ nombre: '', tienda: 'Mandarina', talla: 'U', color: '', stock: '', precio: '', foto_base64: '', foto_preview: '' })
        await loadSucursal()
      } else { alert('Error: ' + data.error) }
    } catch (e) { alert('Error al guardar') }
    finally { setGuardando(false) }
  }

  const [modalEditar, setModalEditar] = useState(false)
  const [editForm, setEditForm]       = useState(null)
  const [editando, setEditando]       = useState(false)
  const editFileRef = useRef()

  function abrirEditar(p) {
    setEditForm({
      id:           p.ID,
      nombre:       p.NOMBRE,
      tienda:       p.TIENDA,
      talla:        p.TALLA || 'U',
      color:        p.COLOR || '',
      stock:        p.STOCK,
      precio:       p.PRECIO,
      foto_base64:  '',
      foto_preview: p.FOTO_URL || '',
    })
    setModalEditar(true)
  }

  function handleFotoEditar(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setEditForm(f => ({ ...f, foto_base64: ev.target.result, foto_preview: ev.target.result }))
    reader.readAsDataURL(file)
  }

  async function handleGuardarEdicion() {
    if (!editForm.nombre || !editForm.stock) return alert('Nombre y stock son obligatorios')
    setEditando(true)
    try {
      const res = await fetch('/api/sucursal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:       editForm.id,
          usuario:  user?.nombre || user?.email || 'desconocido',
          nombre:   editForm.nombre,
          tienda:   editForm.tienda,
          talla:    editForm.talla,
          color:    editForm.color,
          stock:    editForm.stock,
          precio:   editForm.precio,
          ...(editForm.foto_base64 ? { foto_base64: editForm.foto_base64 } : {}),
        })
      })
      const data = await res.json()
      if (data.ok) {
        setModalEditar(false)
        setEditForm(null)
        await loadSucursal()
      } else { alert('Error: ' + data.error) }
    } catch (e) { alert('Error al guardar') }
    finally { setEditando(false) }
  }


  const tallasOpciones = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'U']

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">
              {tienda === 'SUCURSAL' ? 'Inventario Sucursal' : 'Catálogo Shopify'}
            </h1>
            <div className="flex items-center gap-2">
              {tienda === 'SUCURSAL' && (
                <button onClick={() => setModalAgregar(true)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-mandarina-500 text-white font-semibold hover:bg-mandarina-600 transition-all">
                  + Agregar
                </button>
              )}
              {tienda !== 'SUCURSAL' && (
                <button onClick={handleSync} disabled={sincronizando}
                  title="Trae los productos más recientes desde Shopify"
                  className="text-xs px-3 py-1.5 rounded-xl border border-gray-700 text-gray-300 font-semibold hover:border-gray-500 transition-all disabled:opacity-50 min-h-[44px] md:min-h-0">
                  {sincronizando ? 'Actualizando…' : '↻ Actualizar'}
                </button>
              )}
              <span className="text-xs text-gray-500">
                {tienda === 'SUCURSAL' ? `${sucursal.filter(p => parseInt(p.STOCK) > 0).length} producto(s)` : `${filtered.length} producto(s)`}
              </span>
            </div>
          </div>

          {/* Tabs tienda */}
          <div className="flex gap-2 mb-3">
            {[
              { key: 'MANDARINA', label: '🍊 Mandarina', color: '#FF6B00' },
              { key: 'INDSTORE',  label: '🏪 Indstore',  color: '#E91E8C' },
              { key: 'SUCURSAL',  label: '🏬 Sucursal',  color: '#10B981' },
            ].map(t => (
              <button key={t.key} onClick={() => { setTienda(t.key); setSelected(null); setBusqueda('') }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all border
                  ${tienda === t.key ? 'text-white border-transparent' : 'border-gray-700 text-gray-500'}`}
                style={tienda === t.key ? { backgroundColor: t.color } : {}}>
                {t.label}
              </button>
            ))}
          </div>

          {tienda !== 'SUCURSAL' && (
            <input className="input" placeholder="Buscar producto..."
              value={busqueda} onChange={e => handleBusqueda(e.target.value)} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-3">

          {/* ── Vista Sucursal ── */}
          {tienda === 'SUCURSAL' && (
            loadingSuc ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sucursal.length === 0 ? (
              <div className="card p-8 text-center text-gray-600">
                <div className="text-3xl mb-3">🏬</div>
                <p className="text-sm">Sin productos en sucursal todavía</p>
                <button onClick={() => setModalAgregar(true)}
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-all">
                  + Agregar primer producto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {sucursal.filter(p => parseInt(p.STOCK) > 0).map(p => (
                    <div key={p.ID} className="card overflow-hidden transition-all hover:border-gray-600">
                      {/* Imagen */}
                      <div className="aspect-square bg-gray-800 relative">
                        {p.FOTO_URL
                          ? <img src={p.FOTO_URL} alt={p.NOMBRE} loading="lazy" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">👕</div>}
                        {/* Badge tienda */}
                        <div className="absolute top-2 right-2">
                          <span className="text-xs px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: p.TIENDA === 'Mandarina' ? '#FF6B00' : '#E91E8C' }}>
                            {p.TIENDA === 'Mandarina' ? 'MAN' : 'IND'}
                          </span>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <div className="text-xs font-medium text-white leading-tight mb-1 line-clamp-2">{p.NOMBRE}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">{p.TALLA} {p.COLOR ? `· ${p.COLOR}` : ''}</span>
                          <span className="text-xs font-bold text-green-400">Stock: {p.STOCK}</span>
                        </div>
                        {p.PRECIO > 0 && (
                          <div className="text-xs text-mandarina-400 font-medium mt-1">${parseFloat(p.PRECIO).toFixed(2)}</div>
                        )}
                        {/* Acciones */}
                        <button
                          onClick={() => {
                            sessionStorage.setItem('sucursal_preselecc', JSON.stringify({
                              tipo: 'SUCURSAL',
                              sucursalId: p.ID,
                              nombre: p.NOMBRE,
                              talla: p.TALLA,
                              color: p.COLOR,
                              precio: p.PRECIO,
                              tienda: p.TIENDA,
                            }))
                            router.push('/dashboard/nuevo-pedido')
                          }}
                          className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                          style={{ backgroundColor: p.TIENDA === 'Mandarina' ? '#FF6B00' : '#E91E8C' }}>
                          Comprar
                        </button>
                        <button
                          onClick={() => abrirEditar(p)}
                          className="w-full mt-1 py-2 text-center text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all">
                          ✏️ Editar
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )
          )}

          {/* ── Vista Shopify ── */}
          {tienda !== 'SUCURSAL' && (
            loading ? (
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
                    <div className="aspect-square bg-gray-800 relative">
                      {p.image
                        ? <img src={p.image} alt={p.title} loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">👕</div>}
                      <div className="absolute top-2 right-2">
                        <span className="text-xs px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: tienda === 'MANDARINA' ? '#FF6B00' : '#E91E8C' }}>
                          {tienda === 'MANDARINA' ? 'MAN' : 'IND'}
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-medium text-white leading-tight mb-1 line-clamp-2">{p.title}</div>
                      <div className="text-xs text-mandarina-400 font-medium">
                        {(() => {
                          const precios = (p.variants || []).map(v => parseFloat(v.price || 0)).filter(n => !isNaN(n))
                          return precios.length ? `desde $${Math.min(...precios).toFixed(2)}` : 'Sin precio'
                        })()}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">{p.variants?.length || 0} variante(s)</div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Product detail panel (Shopify) */}
          {selected && tienda !== 'SUCURSAL' && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setSelected(null)}>
              <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="sticky top-0 bg-gray-900 flex items-center justify-between p-4 border-b border-gray-800">
                  <h3 className="font-semibold text-white text-sm">{selected.title}</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white p-1">✕</button>
                </div>
                {selected.image && (
                  <div className="aspect-video bg-gray-800">
                    <img src={selected.image} alt={selected.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  {selected.tags && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {selected.tags.split(',').map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">{tag.trim()}</span>
                      ))}
                    </div>
                  )}
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
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <div className="text-xs text-gray-600">Shopify ID: {selected.id}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Editar Sucursal ── */}
      {modalEditar && editForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setModalEditar(false)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold text-white">Editar producto</h3>
              <button onClick={() => setModalEditar(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-4">

              {/* Foto */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Foto del producto</label>
                <div onClick={() => editFileRef.current?.click()}
                  className="w-full h-36 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-gray-500 overflow-hidden transition-all">
                  {editForm.foto_preview
                    ? <img src={editForm.foto_preview} className="w-full h-full object-cover" />
                    : <div className="text-center text-gray-600"><div className="text-2xl mb-1">📷</div><div className="text-xs">Subir imagen</div></div>
                  }
                </div>
                <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleFotoEditar} />
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
                <input className="input" value={editForm.nombre}
                  onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>

              {/* Tienda */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tienda *</label>
                <div className="flex gap-2">
                  {['Mandarina', 'Indstore'].map(t => (
                    <button key={t} onClick={() => setEditForm(f => ({ ...f, tienda: t }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all
                        ${editForm.tienda === t ? 'text-white border-transparent' : 'border-gray-700 text-gray-500'}`}
                      style={editForm.tienda === t ? { backgroundColor: t === 'Mandarina' ? '#FF6B00' : '#E91E8C' } : {}}>
                      {t === 'Mandarina' ? '🍊 Mandarina' : '🏣 Indstore'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Talla */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Talla</label>
                <div className="flex gap-2 flex-wrap">
                  {tallasOpciones.map(t => (
                    <button key={t} onClick={() => setEditForm(f => ({ ...f, talla: t }))}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all
                        ${editForm.talla === t ? 'bg-gray-600 border-gray-500 text-white' : 'border-gray-700 text-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Color</label>
                <input className="input" placeholder="Ej: Negro, Rojo..." value={editForm.color}
                  onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
              </div>

              {/* Stock y Precio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Stock *</label>
                  <input className="input" type="number" min="0" value={editForm.stock}
                    onChange={e => setEditForm(f => ({ ...f, stock: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Precio $</label>
                  <input className="input" type="number" step="0.01" value={editForm.precio}
                    onChange={e => setEditForm(f => ({ ...f, precio: e.target.value }))} />
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModalEditar(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-500 transition-all">
                  Cancelar
                </button>
                <button onClick={handleGuardarEdicion} disabled={editando}
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-all disabled:opacity-50">
                  {editando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Agregar Sucursal ── */}
      {modalAgregar && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setModalAgregar(false)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-semibold text-white">Agregar a Sucursal</h3>
              <button onClick={() => setModalAgregar(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-4">

              {/* Foto */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Foto del producto</label>
                <div onClick={() => fileRef.current?.click()}
                  className="w-full h-36 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center cursor-pointer hover:border-gray-500 overflow-hidden transition-all">
                  {form.foto_preview
                    ? <img src={form.foto_preview} className="w-full h-full object-cover" />
                    : <div className="text-center text-gray-600">
                        <div className="text-2xl mb-1">📷</div>
                        <div className="text-xs">Subir imagen</div>
                      </div>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
              </div>

              {/* Nombre */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
                <input className="input" placeholder="Ej: Hoodie Naruto" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>

              {/* Tienda */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tienda *</label>
                <div className="flex gap-2">
                  {['Mandarina', 'Indstore'].map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, tienda: t }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all
                        ${form.tienda === t ? 'text-white border-transparent' : 'border-gray-700 text-gray-500'}`}
                      style={form.tienda === t ? { backgroundColor: t === 'Mandarina' ? '#FF6B00' : '#E91E8C' } : {}}>
                      {t === 'Mandarina' ? '🍊 Mandarina' : '🏪 Indstore'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Talla */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Talla</label>
                <div className="flex gap-2 flex-wrap">
                  {tallasOpciones.map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, talla: t }))}
                      className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all
                        ${form.talla === t ? 'bg-gray-600 border-gray-500 text-white' : 'border-gray-700 text-gray-500'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Color</label>
                <input className="input" placeholder="Ej: Negro, Rojo..." value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
              </div>

              {/* Stock y Precio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Stock *</label>
                  <input className="input" type="number" min="1" placeholder="0" value={form.stock}
                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Precio $</label>
                  <input className="input" type="number" step="0.01" placeholder="0.00" value={form.precio}
                    onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} />
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModalAgregar(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-semibold hover:border-gray-500 transition-all">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={guardando}
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-all disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
