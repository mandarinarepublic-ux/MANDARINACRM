'use client'
import { useState, useEffect, useRef, useId } from 'react'
import { subirFoto, subirArchivo } from '@/lib/subirImagen'
import SelectorTipoPrenda from '@/components/pedido/SelectorTipoPrenda'
import { imagenAncho } from '@/lib/imagenes'
import { faltantesShopify, faltantesPersonalizado, personalizadoTocado } from '@/lib/productoPendiente'
import { AREAS, TALLAS_ADULTO, TALLAS_NINO } from '@/lib/catalogo-pedido'
import InputDinero from '@/components/InputDinero'

// Áreas y tallas: una sola lista con la prenda ya agregada (ItemProducto), en
// lib/catalogo-pedido.js. Antes cada archivo tenía la suya y no coincidían.

/** Opciones del <select> de talla, agrupadas para no confundir "12" con adulto. */
function OpcionesTalla() {
  return (
    <>
      <option value="">— Seleccionar —</option>
      <optgroup label="Adulto">{TALLAS_ADULTO.map(t => <option key={t}>{t}</option>)}</optgroup>
      <optgroup label="Niño">{TALLAS_NINO.map(t => <option key={t}>{t}</option>)}</optgroup>
    </>
  )
}

/** Opciones del <select> de área; la vacía es "sin elegir todavía". */
function OpcionesArea() {
  return (
    <>
      <option value="">— Seleccionar área —</option>
      {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
    </>
  )
}

// El ítem que se agrega al pedido. Una sola fuente: lo usan el botón
// "+ Agregar al pedido" y el agregado automático al dar "Siguiente".
function armarItemShopify(prod, variant, talla, area, detalle, cantidad, color, fotos, precioEdit) {
  return {
    productoNombre: prod.title,
    shopifyVariantId: variant?.id || '',
    color, talla,
    cantidad: cantidad || 1,
    precioUnit: precioEdit ?? parseFloat(variant?.price || 0),
    area, detalle,
    esPersonalizado: false,
    imagen: prod.image,
    imagenShopify: prod.image || null,
    ...fotos,
    fotoPecho: fotos.fotoPecho || prod.image || null,
  }
}

function armarItemPersonalizado(nombre, data, fotos) {
  return { productoNombre: nombre, ...data, cantidad: parseInt(data.cantidad)||1, precioUnit: parseFloat(data.precio)||0, ...fotos, esPersonalizado: true, imagen: null }
}

// onPendiente(clave, {item, faltan, tocado} | null): cada formulario abierto
// avisa lo que tiene escrito, para que "Siguiente" no lo pierda (ver
// lib/productoPendiente.js).
export default function BuscadorProductos({ tienda, onAdd, soloPersonalizado = false, onPendiente }) {
  const [query, setQuery] = useState('')
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showPersonalizado, setShowPersonalizado] = useState(soloPersonalizado)
  const debounceRef = useRef(null)

  // Si soloPersonalizado, no hay nada más que hacer en este efecto
  useEffect(() => {
    if (soloPersonalizado) return
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
    } finally { setLoading(false) }
  }

  return (
    <div>
      {/* Si soloPersonalizado, ocultar búsqueda y botón de catálogo */}
      {!soloPersonalizado && (
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input className="input pr-10" placeholder="Buscar producto en Shopify…"
              type="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
              aria-label="Buscar producto en Shopify"
              value={query} onChange={e => setQuery(e.target.value)} />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2" role="status">
                <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                <span className="sr-only">Buscando productos…</span>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowPersonalizado(true)} className="btn-secondary whitespace-nowrap text-sm px-3">
            + Personalizado
          </button>
        </div>
      )}

      {productos.length > 0 && !selected && (
        <div className="card divide-y divide-gray-800 max-h-64 overflow-y-auto overscroll-contain">
          {productos.map(p => (
            <button key={p.id} type="button" onClick={() => setSelected(p)}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors text-left">
              {p.image
                ? <img src={imagenAncho(p.image, 120)} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-gray-800" />
                : <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-600 text-xs" aria-hidden="true">IMG</div>}
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
          onAdd={(prod, variant, talla, area, detalle, cantidad, color, fotos, precioEdit) => {
            onAdd(armarItemShopify(prod, variant, talla, area, detalle, cantidad, color, fotos, precioEdit))
            setSelected(null); setQuery(''); setProductos([])
          }}
          onCancel={() => setSelected(null)}
          onPendiente={onPendiente} />
      )}

      {showPersonalizado && (
        <ProductoPersonalizado
          onAdd={data => {
            onAdd(data)
            // Si soloPersonalizado, mantener el form abierto para poder agregar más
            if (!soloPersonalizado) setShowPersonalizado(false)
          }}
          onCancel={() => setShowPersonalizado(false)}
          ocultarCancelar={soloPersonalizado}
          onPendiente={onPendiente}
        />
      )}
    </div>
  )
}

function ArchivoCloudinary({ fotos, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file) {
    if (!file) return
    setUploading(true); setError('')
    try {
      const url = await subirArchivo(file, 'diseno')
      onChange({ ...fotos, archivoDiseno: url })
    } catch(e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {/* `sr-only` y no `hidden`: con `hidden` el teclado no llegaba al input. */}
      <label className={`flex items-center gap-3 border border-dashed rounded-xl p-3 cursor-pointer transition-colors
        focus-within:ring-2 focus-within:ring-mandarina-500
        ${fotos.archivoDiseno ? 'border-mandarina-500 bg-mandarina-500/5' : 'border-gray-700 hover:border-gray-500'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
        <input type="file" accept=".ai,.psd,.pdf,.jpg,.png,.eps,.svg" className="sr-only"
          onChange={e => handleFile(e.target.files[0])} />
        {uploading ? (
          <div className="flex items-center gap-2 w-full">
            <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin flex-shrink-0" aria-hidden="true" />
            <span className="text-gray-400 text-sm" role="status">Subiendo a Cloudinary…</span>
          </div>
        ) : fotos.archivoDiseno ? (
          <div className="flex items-center gap-3 w-full">
            <span className="text-2xl">📎</span>
            <div className="flex-1 min-w-0">
              <div className="text-mandarina-400 text-sm font-medium">✓ Archivo listo en Cloudinary</div>
              <div className="text-xs text-gray-500 truncate">{fotos.archivoDiseno.split('/').pop()}</div>
            </div>
            <a href={fotos.archivoDiseno} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              className="text-xs text-blue-400 hover:underline flex-shrink-0">Ver ↗</a>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-2xl">📎</span>
            <div>
              <div className="text-gray-300 text-sm">Subir archivo de diseño</div>
              <div className="text-xs text-gray-600">AI / PSD / PDF / PNG — sube a Cloudinary al instante</div>
            </div>
          </div>
        )}
      </label>
      {error && <div className="text-red-400 text-xs mt-1" role="alert">⚠️ {error}</div>}
      {fotos.archivoDiseno && (
        <button type="button" onClick={() => onChange({ ...fotos, archivoDiseno: null })}
          className="text-xs text-red-400 mt-1 hover:underline min-h-[40px]"><span aria-hidden="true">✕ </span>Quitar archivo</button>
      )}
    </div>
  )
}

function FotoUploader({ fotos, onChange }) {
  const [uploading, setUploading] = useState({})
  const [error, setError] = useState('')

  // Sube la foto a Cloudinary. Se reescala a buena calidad antes de subir para
  // no exceder el límite de tamaño de request de Vercel. Solo se guarda la URL.
  async function handleFoto(key, file) {
    if (!file) return
    setUploading(u => ({ ...u, [key]: true })); setError('')
    try {
      const url = await subirFoto(file, 'diseno')
      onChange({ ...fotos, [key]: url })
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(u => ({ ...u, [key]: false }))
    }
  }

  const slots = [
    ['fotoPecho', 'Pecho'],
    ['fotoEspalda', 'Espalda'],
    ['fotoMangaD', 'Manga derecha'],
    ['fotoMangaI', 'Manga izquierda'],
  ]

  const idFotos = useId()

  return (
    <div className="space-y-2">
      <div className="label" id={idFotos}>Fotos del diseño</div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={idFotos}>
        {slots.map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            {/* Input `sr-only` dentro del label (no `hidden`) para que el
                teclado pueda llegar; el anillo marca el foco. */}
            <label className={`relative flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed cursor-pointer transition-colors overflow-hidden
              focus-within:ring-2 focus-within:ring-mandarina-500
              ${fotos[key] ? 'border-mandarina-500' : 'border-gray-700 hover:border-gray-500'}
              ${uploading[key] ? 'opacity-60 pointer-events-none' : ''}`}>
              <input type="file" accept="image/*" className="sr-only"
                aria-label={`${fotos[key] ? 'Cambiar' : 'Subir'} foto: ${label}`}
                onChange={e => handleFoto(key, e.target.files[0])} />
              {uploading[key] ? (
                <div className="flex flex-col items-center gap-1" role="status">
                  <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  <span className="text-[10px] text-gray-500">Subiendo…</span>
                </div>
              ) : fotos[key]
                ? <img src={imagenAncho(fotos[key], 240)} alt={`Foto: ${label}`} loading="lazy" className="w-full h-full object-cover" />
                : <span className="text-xs text-gray-500 text-center px-2">{label}</span>}
            </label>
            {fotos[key] && !uploading[key] && (
              <button type="button" onClick={() => onChange({ ...fotos, [key]: null })}
                aria-label={`Quitar foto: ${label}`}
                className="text-xs text-red-400 hover:text-red-300 text-center min-h-[40px] transition-colors"><span aria-hidden="true">✕ </span>quitar</button>
            )}
          </div>
        ))}
      </div>
      {error && <div className="text-red-400 text-xs" role="alert">⚠️ {error}</div>}
      <ArchivoCloudinary fotos={fotos} onChange={onChange} />
    </div>
  )
}

function ProductoDetail({ producto, onAdd, onCancel, onPendiente }) {
  const [variant, setVariant] = useState(producto.variants[0])
  const [talla, setTalla] = useState('')
  const [area, setArea] = useState('')
  const [cantidad, setCantidad] = useState(0)
  const [color, setColor] = useState('')
  const [detalle, setDetalle] = useState('')
  // La foto del producto de Shopify se precarga en el slot de PECHO. Ya se
  // guardaba así al agregar el ítem (ver el onAdd de arriba), pero el recuadro
  // salía vacío y parecía que no había foto. Se puede reemplazar subiendo otra.
  const [fotos, setFotos] = useState(producto.image ? { fotoPecho: producto.image } : {})
  const [precioEdit, setPrecioEdit] = useState(parseFloat(producto.variants[0]?.price || 0))
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  // Elegir un producto de Shopify ya cuenta como "tocado": si queda a medias,
  // Siguiente avisa en vez de perderlo.
  useEffect(() => {
    if (!onPendiente) return
    onPendiente('shopify', {
      item: armarItemShopify(producto, variant, talla, area, detalle, cantidad, color, fotos, precioEdit),
      faltan: faltantesShopify({ color, talla, area, detalle, cantidad, precio: precioEdit }),
      tocado: true,
    })
  }, [producto, variant, talla, area, detalle, cantidad, color, fotos, precioEdit, onPendiente])
  useEffect(() => () => onPendiente?.('shopify', null), [onPendiente])

  function handleVariantChange(variantId) {
    const v = producto.variants.find(v => v.id == variantId)
    setVariant(v)
    setPrecioEdit(parseFloat(v?.price || 0))
  }

  return (
    <div className="card p-4 space-y-3 mt-2">
      <div className="flex items-center gap-3">
        {producto.image && <img src={imagenAncho(producto.image, 120)} alt="" className="w-12 h-12 rounded-xl object-cover" />}
        <div className="flex-1">
          <div className="font-medium text-white text-sm">{producto.title}</div>
          <div className="text-xs text-gray-500">Shopify: ${parseFloat(variant?.price||0).toFixed(2)}</div>
        </div>
        <button type="button" onClick={onCancel} aria-label={`Cerrar ${producto.title}`}
          className="text-gray-600 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {producto.variants?.length > 1 && (
          <div className="col-span-2">
            <label className="label" htmlFor={idCampo('variante')}>Variante</label>
            <select id={idCampo('variante')} className="input" value={variant?.id}
              onChange={e => handleVariantChange(e.target.value)}>
              {producto.variants.map(v => <option key={v.id} value={v.id}>{v.title} - ${v.price}</option>)}
            </select>
          </div>
        )}
        <div>
          {/* Color y talla SON obligatorios (el botón de abajo no agrega sin
              ellos): ahora llevan el * como en el personalizado y la prenda. */}
          <label className="label" htmlFor={idCampo('color')}>Color *</label>
          <input id={idCampo('color')} className="input" placeholder="Ej: Celeste/blanco" value={color}
            onChange={e => setColor(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={idCampo('talla')}>Talla *</label>
          <select id={idCampo('talla')} className="input" value={talla} onChange={e => setTalla(e.target.value)}>
            <OpcionesTalla />
          </select>
        </div>
        <div>
          <label className="label" htmlFor={idCampo('cantidad')}>Cantidad *</label>
          <input id={idCampo('cantidad')} type="number" inputMode="numeric" className="input" min="1" placeholder="0"
            value={cantidad || ''}
            onChange={e => setCantidad(parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="label" htmlFor={idCampo('precio')}>Precio $ *</label>
          <InputDinero id={idCampo('precio')} className="input"
            value={precioEdit}
            onChange={e => setPrecioEdit(parseFloat(e.target.value) || 0)} />
          {precioEdit !== parseFloat(variant?.price || 0) && (
            <div className="text-xs text-yellow-400 mt-0.5 flex items-center gap-2">
              Modificado · original: ${parseFloat(variant?.price||0).toFixed(2)}
              <button type="button" onClick={() => setPrecioEdit(parseFloat(variant?.price||0))}
                className="text-gray-500 hover:text-white underline">restablecer</button>
            </div>
          )}
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor={idCampo('area')}>Área *</label>
          <select id={idCampo('area')} className={`input ${!area ? 'border-yellow-500/50 text-yellow-400' : ''}`}
            value={area} onChange={e => setArea(e.target.value)}>
            <OpcionesArea />
          </select>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor={idCampo('detalle')}>Detalle del diseño *</label>
          <textarea id={idCampo('detalle')} className="input resize-none" rows={2} placeholder="Descripción del diseño…"
            value={detalle} onChange={e => setDetalle(e.target.value)} />
        </div>
      </div>
      <FotoUploader fotos={fotos} onChange={setFotos} />
      {(!color || !talla || !area || !detalle || cantidad < 1 || precioEdit <= 0) && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
          ⚠️ Completa: {[!color && 'Color', !talla && 'Talla', !area && 'Área', cantidad < 1 && 'Cantidad', precioEdit <= 0 && 'Precio', !detalle && 'Detalle'].filter(Boolean).join(', ')}
        </div>
      )}
      <button type="button" onClick={() => {
        if (!color)          { alert('El color es obligatorio'); return }
        if (!talla)          { alert('La talla es obligatoria'); return }
        if (!area)           { alert('Debes seleccionar un área'); return }
        if (cantidad < 1)    { alert('La cantidad debe ser al menos 1'); return }
        if (precioEdit <= 0) { alert('El precio debe ser mayor a 0'); return }
        if (!detalle)        { alert('El detalle es obligatorio'); return }
        onAdd(producto, variant, talla, area, detalle, cantidad, color, fotos, precioEdit)
      }} className="btn-primary w-full">+ Agregar al pedido</button>
    </div>
  )
}

function ProductoPersonalizado({ onAdd, onCancel, ocultarCancelar = false, onPendiente }) {
  const [catalogoProductos, setCatalogoProductos] = useState([])
  const [nombre, setNombre] = useState('')
  // FIX: defaults correctos — cantidad 0, precio 0, área vacía
  const [data, setData] = useState({ color: '', talla: '', cantidad: '', precio: '', area: '', detalle: '' })
  const [fotos, setFotos] = useState({})
  const [creando, setCreando] = useState(false)
  const [errorCatalogo, setErrorCatalogo] = useState('')
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  // Solo ADMIN crea tipos de prenda. El rol de localStorage sirve solo para
  // pintar el botón: la API lo exige con requireAdmin.
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/productos').then(r => r.json()).then(d => setCatalogoProductos(d.productos || []))
    try { setEsAdmin(JSON.parse(localStorage.getItem('mp_user') || '{}')?.rol === 'ADMIN') } catch {}
  }, [])

  /** Crea el tipo de prenda y lo deja seleccionado. Devuelve true si salió bien. */
  async function crearTipoPrenda(nuevo) {
    setCreando(true)
    setErrorCatalogo('')
    try {
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevo }),
      })
      const body = await res.json().catch(() => ({}))
      // Antes no se miraba la respuesta: si fallaba, el producto simplemente no
      // aparecía y no había forma de saber por qué.
      if (!res.ok) { setErrorCatalogo(body.error || `Error ${res.status}`); return false }

      const r = await fetch('/api/productos')
      const d = await r.json()
      setCatalogoProductos(d.productos || [])
      setNombre(body.nombre || nuevo)
      return true
    } catch (e) {
      setErrorCatalogo(e.message || 'Error de conexión')
      return false
    } finally {
      setCreando(false)
    }
  }

  const valido = nombre && data.color && data.talla && data.area && parseInt(data.cantidad||0) >= 1 && parseFloat(data.precio||0) > 0 && data.detalle

  useEffect(() => {
    if (!onPendiente) return
    onPendiente('personalizado', {
      item: armarItemPersonalizado(nombre, data, fotos),
      faltan: faltantesPersonalizado({ nombre, ...data }),
      tocado: personalizadoTocado({ nombre, ...data }, fotos),
    })
  }, [nombre, data, fotos, onPendiente])
  useEffect(() => () => onPendiente?.('personalizado', null), [onPendiente])

  function handleAgregar() {
    if (!valido) return
    onAdd(armarItemPersonalizado(nombre, data, fotos))
    // Reset para poder agregar otro producto sin cerrar el form
    setNombre('')
    setData({ color: '', talla: '', cantidad: '', precio: '', area: '', detalle: '' })
    setFotos({})
  }

  return (
    <div className="card p-4 space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="font-medium text-white text-sm">✏️ Producto personalizado</div>
        {!ocultarCancelar && (
          <button type="button" onClick={onCancel} aria-label="Cerrar producto personalizado"
            className="text-gray-600 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor={idCampo('nombre')}>Nombre del producto *</label>
          <SelectorTipoPrenda
            id={idCampo('nombre')}
            valor={nombre}
            onChange={setNombre}
            productos={catalogoProductos}
            onCrear={crearTipoPrenda}
            creando={creando}
            permitirCrear={esAdmin}
          />
          {errorCatalogo && (
            <p className="text-xs text-red-400 mt-1" role="alert">⚠️ {errorCatalogo}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor={idCampo('color')}>Color *</label>
          <input id={idCampo('color')} className="input" placeholder="Celeste/blanco" value={data.color}
            onChange={e => setData(p => ({...p, color: e.target.value}))} />
        </div>
        <div>
          <label className="label" htmlFor={idCampo('talla')}>Talla *</label>
          <select id={idCampo('talla')} className="input" value={data.talla} onChange={e => setData(p => ({...p, talla: e.target.value}))}>
            <OpcionesTalla />
          </select>
        </div>
        <div>
          <label className="label" htmlFor={idCampo('cantidad')}>Cantidad *</label>
          <input id={idCampo('cantidad')} type="number" inputMode="numeric" className="input" min="1" placeholder="0"
            value={data.cantidad}
            onChange={e => setData(p => ({...p, cantidad: parseInt(e.target.value) || 0}))} />
        </div>
        <div>
          <label className="label" htmlFor={idCampo('precio')}>Precio $ *</label>
          <InputDinero id={idCampo('precio')} className="input" placeholder="0.00"
            value={data.precio}
            onChange={e => setData(p => ({...p, precio: parseFloat(e.target.value) || 0}))} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor={idCampo('area')}>Área *</label>
          <select id={idCampo('area')} className={`input ${!data.area ? 'border-yellow-500/50' : ''}`}
            value={data.area} onChange={e => setData(p => ({...p, area: e.target.value}))}>
            <OpcionesArea />
          </select>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor={idCampo('detalle')}>Detalle / instrucciones *</label>
          <textarea id={idCampo('detalle')} className="input resize-none" rows={3}
            placeholder="Describe el diseño: corte, manga, estampado, colores…"
            value={data.detalle} onChange={e => setData(p => ({...p, detalle: e.target.value}))} />
        </div>
      </div>
      <FotoUploader fotos={fotos} onChange={setFotos} />
      {!valido && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
          ⚠️ Obligatorio: {[
            !nombre && 'Nombre',
            !data.color && 'Color',
            !data.talla && 'Talla',
            !data.area && 'Área',
            data.cantidad < 1 && 'Cantidad',
            data.precio <= 0 && 'Precio',
            !data.detalle && 'Detalle',
          ].filter(Boolean).join(', ')}
        </div>
      )}
      <button
        type="button"
        onClick={handleAgregar}
        disabled={!valido}
        className="btn-primary w-full disabled:opacity-50">
        + Agregar al pedido
      </button>
    </div>
  )
}
