'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatFechaHumana } from '@/lib/parseFecha'

const FUENTE_META = {
  meta:     { label: 'Meta CAPI', icon: '📊' },
  datil:    { label: 'Dátil (facturas)', icon: '🧾' },
  supabase: { label: 'Base de datos', icon: '🗄️' },
  webhook:  { label: 'Webhooks', icon: '🔗' },
}

// ¿Cuánto hace desde una fecha? Para la tira de salud ("hace 5 min").
function haceCuanto(iso) {
  if (!iso) return null
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

export default function ErroresPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [eventos, setEventos] = useState([])
  const [salud, setSalud] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fFuente, setFFuente] = useState('')
  const [fNivel, setFNivel] = useState('error')
  const [reenviando, setReenviando] = useState(null)   // 'TODOS' = tanda completa
  const [aviso, setAviso] = useState('')
  // Cola de reintentos: se puede aplastar varios botones sin esperar a que
  // termine el anterior. Se procesan de a UNO para no disparar varias llamadas a
  // Meta a la vez, y cada fila muestra su turno (⏳ 1, ⏳ 2…).
  const [cola, setCola] = useState([])       // [{pedidoId, eventoId}]
  const [activo, setActivo] = useState(null) // pedidoId que se está enviando

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    if (u.rol !== 'ADMIN') { router.push('/dashboard'); return }
    setUser(u)
    cargar(u)
  }, [])

  function headers(u = user) {
    return { 'Content-Type': 'application/json', 'x-mp-usuario-id': u?.id || '' }
  }

  async function cargar(u = user) {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams()
      if (fFuente) qs.set('fuente', fFuente)
      if (fNivel) qs.set('nivel', fNivel)
      const res = await fetch(`/api/eventos?${qs}`, { headers: headers(u), cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`)
      const d = await res.json()
      setEventos(d.eventos || [])
      setSalud(d.salud || {})
    } catch (e) {
      setError(e.message || 'Error de conexión')
    } finally { setLoading(false) }
  }

  // Recargar al cambiar filtros
  useEffect(() => { if (user) cargar() }, [fFuente, fNivel])

  // Tope de la cola: suficiente para ir aplastando varios seguidos, y bajito
  // para no encolar decenas de llamadas a Meta desde el navegador. Para tandas
  // grandes está el botón "Reintentar Meta", que las manda de una al servidor.
  const MAX_COLA = 5

  /** Pone un pedido en la fila de reintentos (no espera a que termine el anterior). */
  function encolarReintento(ev) {
    if (activo === ev.pedido_id) return
    if (cola.some(c => c.pedidoId === ev.pedido_id)) return
    if (cola.length + (activo ? 1 : 0) >= MAX_COLA) {
      setError(`Máximo ${MAX_COLA} en la fila. Espera a que bajen o usa "Reintentar Meta".`)
      return
    }
    setError('')
    setCola(c => [...c, { pedidoId: ev.pedido_id, eventoId: ev.id }])
  }

  // Procesa la fila de a uno. Cuando termina el activo, arranca el siguiente.
  useEffect(() => {
    if (activo || cola.length === 0) return
    const siguiente = cola[0]
    setActivo(siguiente.pedidoId)
    setCola(c => c.slice(1))
    reenviarCapi(siguiente).finally(() => setActivo(null))
  }, [cola, activo])

  // Reenvía a Meta el Purchase de un pedido que falló. El servidor vuelve a
  // consultar el pedido y el cliente y usa la fecha REAL de la venta.
  async function reenviarCapi({ pedidoId, eventoId }) {
    try {
      const res = await fetch('/api/admin/capi-reenviar', {
        method: 'POST', headers: headers(), body: JSON.stringify({ pedidoIds: [pedidoId] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      const r = d.resultados?.[0] || {}
      if (r.ok) {
        setAviso(`✅ ${pedidoId}: Meta lo recibió`)
        // Sin esto el reintento no se notaba: el OK nuevo queda fuera del filtro
        // "Solo errores" y la fila roja seguía igual, como si no hubiera pasado nada.
        await marcarResuelto(eventoId, true)
      } else {
        setError(`❌ ${pedidoId}: ${r.error || 'no se pudo enviar'}`)
      }
    } catch (e) {
      setError(e.message || 'Error de conexión')
    }
  }

  /** Reintenta de una todos los errores de Meta que se ven en pantalla. */
  async function reenviarTodos() {
    const pendientes = eventos.filter(e => e.fuente === 'meta' && e.nivel === 'error' && !e.resuelto && e.pedido_id)
    if (pendientes.length === 0) return
    // Un pedido puede tener varios errores; se envía una sola vez por pedido.
    const ids = [...new Set(pendientes.map(e => e.pedido_id))]
    setReenviando('TODOS'); setError(''); setAviso('')
    try {
      const res = await fetch('/api/admin/capi-reenviar', {
        method: 'POST', headers: headers(), body: JSON.stringify({ pedidoIds: ids.slice(0, 50) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)

      const okIds = new Set((d.resultados || []).filter(r => r.ok).map(r => r.pedidoId))
      for (const e of pendientes) if (okIds.has(e.pedido_id)) await marcarResuelto(e.id, true)

      setAviso(`✅ ${d.enviados || 0} enviado(s) a Meta${d.fallidos ? ` · ❌ ${d.fallidos} siguen fallando` : ''}`)
      if (ids.length > 50) setError(`Solo se reintentaron los primeros 50 de ${ids.length}. Vuelve a darle para el resto.`)
    } catch (e) {
      setError(e.message || 'Error de conexión')
    } finally { setReenviando(null) }
  }

  async function marcarResuelto(id, resuelto) {
    // Optimista: lo tacho ya y confirmo contra el servidor.
    setEventos(evs => evs.map(e => e.id === id ? { ...e, resuelto } : e))
    try {
      const res = await fetch('/api/eventos', {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ id, resuelto }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setEventos(evs => evs.map(e => e.id === id ? { ...e, resuelto: !resuelto } : e))
    }
  }

  const erroresPend = useMemo(
    () => Object.values(salud).reduce((s, f) => s + (f.erroresSinResolver || 0), 0), [salud]
  )

  const nivelColor = { error: 'text-red-400 bg-red-500/10 border-red-500/30', aviso: 'text-amber-400 bg-amber-500/10 border-amber-500/30', ok: 'text-green-400 bg-green-500/10 border-green-500/30' }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 pt-2">
        <div>
          <h1 className="text-xl font-display font-bold text-white">🩺 Errores del sistema</h1>
          <p className="text-xs text-gray-500">
            {erroresPend > 0 ? `${erroresPend} error(es) sin resolver` : 'Sin errores pendientes'}
          </p>
        </div>
        <div className="flex gap-2">
          {eventos.some(e => e.fuente === 'meta' && e.nivel === 'error' && !e.resuelto && e.pedido_id) && (
            <button onClick={reenviarTodos} disabled={!!reenviando || !!activo || cola.length > 0}
              className="text-xs px-3 py-2 rounded-xl border border-blue-600 text-blue-400 hover:bg-blue-500/10 disabled:opacity-50">
              {reenviando === 'TODOS' ? '⏳ enviando...' : '🔄 Reintentar Meta'}
            </button>
          )}
          <button onClick={() => cargar()} disabled={loading} className="btn-secondary text-xs px-3 py-2">↻ Actualizar</button>
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-sm px-2">← Volver</button>
        </div>
      </div>

      {/* Tira de salud por integración */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {['meta', 'datil', 'supabase', 'webhook'].map(f => {
          const s = salud[f] || {}
          const okReciente = s.ultimoOk && (Date.now() - new Date(s.ultimoOk).getTime()) < 24 * 60 * 60 * 1000
          const tienePend = (s.erroresSinResolver || 0) > 0
          const estadoCls = tienePend ? 'border-red-500/50' : okReciente ? 'border-green-500/40' : 'border-gray-700'
          return (
            <div key={f} className={`card p-2.5 border ${estadoCls}`}>
              <div className="text-xs font-semibold text-white flex items-center gap-1">
                {FUENTE_META[f].icon} {FUENTE_META[f].label}
              </div>
              <div className="mt-1 text-[11px] leading-tight">
                {tienePend
                  ? <span className="text-red-400 font-semibold">⚠️ {s.erroresSinResolver} sin resolver</span>
                  : s.ultimoOk
                    ? <span className="text-green-400">✓ OK {haceCuanto(s.ultimoOk)}</span>
                    : <span className="text-gray-600">sin actividad</span>}
              </div>
              {s.ultimoError && (
                <div className="text-[10px] text-gray-600 mt-0.5 truncate" title={s.mensajeError}>
                  últ. error {haceCuanto(s.ultimoError)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <select className="input py-2 text-sm w-auto" value={fFuente} onChange={e => setFFuente(e.target.value)}>
          <option value="">Todas las fuentes</option>
          {Object.entries(FUENTE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select className="input py-2 text-sm w-auto" value={fNivel} onChange={e => setFNivel(e.target.value)}>
          <option value="error">Solo errores</option>
          <option value="aviso">Solo avisos</option>
          <option value="ok">Solo OK</option>
          <option value="">Todo</option>
        </select>
      </div>

      {aviso && (
        <div className="mb-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-green-400">{aviso}</span>
        </div>
      )}

      {error && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-red-400">⚠️ {error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : eventos.length === 0 ? (
        <div className="card p-8 text-center text-gray-600">
          <div className="text-3xl mb-2">✅</div>
          {fNivel === 'error' ? 'Ningún error registrado. Todo en orden.' : 'Sin eventos con estos filtros.'}
        </div>
      ) : (
        <div className="space-y-2">
          {eventos.map(ev => {
            const fm = FUENTE_META[ev.fuente] || { label: ev.fuente, icon: '•' }
            return (
              <div key={ev.id} className={`card p-3 border-l-4 ${ev.resuelto ? 'opacity-50' : ''}`}
                style={{ borderLeftColor: ev.nivel === 'error' ? '#ef4444' : ev.nivel === 'aviso' ? '#f59e0b' : '#22c55e' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-xs font-semibold text-white">{fm.icon} {fm.label}</span>
                      <span className={`badge text-[10px] border ${nivelColor[ev.nivel] || ''}`}>{ev.nivel}</span>
                      {ev.pedido_id && (
                        <a href={`/dashboard/pedido/${ev.pedido_id}`} className="text-[10px] font-mono text-mandarina-400 hover:underline">{ev.pedido_id}</a>
                      )}
                      {/* Los errores que manda el inbox (señales de pauta: Lead e
                          InitiateCheckout) no cuelgan de un pedido sino de una
                          conversación. Sin el teléfono no hay por dónde empezar
                          a investigarlos. */}
                      {!ev.pedido_id && ev.detalle?.origen === 'inbox' && ev.detalle?.telefono && (
                        <span className="text-[10px] font-mono text-gray-500" title="conversación afectada">
                          💬 {ev.detalle.telefono}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-600">{formatFechaHumana(ev.fecha)}</span>
                    </div>
                    <div className={`text-sm ${ev.resuelto ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{ev.mensaje}</div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col gap-1">
                    {ev.nivel === 'error' && (
                      <button onClick={() => marcarResuelto(ev.id, !ev.resuelto)}
                        className={`text-xs px-2 py-1 rounded-lg border ${ev.resuelto ? 'border-gray-700 text-gray-500' : 'border-green-600 text-green-400 hover:bg-green-500/10'}`}>
                        {ev.resuelto ? '↩︎ reabrir' : '✓ resuelto'}
                      </button>
                    )}
                    {/* Reintentar el envío a Meta. Repetirlo es inofensivo: el
                        event_id es el PEDIDO_ID y Meta deduplica. */}
                    {ev.fuente === 'meta' && ev.nivel === 'error' && ev.pedido_id && (() => {
                      const enviando = activo === ev.pedido_id
                      const turno = cola.findIndex(c => c.pedidoId === ev.pedido_id)   // -1 = no está en fila
                      const enFila = turno >= 0
                      return (
                        <button onClick={() => encolarReintento(ev)} disabled={enviando || enFila || reenviando === 'TODOS'}
                          className="text-xs px-2 py-1 rounded-lg border border-blue-600 text-blue-400 hover:bg-blue-500/10 disabled:opacity-60">
                          {enviando ? '⏳ enviando' : enFila ? `⏳ ${turno + 1}` : '🔄 reintentar'}
                        </button>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
