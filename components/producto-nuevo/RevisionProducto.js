'use client'
import { useState } from 'react'
import { TALLAS } from '@/lib/cotizacion'

const Contador = ({ texto, tope }) => (
  <small style={{ color: (texto || '').length > tope ? '#c00' : '#888' }}>
    {(texto || '').length}/{tope}
  </small>
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

  const set = (campo, valor) => onCambio({ ...ficha, [campo]: valor })

  async function buscarCategoria() {
    setBuscando(true)
    try {
      const r = await fetch(`/api/productos-shopify/categorias?q=${encodeURIComponent(termino)}&tienda=${tienda}`)
      const { categorias } = await r.json()
      setCandidatas(categorias || [])
      setBuscado(true)
    } finally { setBuscando(false) }
  }

  const alternarTalla = (t) => set('tallas',
    ficha.tallas?.includes(t) ? ficha.tallas.filter((x) => x !== t) : [...(ficha.tallas || []), t])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <label>Título
        <input value={ficha.titulo || ''} onChange={(e) => set('titulo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>URL del producto
        <input value={ficha.handle || ''} onChange={(e) => set('handle', e.target.value)} style={{ width: '100%' }} />
        <small>mandarinaec.com/products/{ficha.handle || '…'}</small>
      </label>

      <label>Descripción
        <textarea rows={8} value={ficha.descripcionHtml || ''}
          onChange={(e) => set('descripcionHtml', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>Título SEO <Contador texto={ficha.seoTitulo} tope={60} />
        <input value={ficha.seoTitulo || ''} onChange={(e) => set('seoTitulo', e.target.value)} style={{ width: '100%' }} />
      </label>

      <label>Descripción SEO <Contador texto={ficha.seoDescripcion} tope={155} />
        <textarea rows={2} value={ficha.seoDescripcion || ''}
          onChange={(e) => set('seoDescripcion', e.target.value)} style={{ width: '100%' }} />
      </label>

      {/* Vista previa de Google: se juzga el SEO de un vistazo, no campo por campo */}
      <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
        <div style={{ color: '#1a0dab', fontSize: 18 }}>{ficha.seoTitulo || ficha.titulo}</div>
        <div style={{ color: '#006621', fontSize: 13 }}>mandarinaec.com › products › {ficha.handle}</div>
        <div style={{ color: '#545454', fontSize: 13 }}>{ficha.seoDescripcion}</div>
      </div>

      {/* ☠️ Estos tres se mandan a Shopify tal cual: si no se pueden corregir
          aqui, quedan mal en la tienda y toca entrar a Shopify a mano. El
          `tipoProducto` ademas alimenta el feed de anuncios. */}
      <label>Tipo de producto
        <input value={ficha.tipoProducto || ''} onChange={(e) => set('tipoProducto', e.target.value)} />
      </label>

      <label>Marca (vendor)
        <input value={ficha.vendor || ''} onChange={(e) => set('vendor', e.target.value)} />
      </label>

      <div>
        <strong>Tags</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
          {(ficha.tags || []).map((t) => (
            <span key={t} style={{ background: '#eee', borderRadius: 12, padding: '2px 10px' }}>
              {t}{' '}
              <button type="button" aria-label={`Quitar ${t}`}
                onClick={() => set('tags', ficha.tags.filter((x) => x !== t))}>✕</button>
            </span>
          ))}
        </div>
        <input
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

      <div>
        <strong>Categoría</strong>
        {ficha.categoriaRuta
          ? <p style={{ color: '#060' }}>✓ {ficha.categoriaRuta}</p>
          : <p style={{ color: '#c00' }}>⚠️ Sin categoría. Sin ella el producto no sirve para los anuncios.</p>}
        <input value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Buscar en español (ej: Chaquetas)" />
        <button type="button" onClick={buscarCategoria} disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
        {buscado && !buscando && candidatas.length === 0 && (
          <p><small>Sin resultados. ⚠️ La taxonomía de Shopify está en español: prueba con &quot;Chaquetas&quot; en vez de &quot;jacket&quot;.</small></p>
        )}
        <ul>
          {candidatas.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onCambio({ ...ficha, categoriaId: c.id, categoriaRuta: c.ruta })}>
                {c.ruta}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <strong>Tallas</strong>
        {TALLAS.map((t) => (
          <label key={t} style={{ marginRight: 12 }}>
            <input type="checkbox" checked={ficha.tallas?.includes(t) || false} onChange={() => alternarTalla(t)} /> {t}
          </label>
        ))}
        {!ficha.tallas?.length && <p><small>Sin tallas marcadas se publica como talla Única.</small></p>}
      </div>

      <div>
        <strong>Texto alternativo de cada foto</strong>
        {(ficha.fotos || []).map((f, i) => (
          <div key={f.url} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <img src={f.url} alt="" width={48} />
            <input style={{ flex: 1 }} value={f.alt || ''} placeholder="Describe la foto"
              onChange={(e) => {
                const copia = [...ficha.fotos]
                copia[i] = { ...copia[i], alt: e.target.value }
                onCambio({ ...ficha, fotos: copia })
              }} />
          </div>
        ))}
      </div>

      <details>
        <summary>Textos de anuncio</summary>
        {Object.entries(ficha.anuncios || {}).map(([clave, valor]) => (
          <div key={clave} style={{ marginTop: 8 }}>
            <small>{clave}</small>
            <div style={{ display: 'flex', gap: 8 }}>
              <code style={{ flex: 1 }}>{Array.isArray(valor) ? valor.join(' · ') : valor}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(
                Array.isArray(valor) ? valor.join('\n') : String(valor))}>Copiar</button>
            </div>
          </div>
        ))}
      </details>
    </div>
  )
}
