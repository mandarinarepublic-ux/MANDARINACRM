'use client'
import { useState } from 'react'
import { TALLAS } from '@/lib/cotizacion'

const Contador = ({ texto, tope }) => (
  <span className={`text-[11px] ${(texto || '').length > tope ? 'text-red-400' : 'text-gray-500'}`}>
    {(texto || '').length}/{tope}
  </span>
)

// Revision antes de publicar. Como el producto sale ACTIVO, esta pantalla es la
// unica red: todo tiene que poder corregirse aqui.
export default function RevisionProducto({ ficha, onCambio, tienda }) {
  const [buscando, setBuscando] = useState(false)
  const [candidatas, setCandidatas] = useState([])
  const [termino, setTermino] = useState(ficha.categoriaBusqueda || '')
  // ☠️ Sin esto, el aviso de "sin resultados" se ve AL ABRIR la pantalla: el
  // termino viene precargado por la IA y `candidatas` arranca vacia. Un aviso
  // que grita cuando no ha pasado nada es un aviso que se aprende a ignorar —
  // y este es justo el que evita publicar sin categoria.
  const [buscado, setBuscado] = useState(false)
  const [nuevoTag, setNuevoTag] = useState('')
  const [errorCat, setErrorCat] = useState('')

  const set = (campo, valor) => onCambio({ ...ficha, [campo]: valor })

  // El dominio depende de la tienda: mostrar siempre el de Mandarina engaña al
  // revisar un producto de INDSTORE, y esta vista previa existe justo para que
  // se vea como lo vera el cliente.
  // Confirmados el 12-sep-2026 leyendo cada tienda en su propio admin de Shopify,
  // no de memoria: Mandarina Republic → mandarinaec.com, Ind Store → indlovers.com.
  const dominio = tienda === 'INDSTORE' ? 'indlovers.com' : 'mandarinaec.com'
  const rutaProducto = `products/${ficha.handle || '…'}`

  async function buscarCategoria() {
    setBuscando(true); setErrorCat('')
    try {
      const r = await fetch(`/api/productos-shopify/categorias?q=${encodeURIComponent(termino)}&tienda=${tienda}`)
      const d = await r.json().catch(() => ({}))
      // ☠️ Sin esto, un 500 o un 403 se le presentaba al usuario como «sin
      // resultados, busca en español» — mandandolo a arreglar lo que no era.
      if (!r.ok) throw new Error(d.error || `El servidor respondió ${r.status}`)
      setCandidatas(d.categorias || [])
      setBuscado(true)
    } catch (e) {
      setErrorCat(`No se pudo buscar la categoría: ${e.message}`)
      setCandidatas([])
      setBuscado(false)   // no es «sin resultados», es que la busqueda fallo
    } finally { setBuscando(false) }
  }

  const alternarTalla = (t) => set('tallas',
    ficha.tallas?.includes(t) ? ficha.tallas.filter((x) => x !== t) : [...(ficha.tallas || []), t])

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div>
          <div className="label">Título</div>
          <input className="input" value={ficha.titulo || ''} onChange={(e) => set('titulo', e.target.value)} />
        </div>

        <div>
          <div className="label">URL del producto</div>
          <input className="input font-mono text-sm" value={ficha.handle || ''} onChange={(e) => set('handle', e.target.value)} />
          <p className="text-[11px] text-gray-500 mt-1">{dominio}/{rutaProducto}</p>
        </div>

        <div>
          <div className="label">Descripción</div>
          <textarea className="input min-h-[160px]" rows={8} value={ficha.descripcionHtml || ''}
            onChange={(e) => set('descripcionHtml', e.target.value)} />
        </div>

        <div>
          <div className="label flex items-center justify-between mb-1.5">
            <span>Título SEO</span><Contador texto={ficha.seoTitulo} tope={60} />
          </div>
          <input className="input" value={ficha.seoTitulo || ''} onChange={(e) => set('seoTitulo', e.target.value)} />
        </div>

        <div>
          <div className="label flex items-center justify-between mb-1.5">
            <span>Descripción SEO</span><Contador texto={ficha.seoDescripcion} tope={155} />
          </div>
          <textarea className="input min-h-[60px]" rows={2} value={ficha.seoDescripcion || ''}
            onChange={(e) => set('seoDescripcion', e.target.value)} />
        </div>

        {/* Vista previa de Google: se juzga el SEO de un vistazo, no campo por
            campo. Fondo blanco A PROPOSITO: no es chrome del CRM, es una
            maqueta de cómo se ve afuera, en Google, con sus propios colores. */}
        <div className="bg-white rounded-xl p-3 text-sm">
          <div style={{ color: '#1a0dab', fontSize: 18 }}>{ficha.seoTitulo || ficha.titulo}</div>
          <div style={{ color: '#006621', fontSize: 13 }}>{dominio} › products › {ficha.handle}</div>
          <div style={{ color: '#545454', fontSize: 13 }}>{ficha.seoDescripcion}</div>
        </div>
      </div>

      {/* ☠️ Estos tres se mandan a Shopify tal cual: si no se pueden corregir
          aqui, quedan mal en la tienda y toca entrar a Shopify a mano. El
          `tipoProducto` ademas alimenta el feed de anuncios. */}
      <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="label">Tipo de producto</div>
          <input className="input" value={ficha.tipoProducto || ''} onChange={(e) => set('tipoProducto', e.target.value)} />
        </div>
        <div>
          <div className="label">Marca (vendor)</div>
          <input className="input" value={ficha.vendor || ''} onChange={(e) => set('vendor', e.target.value)} />
        </div>
      </div>

      <div className="card p-5">
        <div className="label">Tags</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {(ficha.tags || []).map((t) => (
            <span key={t} className="badge bg-gray-800 text-gray-300">
              {t}
              <button type="button" aria-label={`Quitar ${t}`}
                onClick={() => set('tags', (ficha.tags || []).filter((x) => x !== t))}
                className="ml-1.5 text-gray-500 hover:text-red-400">✕</button>
            </span>
          ))}
        </div>
        <input
          className="input"
          value={nuevoTag}
          placeholder="Agregar tag y Enter"
          onChange={(e) => setNuevoTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const t = nuevoTag.trim().toLowerCase()
            // Sin repetidos: Shopify los aceptaria pero ensucian el filtrado.
            if (t && !(ficha.tags || []).includes(t)) set('tags', [...(ficha.tags || []), t])
            setNuevoTag('')
          }}
        />
      </div>

      <div className="card p-5">
        <div className="label mb-2">Categoría</div>
        {ficha.categoriaRuta
          ? <p className="text-green-400 text-sm mb-2">✓ {ficha.categoriaRuta}</p>
          : <p className="text-red-400 text-sm mb-2">⚠️ Sin categoría. Sin ella el producto no sirve para los anuncios.</p>}
        <div className="flex gap-2">
          <input className="input" value={termino} onChange={(e) => setTermino(e.target.value)}
            placeholder="Buscar en español (ej: Chaquetas)" />
          <button type="button" onClick={buscarCategoria} disabled={buscando} className="btn-secondary whitespace-nowrap">
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {errorCat && <p className="text-red-400 text-xs mt-2">{errorCat}</p>}
        {buscado && !buscando && candidatas.length === 0 && (
          <p className="text-gray-500 text-xs mt-2">
            Sin resultados. ⚠️ La taxonomía de Shopify está en español: prueba con &quot;Chaquetas&quot; en vez de &quot;jacket&quot;.
          </p>
        )}
        {!!candidatas.length && (
          <ul className="mt-2 space-y-1">
            {candidatas.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onCambio({ ...ficha, categoriaId: c.id, categoriaRuta: c.ruta })}
                  className="btn-ghost text-sm text-left w-full">
                  {c.ruta}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <div className="label mb-2">Tallas</div>
        <div className="flex gap-2 flex-wrap">
          {TALLAS.map((t) => {
            const activa = ficha.tallas?.includes(t) || false
            return (
              <label key={t}
                className={`badge cursor-pointer select-none ${activa ? 'bg-mandarina-500/20 text-mandarina-400 border border-mandarina-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                <input type="checkbox" checked={activa} onChange={() => alternarTalla(t)} className="hidden" />
                {t}
              </label>
            )
          })}
        </div>
        {!ficha.tallas?.length && <p className="text-gray-500 text-xs mt-2">Sin tallas marcadas se publica como talla Única.</p>}
      </div>

      <div className="card p-5">
        <div className="label mb-2">Texto alternativo de cada foto</div>
        <div className="space-y-2">
          {(ficha.fotos || []).map((f, i) => (
            <div key={f.url} className="flex gap-3 items-center">
              <img src={f.url} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <input className="input flex-1" value={f.alt || ''} placeholder="Describe la foto"
                onChange={(e) => {
                  const copia = [...ficha.fotos]
                  copia[i] = { ...copia[i], alt: e.target.value }
                  onCambio({ ...ficha, fotos: copia })
                }} />
            </div>
          ))}
        </div>
      </div>

      <details className="card p-5">
        <summary className="text-sm font-semibold text-white cursor-pointer">Textos de anuncio</summary>
        <div className="mt-3 space-y-3">
          {Object.entries(ficha.anuncios || {}).map(([clave, valor]) => (
            <div key={clave}>
              <div className="text-[11px] text-gray-500 mb-1">{clave}</div>
              <div className="flex gap-2 items-start">
                <code className="input flex-1 text-xs text-gray-300 whitespace-pre-wrap">
                  {Array.isArray(valor) ? valor.join(' · ') : valor}
                </code>
                <button type="button" onClick={() => navigator.clipboard.writeText(
                  Array.isArray(valor) ? valor.join('\n') : String(valor))}
                  className="btn-ghost text-xs whitespace-nowrap">Copiar</button>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
