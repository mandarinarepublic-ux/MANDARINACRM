'use client'
import { useState, useId } from 'react'
import { subirFoto, subirArchivo } from '@/lib/subirImagen'
import { imagenAncho } from '@/lib/imagenes'
import { nacePlegado } from '@/lib/itemPlegado'
import { AREAS, TALLAS_ADULTO, TALLAS_NINO, TALLAS, opcionesConValor, valorFueraDeLista, areaSinFotos } from '@/lib/catalogo-pedido'
import InputDinero from '@/components/InputDinero'

// Las listas salen de lib/catalogo-pedido.js, las MISMAS que el buscador: antes
// esta tenía 8 áreas y el buscador 11, y al abrir una prenda con
// `PREMIUM - SIN DISEÑO` el <select> mostraba ESTAMPADO aunque lo guardado
// fuera otra cosa.

export default function ItemProducto({ item, index, onChange, onRemove, onDuplicate }) {
  // Completa → nace plegada (se ve el resumen); si le falta algo, abierta.
  const [expanded, setExpanded] = useState(() => !nacePlegado(item))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState({})
  const [uploadError, setUploadError] = useState('')
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  const cantidad = parseInt(item.cantidad || 0)
  const precio = parseFloat(item.precioUnit !== '' && item.precioUnit !== undefined ? item.precioUnit : -1)
  const subtotal = (Math.max(precio, 0) * Math.max(cantidad, 0)).toFixed(2)
  const cantidadValida = cantidad >= 1
  const precioValido = precio >= 0
  // Avisa (no bloquea) cuando no hay talla. Existe por el botón DUPLICAR: la
  // copia nace sin talla justamente para que se cambie, y sin este aviso es
  // fácil mandar dos prendas iguales sin darse cuenta.
  const faltaTalla = !String(item.talla || '').trim()
  const nombre = item.productoNombre || `Producto ${index + 1}`

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

  // Si la talla guardada no está en la lista (pedido viejo, talla escrita a
  // mano), se agrega como opción para que el <select> no la pinte como otra.
  const tallaFuera = valorFueraDeLista(TALLAS, item.talla)
  const areas = opcionesConValor(AREAS, item.area)

  return (
    <div className={`card overflow-hidden ${(!cantidadValida || !precioValido || faltaTalla) ? 'border-yellow-500/50' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        {item.imagen
          ? <img src={imagenAncho(item.imagen, 120)} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-lg flex-shrink-0" aria-hidden="true">
              {item.esPersonalizado ? '✏️' : '👕'}
            </div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{item.productoNombre}</div>
          <div className="text-xs text-gray-500">{item.talla} · {item.area}</div>
          {cantidadValida && precioValido && !faltaTalla && <div className="text-xs text-mandarina-400 font-medium">${subtotal}</div>}
          {/* La talla NO bloquea el envío (hay prendas que legítimamente no
              llevan), pero una copia recién duplicada nace sin ella y es lo
              único que hay que cambiar: avisarlo evita mandar dos prendas
              iguales sin darse cuenta. */}
          {(!cantidadValida || !precioValido || faltaTalla) && (
            <div className="text-xs text-yellow-400">
              ⚠️ Completa {[
                !cantidadValida && 'cantidad',
                !precioValido && 'precio',
                faltaTalla && 'talla',
              ].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* DUPLICAR: mismo producto, mismo arte, otra talla.
              Un pedido de varias prendas iguales en tallas distintas obligaba a
              recapturar todo —color, área, fotos, diseño— una vez por talla. */}
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} title="Duplicar sin talla ni precio"
                    aria-label={`Duplicar ${nombre} sin talla ni precio`}
                    className="text-[11px] font-semibold text-mandarina-400 border border-mandarina-500/40
                               px-2.5 min-h-[40px] rounded-xl hover:bg-mandarina-500/10 transition-colors whitespace-nowrap">
              <span aria-hidden="true">⧉ </span>DUPLICAR
            </button>
          )}
          <button type="button" onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded} aria-label={expanded ? `Plegar ${nombre}` : `Abrir ${nombre} para editar`}
            className="text-gray-500 hover:text-white p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-sm transition-colors">
            <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 bg-gray-800 rounded-xl px-2 py-1" role="group" aria-label={`¿Eliminar ${nombre}?`}>
              <span className="text-xs text-red-400">¿Eliminar?</span>
              <button type="button" onClick={onRemove} className="text-sm bg-red-500 text-white px-3 min-h-[40px] rounded-lg ml-1">Sí</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm bg-gray-700 text-white px-3 min-h-[40px] rounded-lg">No</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} aria-label={`Eliminar ${nombre}`}
              className="text-gray-600 hover:text-red-400 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-base transition-colors">
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {/* Mismas marcas (*) que el buscador: ahí estos campos son
                obligatorios para agregar la prenda. */}
            <div>
              <label className="label" htmlFor={idCampo('color')}>Color *</label>
              <input id={idCampo('color')} className="input text-sm py-3" placeholder="Ej: Celeste/blanco" value={item.color || ''}
                onChange={e => onChange({...item, color: e.target.value})} />
            </div>
            <div>
              <label className="label" htmlFor={idCampo('talla')}>Talla *</label>
              <select id={idCampo('talla')} className="input text-sm py-3" value={item.talla || ''}
                onChange={e => onChange({...item, talla: e.target.value})}>
                <option value="">— Seleccionar —</option>
                <optgroup label="Adulto">
                  {TALLAS_ADULTO.map(t => <option key={t}>{t}</option>)}
                </optgroup>
                <optgroup label="Niño">
                  {TALLAS_NINO.map(t => <option key={t}>{t}</option>)}
                </optgroup>
                {tallaFuera && <option value={item.talla}>{item.talla}</option>}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={idCampo('cantidad')}>Cantidad *</label>
              <input id={idCampo('cantidad')} type="number" min="1" inputMode="numeric"
                className={`input text-sm py-3 ${!cantidadValida ? 'border-red-500' : ''}`}
                aria-invalid={!cantidadValida || undefined}
                aria-describedby={!cantidadValida ? idCampo('cantidad-err') : undefined}
                placeholder="1" value={item.cantidad !== undefined ? item.cantidad : ''}
                onChange={e => onChange({...item, cantidad: e.target.value})} />
              {!cantidadValida && <p id={idCampo('cantidad-err')} className="text-red-400 text-xs mt-0.5">Mín. 1</p>}
            </div>
            <div>
              <label className="label" htmlFor={idCampo('precio')}>Precio $ *</label>
              <InputDinero id={idCampo('precio')}
                className={`input text-sm py-3 ${!precioValido ? 'border-red-500' : ''}`}
                aria-invalid={!precioValido || undefined}
                aria-describedby={!precioValido ? idCampo('precio-err') : undefined}
                placeholder="0.00" value={item.precioUnit !== undefined ? item.precioUnit : ''}
                onChange={e => onChange({...item, precioUnit: e.target.value})} />
              {!precioValido && <p id={idCampo('precio-err')} className="text-red-400 text-xs mt-0.5">Ingresa precio</p>}
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor={idCampo('area')}>Área *</label>
              <select id={idCampo('area')} className="input text-sm py-3" value={item.area || ''}
                onChange={e => onChange({...item, area: e.target.value})}>
                <option value="">— Seleccionar área —</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="label" htmlFor={idCampo('detalle')}>Detalle *</label>
              <textarea id={idCampo('detalle')} className="input resize-none text-sm" rows={2}
                placeholder="Descripción del diseño…" value={item.detalle || ''}
                onChange={e => onChange({...item, detalle: e.target.value})} />
            </div>
          </div>

          {/* Las prendas sin diseño (y lo que se entrega en tienda) no llevan
              arte: los recuadros de fotos solo estorbaban. Regla en
              lib/catalogo-pedido.js. Las fotos que ya tenga NO se borran. */}
          {!areaSinFotos(item.area) && (
            <div>
              <div className="label" id={idCampo('fotos')}>Fotos del diseño</div>
              <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={idCampo('fotos')}>
                {[['fotoPecho','Pecho'],['fotoEspalda','Espalda'],['fotoMangaD','Manga derecha'],['fotoMangaI','Manga izquierda']].map(([key, label]) => (
                  <div key={key}>
                    {/* El input va DENTRO del label y `sr-only`, no `hidden`: con
                        `hidden` el teclado no podía llegar a subir una foto. El
                        anillo se ve cuando el input tiene el foco. */}
                    <label className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-colors
                      focus-within:ring-2 focus-within:ring-mandarina-500
                      ${item[key] ? 'border-mandarina-500' : 'border-gray-700 hover:border-gray-500'}
                      ${uploading[key] ? 'opacity-60 pointer-events-none' : ''}`}>
                      <input type="file" accept="image/*" className="sr-only"
                        aria-label={`${item[key] ? 'Cambiar' : 'Subir'} foto: ${label}`}
                        onChange={e => handleFoto(key, e.target.files[0])} />
                      {uploading[key] ? (
                        <div className="flex flex-col items-center gap-1" role="status">
                          <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                          <span className="text-[10px] text-gray-500">Subiendo…</span>
                        </div>
                      ) : item[key]
                        ? <img src={imagenAncho(item[key], 240)} alt={`Foto: ${label}`} loading="lazy" className="w-full h-full object-cover" />
                        : <span className="text-xs text-gray-500 text-center px-2">{label}</span>}
                    </label>
                    {item[key] && !uploading[key] && (
                      <button type="button" onClick={() => onChange({...item, [key]: null})}
                        aria-label={`Quitar foto: ${label}`}
                        className="text-xs text-red-400 mt-0.5 w-full text-center py-1.5 min-h-[40px] rounded-lg hover:bg-red-500/10 transition-colors">
                        <span aria-hidden="true">✕ </span>quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <label className={`mt-2 flex items-center gap-2 border border-dashed border-gray-700 rounded-xl p-3 cursor-pointer hover:border-gray-500 transition-colors
                focus-within:ring-2 focus-within:ring-mandarina-500
                ${uploading.archivoDiseno ? 'opacity-60 pointer-events-none' : ''}`}>
                <input type="file" accept=".ai,.psd,.pdf,.jpg,.png,.eps,.svg" className="sr-only"
                  onChange={e => handleFoto('archivoDiseno', e.target.files[0])} />
                <span className="text-gray-500 text-sm">
                  {uploading.archivoDiseno ? 'Subiendo a Cloudinary…' : item.archivoDiseno ? '✓ Archivo — toca para cambiar' : '📎 Subir archivo AI/PSD/PDF'}
                </span>
              </label>
              {uploadError && <div className="text-red-400 text-xs mt-1" role="alert">⚠️ {uploadError}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
