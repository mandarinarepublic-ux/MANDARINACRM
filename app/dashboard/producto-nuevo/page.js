'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TALLAS } from '@/lib/cotizacion'
import { fichaEnBlanco, MARCA_POR_TIENDA } from '@/lib/shopifyProducto'
import SoltarFotos from '@/components/producto-nuevo/SoltarFotos'
import RevisionProducto from '@/components/producto-nuevo/RevisionProducto'
import ResultadoPublicacion from '@/components/producto-nuevo/ResultadoPublicacion'

// Color del número de paso: mismo patrón que components/cotizaciones/CotizacionForm.js
// (líneas 216-235). Se queda con estilo en línea porque el sistema de diseño no
// tiene una utilidad de Tailwind para este degradado puntual naranja/gris.
const step = (ok) => ok
  ? { background: 'rgba(255,107,0,.15)', border: '1px solid rgba(255,107,0,.4)', color: '#fb923c' }
  : { background: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }

function StepHead({ n, ok, title, sub }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-display text-xs font-bold transition-all" style={step(ok)}>{ok ? '✓' : n}</div>
      <div>
        <div className="text-[13px] font-semibold text-white">{title}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  )
}

function Section({ n, ok, title, sub, children }) {
  return (
    <div className="mb-6">
      <div className="mb-3.5"><StepHead n={n} ok={ok} title={title} sub={sub} /></div>
      {children}
    </div>
  )
}

// Pantalla que junta todo: fotos + precio -> IA redacta -> revision -> publicar.
export default function ProductoNuevoPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [tienda, setTienda] = useState('MANDARINA')
  const [fotos, setFotos] = useState([])
  const [precio, setPrecio] = useState('')
  const [precioTachado, setPrecioTachado] = useState('')
  const [ficha, setFicha] = useState(null)
  // Solo cambia los textos de la pantalla: en manual no hay nada «que corrigio
  // la IA», y decirlo seria mentirle al que la esta llenando.
  const [modo, setModo] = useState('ia')
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
        // ☠️ Las tallas NO salen de `tallasSugeridas`. La marca las tiene todas
        // siempre, y cuando la IA se quedaba corta el producto salia a la venta
        // sin variantes que si hay en bodega. Se marcan todas y se destilda lo
        // que no aplique (una gorra, un llavero).
        tallas: [...TALLAS],
        vendor: d.vendor || MARCA_POR_TIENDA[tienda] || MARCA_POR_TIENDA.MANDARINA,
      })
      setModo('ia')
    } catch (e) { setError(e.message) } finally { setCargando('') }
  }

  // El camino sin IA: se arma la ficha aqui mismo y se salta la redaccion. No
  // toca ninguna API, asi que sirve tambien cuando la cuenta de Anthropic no
  // tiene saldo.
  function llenarAMano() {
    setError('')
    setFicha(fichaEnBlanco({ fotos, tienda }))
    setModo('manual')
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

  // La misma condicion para los dos caminos: sin foto no hay producto y sin
  // precio Shopify lo publicaria en 0.00.
  const listo = !!fotos.length && Number(precio) > 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 pb-24">
      <h1 className="text-xl font-display font-bold text-white mb-5">🛍️ Cargar producto a Shopify</h1>

      {!ficha && !res && (
        <Section n="01" ok={listo}
          title="Fotos y precio" sub="Arrastra las fotos del producto y dinos cuánto cuesta">
          <div className="card p-5 space-y-5">
            <div>
              <div className="label">Tienda</div>
              <div className="inline-flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                {['MANDARINA', 'INDSTORE'].map((t) => (
                  <button key={t} type="button" onClick={() => setTienda(t)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${tienda === t ? 'bg-mandarina-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {t === 'MANDARINA' ? '🍊 Mandarina' : '🏪 Indstore'}
                  </button>
                ))}
              </div>
            </div>

            <SoltarFotos fotos={fotos} onCambio={setFotos} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="label">Precio $</div>
                <input className="input" type="number" min="0.01" step="0.01" value={precio}
                  onChange={(e) => setPrecio(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <div className="label">Precio tachado $ (opcional)</div>
                <input className="input" type="number" min="0" step="0.01" value={precioTachado}
                  onChange={(e) => setPrecioTachado(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={redactar} disabled={!listo || !!cargando}
                className="btn-primary">
                {cargando === 'redactando' ? 'Redactando…' : '✨ Redactar con IA'}
              </button>
              <button type="button" onClick={llenarAMano} disabled={!listo || !!cargando}
                className="btn-secondary">
                ✍️ Llenar a mano
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Con IA se redacta todo desde las fotos. A mano escribes tú la ficha, con las tallas ya marcadas.
            </p>
          </div>
        </Section>
      )}

      {ficha && !res && (
        <Section n="02" ok
          title={modo === 'manual' ? 'Llenar la ficha' : 'Revisar'}
          sub={modo === 'manual'
            ? 'Escribe los datos del producto. Hace falta la categoría y el texto de cada foto'
            : 'Corrige lo que escribió la IA antes de publicar'}>
          <RevisionProducto ficha={ficha} onCambio={setFicha} tienda={tienda} />
          <button type="button" onClick={publicar}
            disabled={!!cargando || !ficha.categoriaId || (ficha.fotos || []).some((f) => !f.alt?.trim())}
            className="btn-primary w-full sm:w-auto mt-5">
            {cargando === 'publicando' ? 'Publicando…' : 'Publicar en Shopify'}
          </button>
        </Section>
      )}

      {res && (
        <Section n="03" ok title="Publicar" sub="Dónde quedó y qué se verificó">
          <ResultadoPublicacion res={res}
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
              setFicha(null); setRes(null); setProductoId(null); setError(''); setModo('ia')
            }} />
        </Section>
      )}

      {error && <p className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</p>}
    </div>
  )
}
