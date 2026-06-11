'use client'
import { useState } from 'react'

export default function ItemProducto({ item, index, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(true)

  const subtotal = (parseFloat(item.precioUnit || 0) * parseInt(item.cantidad || 1)).toFixed(2)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {item.imagen ? (
          <img src={item.imagen} className="w-10 h-10 rounded-lg object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg">
            {item.esPersonalizado ? '✏️' : '👕'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{item.productoNombre}</div>
          <div className="text-xs text-gray-500">{item.talla} · {item.area} · ${subtotal}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-white p-1 text-xs">
            {expanded ? '▲' : '▼'}
          </button>
          <button onClick={onRemove} className="text-gray-600 hover:text-red-400 p-1 text-sm transition-colors">✕</button>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-gray-800">
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div>
              <label className="label">Color</label>
              <input className="input text-sm py-2" placeholder="Color..." value={item.color}
                onChange={e => onChange({...item, color: e.target.value})} />
            </div>
            <div>
              <label className="label">Talla</label>
              <select className="input text-sm py-2" value={item.talla}
                onChange={e => onChange({...item, talla: e.target.value})}>
                {['XS','S','M','L','XL','XXL','ÚNICA'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cantidad</label>
              <input type="number" className="input text-sm py-2" min="1" value={item.cantidad}
                onChange={e => onChange({...item, cantidad: parseInt(e.target.value)})} />
            </div>
            <div>
              <label className="label">Precio $</label>
              <input type="number" className="input text-sm py-2" step="0.5" value={item.precioUnit}
                onChange={e => onChange({...item, precioUnit: parseFloat(e.target.value)})} />
            </div>
            <div className="col-span-2">
              <label className="label">Área</label>
              <select className="input text-sm py-2" value={item.area}
                onChange={e => onChange({...item, area: e.target.value})}>
                {['ESTAMPADO','SUBLIMACION','BORDADO'].map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {item.detalle && (
            <div>
              <label className="label">Detalle</label>
              <textarea className="input resize-none text-sm" rows={2} value={item.detalle}
                onChange={e => onChange({...item, detalle: e.target.value})} />
            </div>
          )}

          {/* Fotos uploaded */}
          {(item.fotoPecho || item.fotoEspalda || item.fotoMangaD || item.fotoMangaI) && (
            <div>
              <label className="label">Fotos cargadas</label>
              <div className="flex gap-2">
                {[['fotoPecho','P'],['fotoEspalda','E'],['fotoMangaD','MD'],['fotoMangaI','MI']].map(([key,label]) =>
                  item[key] ? (
                    <div key={key} className="relative">
                      <img src={item[key]} className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-center text-xs py-0.5 rounded-b-lg">{label}</div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
