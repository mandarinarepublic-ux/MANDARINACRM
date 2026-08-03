'use client'
// Administrar el arte de la pauta.
//
// El archivado automático puede fallar —y falla: hay anuncios que se suben a
// Cloudinary y cuya marca no queda guardada, por una causa que no se aisló—.
// Antes eso era invisible: el cron reportaba éxito y no había forma de
// arreglarlo sin tocar la base a mano. Esta pantalla es la salida manual.
//
// Tres estados, y la diferencia importa:
//   a salvo  → la imagen está en nuestro almacenamiento. No se puede perder.
//   en Meta  → hoy se ve, pero la URL caduca y el anuncio puede borrarse.
//   sin arte → Meta ya no lo devuelve. Solo se recupera subiéndolo a mano.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ESTADOS = {
  a_salvo: { etiqueta: '✅ A salvo', clase: 'text-green-400', orden: 3 },
  en_meta: { etiqueta: '⚠️ Solo en Meta', clase: 'text-amber-400', orden: 2 },
  sin_arte: { etiqueta: '❌ Sin arte', clase: 'text-red-400', orden: 1 },
}

export default function ArtesPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [anuncios, setAnuncios] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [subiendo, setSubiendo] = useState(null)
  const [filtro, setFiltro] = useState('pendientes')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    cargar(u)
  }, [])

  const headers = (u = user) => ({ 'Content-Type': 'application/json', 'x-mp-usuario-id': u?.id || '' })

  async function cargar(u = user) {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/pauta/arte', { headers: headers(u), cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setAnuncios(d.anuncios || [])
      setResumen(d.resumen || null)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  async function subir(adId, archivo) {
    if (!archivo) return
    // 4 MB: Cloudinary aguanta más, pero el cuerpo del POST viaja en base64 y
    // crece un tercio. Mejor avisar acá que fallar con un 413 sin explicación.
    if (archivo.size > 4 * 1024 * 1024) {
      setError('La imagen pesa más de 4 MB. Redúcela antes de subirla.')
      return
    }
    setSubiendo(adId); setError(''); setAviso('')
    try {
      const base64 = await new Promise((ok, mal) => {
        const r = new FileReader()
        r.onload = () => ok(r.result)
        r.onerror = () => mal(new Error('No se pudo leer el archivo'))
        r.readAsDataURL(archivo)
      })
      const res = await fetch('/api/pauta/arte', {
        method: 'POST', headers: headers(), body: JSON.stringify({ adId, imagen: base64 }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setAviso(`✅ ${adId}: arte guardado (${d.filas} fila(s))`)
      await cargar()
    } catch (e) {
      setError(`${adId}: ${e.message}`)
    } finally { setSubiendo(null) }
  }

  /**
   * Guardar de Meta: el servidor baja la imagen y la sube a Cloudinary.
   *
   * No hay razón para que una persona baje y vuelva a subir una imagen que HOY
   * SE VE. Existe porque el archivado del cron entra en un bucle que no se logró
   * aislar; esto lo hace de una y se acabó.
   *
   * De a uno y en serie: son pocas y así, si alguna falla, se sabe cuál.
   */
  async function guardarDeMeta(lista) {
    setSubiendo('TODAS'); setError(''); setAviso('')
    let ok = 0
    const fallos = []
    for (const a of lista) {
      try {
        const res = await fetch('/api/pauta/arte', {
          method: 'POST', headers: headers(), body: JSON.stringify({ adId: a.adId, desdeMeta: true }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
        ok++
      } catch (e) {
        fallos.push(`${a.nombre || a.adId}: ${e.message}`)
      }
    }
    setSubiendo(null)
    if (ok) setAviso(`✅ ${ok} arte(s) guardado(s) en Cloudinary`)
    // Los fallos se enumeran: "algunas fallaron" sin decir cuáles obliga a
    // adivinar, y estas justamente son las que hay que subir a mano.
    if (fallos.length) setError(`No se pudieron bajar ${fallos.length}: ${fallos.join(' · ')}`)
    await cargar()
  }

  if (!user) return null

  const visibles = anuncios
    .filter((a) => filtro === 'todos' || a.estado !== 'a_salvo')
    .sort((x, y) => ESTADOS[x.estado].orden - ESTADOS[y.estado].orden || y.gasto - x.gasto)

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">🖼️ Artes de la pauta</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Para cuando el guardado automático falla. Lo que está “a salvo” ya no
          depende de Meta.
        </p>
      </div>

      {resumen && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Caja n={resumen.aSalvo}  t="A salvo"       c="text-green-400" />
          <Caja n={resumen.enMeta}  t="Solo en Meta"  c="text-amber-400" />
          <Caja n={resumen.sinArte} t="Sin arte"      c="text-red-400" />
        </div>
      )}

      <div className="flex gap-2 mb-3 items-center">
        <select className="input py-2 text-sm w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="pendientes">Solo los que necesitan atención</option>
          <option value="todos">Todos</option>
        </select>
        <button onClick={() => cargar()} disabled={loading}
                className="px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-300 disabled:opacity-60">
          {loading ? '⏳' : 'Actualizar'}
        </button>

        {/* Lo importante de la pantalla: guardar de una todas las que todavía
            dependen de Meta. Se pueden bajar porque hoy se ven. */}
        {resumen?.enMeta > 0 && (
          <button onClick={() => guardarDeMeta(anuncios.filter((a) => a.estado === 'en_meta'))}
                  disabled={subiendo === 'TODAS'}
                  className="px-3 py-2 rounded-xl bg-amber-500/90 text-black text-sm font-semibold disabled:opacity-60">
            {subiendo === 'TODAS' ? '⏳ guardando…' : `💾 Guardar las ${resumen.enMeta} de Meta`}
          </button>
        )}
      </div>

      {aviso && <Banda tipo="ok" texto={aviso} />}
      {error && <Banda tipo="mal" texto={error} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !visibles.length ? (
        <div className="card p-8 text-center text-gray-600">
          <div className="text-3xl mb-2">✅</div>
          Todo el arte está a salvo.
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((a) => {
            const e = ESTADOS[a.estado]
            return (
              <div key={a.adId} className="card p-3 flex items-start gap-3">
                {a.arteUrl
                  ? <img src={a.arteUrl} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-800 flex-shrink-0" />
                  : <div className="w-16 h-16 rounded-lg bg-gray-800/60 flex items-center justify-center text-2xl flex-shrink-0">🚫</div>}

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{a.nombre || `Anuncio ${a.adId}`}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{a.adId}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {a.tienda} · ${a.gasto.toFixed(2)} de gasto
                  </div>
                  <div className={`text-[10px] mt-1 ${e.clase}`}>{e.etiqueta}</div>
                </div>

                <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                  {/* Si todavía se ve en Meta, no hay por qué subirla a mano. */}
                  {a.estado === 'en_meta' && (
                    <button onClick={() => guardarDeMeta([a])} disabled={Boolean(subiendo)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/90 text-black font-semibold disabled:opacity-60">
                      💾 Guardar
                    </button>
                  )}
                  <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer
                                     ${subiendo === a.adId
                                       ? 'border-gray-700 text-gray-600'
                                       : 'border-mandarina-500 text-mandarina-400 hover:bg-mandarina-500/10'}`}>
                    {subiendo === a.adId ? '⏳ subiendo' : a.arteUrl ? 'Reemplazar' : 'Subir arte'}
                    <input type="file" accept="image/*" className="hidden"
                           disabled={Boolean(subiendo)}
                           onChange={(ev) => subir(a.adId, ev.target.files?.[0])} />
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-600 mt-4 leading-tight">
        “Solo en Meta” significa que la imagen se ve hoy pero vive en el CDN de
        Meta: si el anuncio se borra o la URL caduca, se pierde. El cron intenta
        guardarlas solo; esta pantalla es para las que no puede.
      </p>
    </div>
  )
}

const Caja = ({ n, t, c }) => (
  <div className="card p-3 text-center">
    <div className={`text-lg font-bold ${c}`}>{n}</div>
    <div className="text-[10px] text-gray-500">{t}</div>
  </div>
)

const Banda = ({ tipo, texto }) => (
  <div className={`mb-3 rounded-xl px-4 py-2.5 border ${tipo === 'ok'
    ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
    <span className={`text-sm ${tipo === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
      {tipo === 'ok' ? texto : `⚠️ ${texto}`}
    </span>
  </div>
)
