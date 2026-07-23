'use client'
import { useState } from 'react'
import { subirFoto, subirArchivo } from '@/lib/subirImagen'
import { imagenAncho } from '@/lib/imagenes'

const TALLAS = ['4XL','3XL','2XL','XL','L','M','S','XS','12','10','9','8','7','6','5','4','3','2','1 AÑO']
const AREAS = [
  'ESTAMPADO','SUBLIMACION','BORDADO',
  'ESTAMPADO + SUBLIMACION','ESTAMPADO + BORDADO',
  'SUBLIMACION + BORDADO','ESTAMPADO + SUBLIMACION + BORDADO',
  'PRODUCTO SIN DISEÑO',
]

export default function ItemProducto({ item, index, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState({})
  const [uploadError, setUploadError] = useState('')

  const cantidad = parseInt(item.cantidad || 0)
  const precio = parseFloat(item.precioUnit !== '' && item.precioUnit !== undefined ? item.precioUnit : -1)
  const subtotal = (Math.max(precio, 0) * Math.max(cantidad, 0)).toFixed(2)
  const cantidadValida = cantidad >= 1
  const precioValido = precio >= 0

  // Sube a Cloudinary y guarda solo la URL. Las fotos (pecho/espalda/mangas) se
  // reescalan a buena calidad antes de subir para no exceder el límite de tamaño
  // de request de Vercel; el archivo de diseño se sube sin recomprimir.
  async function handleFoto(key, file) {
    if (!file) return
    setUploading(u => ({ ...u, [key]: true })); setUploadError('')
    try {
      const url = key === 'archivoDiseno'
        ? await subirArchivo(file, 'diseno')
        : await subirFoto(file, 'diseno')
      onChange({ ...item, [key]: url })
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(u => ({ ...u, [key]: false }))
    }
  }

  return (
    <div className={`card overflow-hidden ${(!cantidadValida || !precioValido) ? 'border-yellow-500/50' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        {item.imagen
          ? <img src={imagenAncho(item.imagen, 120)} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">
              {item.esPersonalizado ? '✏️' : '👕'}
            </div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{item.productoNombre}</div>
          <div className="text-xs text-gray-500">{item.talla} · {item.area}</div>
          {cantidadValida && precioValido && <div className="text-xs text-mandarina-400 font-medium">${subtotal}</div>}
          {(!cantidadValida || !precioValido) && <div className="text-xs text-yellow-400">⚠️ Completa cantidad y precio</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-white p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-sm">
            {expanded ? '▲' : '▼'}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 bg-gray-800 rounded-xl px-2 py-1">
              <span className="text-xs text-red-400">¿Eliminar?</span>
              <button onClick={onRemove} className="text-sm bg-red-500 text-white px-3 py-1.5 rounded-lg ml-1">Sí</button>
              <button onClick={() => setConfirmDelete(false)} className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded-lg">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-gray-600 hover:text-red-400 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-base transition-colors">✕</button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="label">Color</label>
              <input className="input text-sm py-3" placeholder="Ej: Celeste/blanco" value={item.color || ''}
                onChange={e => onChange({...item, color: e.target.value})} />
            </div>
            <div>
              <label className="label">Talla</label>
              <select className="input text-sm py-3" value={item.talla || ''}
                onChange={e => onChange({...item, talla: e.target.value})}>
                <option value="">-</option>
                {TALLAS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cantidad *</label>
              <input type="number" min="1" inputMode="numeric"
                className={`input text-sm py-3 ${!cantidadValida ? 'border-red-500' : ''}`}
                placeholder="1" value={item.cantidad !== undefined ? item.cantidad : ''}
                onChange={e => onChange({...item, cantidad: e.target.value})} />
              {!cantidadValida && <p className="text-red-400 text-xs mt-0.5">Mín. 1</p>}
            </div>
            <div>
              <label className="label">Precio $ *</label>
              <input type="number" min="0" step="0.5" inputMode="decimal"
                className={`input text-sm py-3 ${!precioValido ? 'border-red-500' : ''}`}
                placeholder="0.00" value={item.precioUnit !== undefined ? item.precioUnit : ''}
                onChange={e => onChange({...item, precioUnit: e.target.value})} />
              {!precioValido && <p className="text-red-400 text-xs mt-0.5">Ingresa precio</p>}
            </div>
            <div className="col-span-2">
              <label className="label">Área</label>
              <select className="input text-sm py-3" value={item.area || ''}
                onChange={e => onChange({...item, area: e.target.value})}>
                {AREAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="label">Detalle</label>
              <textarea className="input resize-none text-sm" rows={2}
                placeholder="Descripción del diseño..." value={item.detalle || ''}
                onChange={e => onChange({...item, detalle: e.target.value})} />
            </div>
          </div>

          {item.area !== 'PRODUCTO SIN DISEÑO' && (
            <div>
              <label className="label">Fotos del diseño</label>
              <div className="grid grid-cols-2 gap-2">
                {[['fotoPecho','Pecho'],['fotoEspalda','Espalda'],['fotoMangaD','Manga derecha'],['fotoMangaI','Manga izquierda']].map(([key, label]) => (
                  <div key={key}>
                    <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-all
                      ${item[key] ? 'border-mandarina-500' : 'border-gray-700 hover:border-gray-500'}
                      ${uploading[key] ? 'opacity-60 pointer-events-none' : ''}`}>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => handleFoto(key, e.target.files[0])} />
                      {uploading[key] ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-[10px] text-gray-500">Subiendo...</span>
                        </div>
                      ) : item[key]
                        ? <img src={imagenAncho(item[key], 240)} className="w-full h-full object-cover" />
                        : <span className="text-xs text-gray-500 text-center px-2">{label}</span>}
                    </label>
                    {item[key] && !uploading[key] && (
                      <button onClick={() => onChange({...item, [key]: null})}
                        className="text-xs text-red-400 mt-0.5 w-full text-center py-1.5 rounded-lg hover:bg-red-500/10 transition-all">✕ quitar</button>
                    )}
                  </div>
                ))}
              </div>
              <label className={`mt-2 flex items-center gap-2 border border-dashed border-gray-700 rounded-xl p-3 cursor-pointer hover:border-gray-500
                ${uploading.archivoDiseno ? 'opacity-60 pointer-events-none' : ''}`}>
                <input type="file" accept=".ai,.psd,.pdf,.jpg,.png,.eps,.svg" className="hidden"
                  onChange={e => handleFoto('archivoDiseno', e.target.files[0])} />
                <span className="text-gray-500 text-sm">
                  {uploading.archivoDiseno ? 'Subiendo a Cloudinary...' : item.archivoDiseno ? '✓ Archivo — click para cambiar' : '📎 Subir archivo AI/PSD/PDF'}
                </span>
              </label>
              {uploadError && <div className="text-red-400 text-xs mt-1">⚠️ {uploadError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
