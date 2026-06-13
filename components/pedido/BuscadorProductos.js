'use client'
import { useState, useEffect, useRef } from 'react'

const TALLAS = ['1 AÑO','2','3','4','5','6','7','8','9','10','12','XS','S','M','L','XL','2XL','3XL','4XL']
const AREAS = [
  'ESTAMPADO',
  'SUBLIMACION',
  'BORDADO',
  'ESTAMPADO + SUBLIMACION',
  'ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO',
  'ESTAMPADO + SUBLIMACION + BORDADO',
]

export default function BuscadorProductos({ tienda, onAdd }) {
  const [query, setQuery] = useState('')
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showPersonalizado, setShowPersonalizado] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setProductos([]); return }
    debounceRef.current = setTimeout(() => buscar(), 400)
  }, [query, tienda])

  async function buscar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/shopify/products?tienda=${tienda}&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setProductos(data.products || [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <input className="input pr-10" placeholder="Buscar producto en Shopify..."
            value={query} onChange={e => setQuery(e.target.value)} />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <button onClick={() => setShowPersonalizado(true)} className="btn-secondary whitespace-nowrap text-sm px-3">
          + Personalizado
        </button>
      </div>

      {productos.length > 0 && !selected && (
        <div className="card divide-y divide-gray-800 max-h-64 overflow-y-auto">
          {productos.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors text-left">
              {p.image
                ? <img src={p.image} alt={p.title} className="w-10 h-10 rounded-lg object-cover bg-gray-800" />
                : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-xs">IMG</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-medium truncate">{p.title}</div>
                <div className="text-xs text-gray-500">{p.variants?.length} variante(s)</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ProductoDetail producto={selected}
          onAdd={(prod, variant, talla, area, detalle, cantidad, color, fotos) => {
            onAdd({
              productoNombre: prod.title,
              shopifyVariantId: variant?.id || '',
              color, talla,
              cantidad: cantidad || 1,
              precioUnit: parseFloat(variant?.price || 0),
              area, detalle,
              esPersonalizado: false,
              imagen: prod.image,
              imagenShopify: prod.image || null, // dedicated field for Shopify CDN URL
              ...fotos,
              // fotoPecho: manual upload wins, else Shopify image URL
              fotoPecho: fotos.fotoPecho || prod.image || null,
            })
            setSelected(null); setQuery(''); setProductos([])
          }}
          onCancel={() => setSelected(null)} />
      )}

      {showPersonalizado && (
        <ProductoPersonalizado
          onAdd={data => { onAdd(data); setShowPersonalizado(false) }}
          onCancel={() => setShowPersonalizado(false)} />
      )}
    </div>
  )
}

function FotoUploader({ fotos, onChange }) {
  function handleFoto(key, file) {
    if (!file) return
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 800
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      onChange({ ...fotos, [key]: canvas.toDataURL('image/jpeg', 0.75) })
    }
    img.src = url
  }

  const slots = [
    ['fotoPecho', 'Pecho'],
    ['fotoEspalda', 'Espalda'],
    ['fotoMangaD', 'Manga derecha'],
    ['fotoMangaI', 'Manga izquierda'],
  ]

  return (
    <div className="space-y-2">
      <label className="label">Fotos del diseño</label>
      <div className="grid grid-cols-2 gap-2">
        {slots.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className={`relative flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden
              ${fotos[key] ? 'border-mandarina-500' : 'border-gray-700 hover:border-gray-500'}`}>
              <input type="file" accept="image/*" className="hidden"
                onChange={e => handleFoto(key, e.target.files[0])} />
              {fotos[key]
                ? <img src={fotos[key]} className="w-full h-full object-cover" />
                : <span className="text-xs text-gray-500 text-center px-2">{label}</span>}
            </label>
            {fotos[key] && (
              <button onClick={() => onChange({ ...fotos, [key]: null })}
                className="text-xs text-red-400 hover:text-red-300 text-center">✕ quitar</button>
            )}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 border border-dashed border-gray-700 rounded-xl p-3 cursor-pointer hover:border-gray-500 transition-all">
        <input type="file" accept=".ai,.psd,.pdf,.jpg,.png" className="hidden"
          onChange={e => {
            const file = e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => onChange({ ...fotos, archivoDiseno: ev.target.result })
            reader.readAsDataURL(file)
          }} />
        <span className="text-gray-500 text-sm">
          {fotos.archivoDiseno ? '✓ Archivo — click para cambiar' : '📎 Subir archivo AI/PSD/PDF'}
        </span>
      </label>
    </div>
  )
}

function ProductoDetail({ producto, onAdd, onCancel }) {
  const [variant, setVariant] = useState(producto.variants[0])
  const [talla, setTalla] = useState('')
  const [area, setArea] = useState('ESTAMPADO')
  const [cantidad, setCantidad] = useState(1)
  const [color, setColor] = useState('')
  const [detalle, setDetalle] = useState('')
  const [fotos, setFotos] = useState({})

  return (
    <div className="card p-4 space-y-3 mt-2">
      <div className="flex items-center gap-3">
        {producto.image && <img src={producto.image} className="w-12 h-12 rounded-xl object-cover" />}
        <div className="flex-1">
          <div className="font-medium text-white text-sm">{producto.title}</div>
          <div className="text-xs text-gray-500">${parseFloat(variant?.price||0).toFixed(2)}</div>
        </div>
        <button onClick={onCancel} className="text-gray-600 hover:text-white p-1">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {producto.variants?.length > 1 && (
          <div className="col-span-2">
            <label className="label">Variante</label>
            <select className="input" value={variant?.id}
              onChange={e => setVariant(producto.variants.find(v => v.id == e.target.value))}>
              {producto.variants.map(v => <option key={v.id} value={v.id}>{v.title} - ${v.price}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Color</label>
          <input className="input" placeholder="Ej: Celeste/blanco" value={color}
            onChange={e => setColor(e.target.value)} />
        </div>
        <div>
          <label className="label">Talla</label>
          <select className="input" value={talla} onChange={e => setTalla(e.target.value)}>
            <option value="">Seleccionar</option>
            {TALLAS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cantidad</label>
          <input type="number" className="input" min="1" value={cantidad}
            onChange={e => setCantidad(parseInt(e.target.value))} />
        </div>
        <div>
          <label className="label">Área</label>
          <select className="input" value={area} onChange={e => setArea(e.target.value)}>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Detalle del diseño</label>
          <textarea className="input resize-none" rows={2} placeholder="Descripción del diseño..."
            value={detalle} onChange={e => setDetalle(e.target.value)} />
        </div>
      </div>
      <FotoUploader fotos={fotos} onChange={setFotos} />
      <button onClick={() => onAdd(producto, variant, talla, area, detalle, cantidad, color, fotos)}
        className="btn-primary w-full">+ Agregar al pedido</button>
    </div>
  )
}

function ProductoPersonalizado({ onAdd, onCancel }) {
  const [catalogoProductos, setCatalogoProductos] = useState([])
  const [nombre, setNombre] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [data, setData] = useState({ color: '', talla: 'M', cantidad: 1, precio: 15, area: 'ESTAMPADO', detalle: '' })
  const [fotos, setFotos] = useState({})
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    fetch('/api/productos').then(r => r.json()).then(d => setCatalogoProductos(d.productos || []))
  }, [])

  async function agregarNuevoProducto() {
    if (!nuevoNombre.trim()) return
    await fetch('/api/productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevoNombre.trim().toUpperCase() }),
    })
    const r = await fetch('/api/productos')
    const d = await r.json()
    setCatalogoProductos(d.productos || [])
    setNombre(nuevoNombre.trim().toUpperCase())
    setNuevoNombre('')
    setAddingNew(false)
  }

  return (
    <div className="card p-4 space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="font-medium text-white text-sm">✏️ Producto personalizado</div>
        <button onClick={onCancel} className="text-gray-600 hover:text-white p-1">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Nombre del producto *</label>
          <div className="flex gap-2">
            <select className="input flex-1" value={nombre} onChange={e => {
              if (e.target.value === '__nuevo__') { setAddingNew(true); return }
              setNombre(e.target.value)
            }}>
              <option value="">Seleccionar...</option>
              {catalogoProductos.map(p => <option key={p.NOMBRE}>{p.NOMBRE}</option>)}
              <option value="__nuevo__">+ Agregar nuevo...</option>
            </select>
          </div>
          {addingNew && (
            <div className="flex gap-2 mt-2">
              <input className="input flex-1" placeholder="Nombre del nuevo producto"
                value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value.toUpperCase())} />
              <button onClick={agregarNuevoProducto} className="btn-primary px-3 text-sm">Agregar</button>
              <button onClick={() => setAddingNew(false)} className="btn-secondary px-3 text-sm">✕</button>
            </div>
          )}
        </div>
        <div>
          <label className="label">Color</label>
          <input className="input" placeholder="Celeste/blanco" value={data.color}
            onChange={e => setData(p => ({...p, color: e.target.value}))} />
        </div>
        <div>
          <label className="label">Talla</label>
          <select className="input" value={data.talla} onChange={e => setData(p => ({...p, talla: e.target.value}))}>
            {TALLAS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cantidad</label>
          <input type="number" className="input" min="1" value={data.cantidad}
            onChange={e => setData(p => ({...p, cantidad: parseInt(e.target.value)}))} />
        </div>
        <div>
          <label className="label">Precio $</label>
          <input type="number" className="input" step="0.50" value={data.precio}
            onChange={e => setData(p => ({...p, precio: e.target.value}))} />
        </div>
        <div className="col-span-2">
          <label className="label">Área</label>
          <select className="input" value={data.area} onChange={e => setData(p => ({...p, area: e.target.value}))}>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Detalle / instrucciones *</label>
          <textarea className="input resize-none" rows={3}
            placeholder="Describe el diseño: corte, manga, estampado, colores..."
            value={data.detalle} onChange={e => setData(p => ({...p, detalle: e.target.value}))} />
        </div>
      </div>
      <FotoUploader fotos={fotos} onChange={setFotos} />
      <button onClick={() => onAdd({ productoNombre: nombre, ...data, ...fotos, esPersonalizado: true, imagen: null })}
        disabled={!nombre || !data.detalle} className="btn-primary w-full">
        + Agregar al pedido
      </button>
    </div>
  )
}
