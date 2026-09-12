'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import SoltarFotos from '@/components/producto-nuevo/SoltarFotos'
import RevisionProducto from '@/components/producto-nuevo/RevisionProducto'
import ResultadoPublicacion from '@/components/producto-nuevo/ResultadoPublicacion'

// Pantalla que junta todo: fotos + precio -> IA redacta -> revision -> publicar.
export default function ProductoNuevoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [fotos, setFotos] = useState([])
  const [precio, setPrecio] = useState('')
  const [precioTachado, setPrecioTachado] = useState('')
  const [ficha, setFicha] = useState(null)
  const [res, setRes] = useState(null)
  // ☠️ El id vive APARTE de `res` a proposito. Al volver a corregir se limpia
  // `res` para que reaparezca la pantalla de revision, y si el id viviera solo
  // ahi se perderia: el reintento mandaria `id: undefined` y Shopify CREARIA UN
  // PRODUCTO DUPLICADO en vez de actualizar el que ya existe.
  const [productoId, setProductoId] = useState(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')

  // El guardia de pantalla. El de verdad esta en el servidor (requireAdmin).
  useEffect(() => {
    const guardado = localStorage.getItem('mp_user')
    if (!guardado) { router.push('/'); return }
    const u = JSON.parse(guardado)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
  }, [])

  async function redactar() {
    setCargando('redactando'); setError('')
    try {
      const r = await fetch('/api/productos-shopify/redactar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotos: fotos.map((f) => f.url), precio, tienda }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setFicha({
        ...d,
        fotos: fotos.map((f, i) => ({ ...f, alt: d.altTextos?.[i] || '' })),
        tallas: d.tallasSugeridas || [],
        vendor: d.vendor || (tienda === 'MANDARINA' ? 'Mandarina Republic' : 'Indstore'),
      })
    } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  async function publicar() {
    setCargando('publicando'); setError('')
    try {
      const r = await fetch('/api/productos-shopify/publicar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ficha, tienda, precio, precioTachado,
          // Si ya hubo un intento, se ACTUALIZA ese producto en vez de duplicar.
          id: productoId,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      if (d.productoId) setProductoId(d.productoId)
      setRes(d)
    } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  if (!user) return null

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <h1>Cargar producto a Shopify</h1>

      {!ficha && !res && (
        <>
          <div>
            <strong>Tienda</strong>
            {['MANDARINA', 'INDSTORE'].map((t) => (
              <label key={t} style={{ marginLeft: 12 }}>
                <input type="radio" name="tienda" checked={tienda === t} onChange={() => setTienda(t)} /> {t}
              </label>
            ))}
          </div>
          <SoltarFotos fotos={fotos} onCambio={setFotos} />
          <label>Precio $
            <input type="number" min="0.01" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <label>Precio tachado $ (opcional)
            <input type="number" min="0" step="0.01" value={precioTachado} onChange={(e) => setPrecioTachado(e.target.value)} />
          </label>
          <button type="button" onClick={redactar} disabled={!fotos.length || !(Number(precio) > 0) || !!cargando}>
            {cargando === 'redactando' ? 'Redactando…' : 'Redactar con IA'}
          </button>
        </>
      )}

      {ficha && !res && (
        <>
          <RevisionProducto ficha={ficha} onCambio={setFicha} tienda={tienda} />
          <button type="button" onClick={publicar}
            disabled={!!cargando || !ficha.categoriaId || (ficha.fotos || []).some((f) => !f.alt?.trim())}>
            {cargando === 'publicando' ? 'Publicando…' : 'Publicar en Shopify'}
          </button>
        </>
      )}

      {res && <ResultadoPublicacion res={res}
        onDespublicar={async () => {
          // ☠️ Antes esta respuesta se ignoraba por completo: la pantalla decia
          // «desactivado» aunque el POST hubiera fallado, y el producto seguia
          // ACTIVO y visible en la tienda. Decirle al usuario lo contrario de lo
          // que paso es peor que no tener el boton.
          setCargando('despublicando'); setError('')
          try {
            const r = await fetch('/api/productos-shopify/publicar', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...ficha, tienda, precio, precioTachado,
                id: productoId, soloBorrador: true,
              }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(d.error || 'No se pudo despublicar')
            // `despublicado: true` distingue esto de un fallo de verificación:
            // son cuatro estados, no tres (ver ResultadoPublicacion.js).
            setRes({ ...res, activado: false, urlTienda: null, despublicado: true })
          } catch (e) {
            setError(`${e.message}. ⚠️ El producto puede seguir visible en la tienda.`)
          } finally { setCargando('') }
        }}
        // Vuelve a la pantalla de revision SIN perder el productoId, para que el
        // reintento actualice el producto que ya existe en vez de duplicarlo.
        onCorregir={() => setRes(null)}
        onOtro={() => {
          setFotos([]); setPrecio(''); setPrecioTachado('')
          setFicha(null); setRes(null); setProductoId(null); setError('')
        }} />}

      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </main>
  )
}
