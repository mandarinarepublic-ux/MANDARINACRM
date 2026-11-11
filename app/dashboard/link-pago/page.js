'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * LINK DE PAGO (Payphone) — pedido de Rodrigo, 10-nov-2026.
 *
 * Súper sencillo: celular + valor → "Crear link" → botón verde "Enviar por
 * WhatsApp", que abre el WhatsApp del CELULAR DEL VENDEDOR con el chat del
 * cliente y el mensaje listo. Lo manda él, desde su número. Debajo, su
 * histórico con el estado de cada link (pagado / pendiente / rechazado), que
 * se le pregunta a Payphone cada vez que se abre esta pantalla.
 */

const NOMBRE_TIENDA = { MANDARINA: 'Mandarina', INDSTORE: 'IND STORE' }

const ESTADO = {
  PAGADO:    { txt: '✅ Pagado',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PENDIENTE: { txt: '⏳ Pendiente', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  RECHAZADO: { txt: '❌ Rechazado', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

// Fecha corta en hora de Ecuador (Supabase devuelve UTC).
function fmtFecha(iso) {
  try {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return '' }
}

// 593987654321 → 098 765 4321, como lo escribe la gente.
function fmtCelular(c) {
  const d = String(c || '')
  if (/^5939\d{8}$/.test(d)) { const l = '0' + d.slice(3); return `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` }
  return '+' + d
}

export default function LinkPagoPage() {
  const router = useRouter()
  const [celular, setCelular] = useState('')
  const [valor, setValor] = useState('')
  const [tienda, setTienda] = useState('')
  const [tiendas, setTiendas] = useState([])
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null) // { whatsapp, link, texto, aviso, celular, valor }
  const [copiado, setCopiado] = useState(false)

  const [links, setLinks] = useState(null) // null = cargando
  const [todos, setTodos] = useState(false)
  const [errorLista, setErrorLista] = useState('')
  const [actualizando, setActualizando] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('mp_user')) router.push('/')
  }, [router])

  const cargar = useCallback(async () => {
    setActualizando(true); setErrorLista('')
    try {
      const r = await fetch('/api/link-pago', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo cargar el histórico')
      setLinks(d.links || [])
      setTodos(!!d.todos)
      setTiendas(d.tiendas || [])
      setTienda(t => (t && (d.tiendas || []).includes(t)) ? t : (d.tiendas || [])[0] || '')
    } catch (e) {
      setErrorLista(e.message)
      setLinks(l => l || [])
    } finally {
      setActualizando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function crear(e) {
    e?.preventDefault()
    if (creando) return
    setCreando(true); setError(''); setResultado(null); setCopiado(false)
    try {
      const r = await fetch('/api/link-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celular, valor, tienda }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo crear el link')
      setResultado({ ...d, celular, valor })
      if (d.registro) setLinks(l => [d.registro, ...(l || [])])
    } catch (e) {
      setError(e.message)
    } finally {
      setCreando(false)
    }
  }

  function nuevo() {
    setResultado(null); setCelular(''); setValor(''); setError(''); setCopiado(false)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar. Mantén presionado el link para copiarlo.')
    }
  }

  const listo = celular.trim() && Number(String(valor).replace(',', '.')) > 0

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-1">💳 Link de pago</h1>
      <p className="text-gray-500 text-sm mb-5">Pon el celular y el valor. El link sale por tu WhatsApp.</p>

      <div className="card p-5 mb-6">
        {!resultado ? (
          <form onSubmit={crear} className="space-y-4">
            {tiendas.length > 1 && (
              <div>
                <label className="label">Tienda</label>
                <div className="grid grid-cols-2 gap-2">
                  {tiendas.map(t => (
                    <button key={t} type="button" onClick={() => setTienda(t)}
                      className={`py-2 rounded-xl border text-sm font-semibold transition-all ${tienda === t
                        ? 'bg-mandarina-500/20 border-mandarina-500 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                      {NOMBRE_TIENDA[t] || t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="label">Celular del cliente</label>
              <input className="input text-lg" type="tel" inputMode="tel" autoComplete="off"
                placeholder="0987654321" value={celular} onChange={e => setCelular(e.target.value)} />
            </div>
            <div>
              <label className="label">Valor a cobrar (con IVA)</label>
              <input className="input text-lg" type="text" inputMode="decimal" autoComplete="off"
                placeholder="35.00" value={valor} onChange={e => setValor(e.target.value)} />
            </div>
            {error && <div className="text-sm text-red-400">⚠️ {error}</div>}
            <button type="submit" disabled={!listo || creando} className="btn-primary w-full py-3 text-base disabled:opacity-50">
              {creando ? '⏳ Creando link…' : 'Crear link'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-400">
              Link de <b className="text-white">${resultado.valor}</b> para <b className="text-white">{celular}</b>
            </div>
            {/* El botón grande: abre el WhatsApp del vendedor con el mensaje listo. */}
            <a href={resultado.whatsapp} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl text-white text-lg font-bold"
              style={{ background: '#25D366' }}>
              📲 Enviar por WhatsApp
            </a>
            <div className="text-xs text-gray-500 break-all">{resultado.link}</div>
            {resultado.aviso && <div className="text-xs text-amber-400">⚠️ {resultado.aviso}</div>}
            {error && <div className="text-sm text-red-400">⚠️ {error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copiar} className="btn-secondary py-2">{copiado ? '✅ Copiado' : '📋 Copiar mensaje'}</button>
              <button onClick={nuevo} className="btn-ghost py-2">＋ Otro link</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-semibold">{todos ? 'Links de todos' : 'Mis links'}</h2>
        <button onClick={cargar} disabled={actualizando} className="text-xs text-gray-400 hover:text-white">
          {actualizando ? '⏳ Revisando pagos…' : '🔄 Actualizar'}
        </button>
      </div>
      {errorLista && <div className="text-sm text-red-400 mb-2">⚠️ {errorLista}</div>}
      {links === null ? (
        <div className="text-sm text-gray-500">Cargando…</div>
      ) : links.length === 0 ? (
        <div className="text-sm text-gray-500">Todavía no has creado links.</div>
      ) : (
        <div className="space-y-2">
          {links.map(l => {
            const est = ESTADO[l.estado] || ESTADO.PENDIENTE
            return (
              <div key={l.id} className="card p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-white font-semibold">${Number(l.valor).toFixed(2)} · {fmtCelular(l.celular)}</div>
                  <div className="text-xs text-gray-500">
                    {fmtFecha(l.creado_en)} · {NOMBRE_TIENDA[l.tienda] || l.tienda}
                    {todos && l.vendedor_nombre ? ` · ${l.vendedor_nombre}` : ''}
                    {l.estado === 'PAGADO' && l.tarjeta ? ` · ${l.tarjeta}` : ''}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg border ${est.cls}`}>{est.txt}</span>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-gray-600 mt-3">
        El estado se revisa en Payphone cada vez que abres esta pantalla. Un link vence a las 48 horas.
      </p>
    </div>
  )
}
