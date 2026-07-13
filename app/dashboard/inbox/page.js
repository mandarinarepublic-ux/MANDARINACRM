'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CUENTAS = [
  { id: 'MANDI', label: 'Mandarina' },
  { id: 'IND', label: 'Indstore' },
]

function fmtHora(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia
    ? d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' })
}

// Header de identidad para las rutas del inbox (validado server-side).
function authHeaders() {
  try {
    const u = JSON.parse(localStorage.getItem('mp_user') || '{}')
    return u?.id ? { 'x-mp-user-id': u.id } : {}
  } catch { return {} }
}

function esImagen(m) {
  if (m.tipo && /image|imagen|photo|foto|sticker/i.test(m.tipo)) return true
  return m.media_url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(m.media_url)
}

export default function InboxPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [cuenta, setCuenta] = useState('MANDI')
  const [convs, setConvs] = useState([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [sel, setSel] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [loadingHilo, setLoadingHilo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [q, setQ] = useState('')
  const [pendingTel, setPendingTel] = useState(null)
  const hiloRef = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    // Deep-link desde un pedido: ?cuenta=MANDI&tel=09... abre esa conversación.
    try {
      const sp = new URLSearchParams(window.location.search)
      const cta = (sp.get('cuenta') || '').toUpperCase()
      if (cta === 'MANDI' || cta === 'IND') setCuenta(cta)
      const tel = sp.get('tel')
      if (tel) setPendingTel(tel)
    } catch {}
  }, [])

  const loadConvs = useCallback(async () => {
    setLoadingConvs(true)
    try {
      const res = await fetch(`/api/inbox/conversaciones?cuenta=${cuenta}&conCliente=1&limit=200`, { headers: authHeaders() })
      const data = await res.json()
      setConvs(data.conversaciones || [])
    } catch { setConvs([]) }
    finally { setLoadingConvs(false) }
  }, [cuenta])

  useEffect(() => { if (user) loadConvs() }, [user, cuenta, loadConvs])

  async function abrir(c) {
    setSel(c); setLoadingHilo(true); setMensajes([])
    try {
      const res = await fetch(`/api/inbox/conversaciones/${c.conversacion_id}`, { headers: authHeaders() })
      const data = await res.json()
      setMensajes(data.mensajes || [])
      if (c.no_leidos > 0) {
        fetch(`/api/inbox/conversaciones/${c.conversacion_id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ leer: true }),
        }).catch(() => {})
        setConvs((cs) => cs.map((x) => x.conversacion_id === c.conversacion_id ? { ...x, no_leidos: 0 } : x))
      }
    } catch { setMensajes([]) }
    finally { setLoadingHilo(false) }
  }

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim() || !sel) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/inbox/conversaciones/${sel.conversacion_id}/mensajes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ texto: texto.trim(), autor: user?.nombre || 'Agente' }),
      })
      const data = await res.json()
      if (data.mensaje) setMensajes((m) => [...m, data.mensaje])
      setTexto('')
    } finally { setEnviando(false) }
  }

  useEffect(() => {
    if (hiloRef.current) hiloRef.current.scrollTop = hiloRef.current.scrollHeight
  }, [mensajes])

  // Auto-refresh de la lista de conversaciones (cada 20s).
  useEffect(() => {
    if (!user) return
    const t = setInterval(() => { loadConvs() }, 20000)
    return () => clearInterval(t)
  }, [user, loadConvs])

  // Auto-refresh del hilo abierto (cada 10s); solo re-renderiza si hay mensajes nuevos.
  useEffect(() => {
    if (!sel) return
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/inbox/conversaciones/${sel.conversacion_id}`, { headers: authHeaders() })
        const data = await res.json()
        setMensajes((prev) => (data.mensajes && data.mensajes.length !== prev.length ? data.mensajes : prev))
      } catch {}
    }, 10000)
    return () => clearInterval(t)
  }, [sel])

  // Auto-abrir la conversación que matchea el teléfono del deep-link.
  useEffect(() => {
    if (!pendingTel || loadingConvs || convs.length === 0) return
    const norm = (t) => String(t || '').replace(/\D/g, '').slice(-9)
    const target = norm(pendingTel)
    const c = convs.find((x) => norm(x.telefono) === target)
    if (c) abrir(c)
    setPendingTel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTel, loadingConvs, convs])

  const filtered = convs.filter((c) => {
    if (!q) return true
    const s = q.toLowerCase()
    return (c.nombre_contacto || '').toLowerCase().includes(s)
      || (c.telefono || '').includes(q)
      || (c.cliente_nombre || '').toLowerCase().includes(s)
  })

  if (!user) return null

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Encabezado: cuentas + búsqueda */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h1 className="text-xl font-bold text-white mr-2">💬 Inbox</h1>
        <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
          {CUENTAS.map((c) => (
            <button key={c.id} onClick={() => { setCuenta(c.id); setSel(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${cuenta === c.id ? 'bg-mandarina-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <input className="input flex-1 min-w-[160px] py-2" placeholder="Buscar nombre, teléfono o cliente…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-3">
        {/* Lista de conversaciones */}
        <div className={`card p-0 overflow-y-auto ${sel ? 'hidden md:block' : ''}`}>
          {loadingConvs ? (
            <div className="p-6 text-center text-gray-500 text-sm">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              {convs.length === 0 ? 'No hay conversaciones aún. Corré el backfill del inbox para cargarlas.' : 'Sin resultados.'}
            </div>
          ) : filtered.map((c) => (
            <button key={c.conversacion_id} onClick={() => abrir(c)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800 hover:bg-gray-800/60 transition-colors ${sel?.conversacion_id === c.conversacion_id ? 'bg-gray-800' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white text-sm truncate">{c.nombre_contacto || c.telefono || '—'}</span>
                <span className="text-[11px] text-gray-500 shrink-0">{fmtHora(c.ultimo_mensaje_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-gray-500 truncate flex-1">{c.telefono}</span>
                {c.humano === 'IA' && <span className="text-[10px] px-1.5 rounded-full bg-blue-500/15 text-blue-300">IA</span>}
                {c.humano && c.humano !== 'IA' && <span className="text-[10px] px-1.5 rounded-full bg-purple-500/15 text-purple-300">👤</span>}
                {c.no_leidos > 0 && <span className="text-[10px] px-1.5 rounded-full bg-mandarina-500 text-white font-bold">{c.no_leidos}</span>}
              </div>
              {c.cliente_nombre && (
                <div className="text-[11px] text-green-400 mt-0.5 truncate">✓ Cliente: {c.cliente_nombre}</div>
              )}
            </button>
          ))}
        </div>

        {/* Hilo */}
        <div className={`card p-0 flex flex-col min-h-0 ${sel ? '' : 'hidden md:flex'}`}>
          {!sel ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Seleccioná una conversación
            </div>
          ) : (
            <>
              {/* Cabecera del hilo */}
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <button onClick={() => setSel(null)} className="md:hidden text-gray-400 hover:text-white">←</button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate">{sel.nombre_contacto || sel.telefono}</div>
                  <div className="text-[11px] text-gray-500">
                    {sel.telefono}
                    {sel.soporte ? ` · ${sel.soporte}` : ''}
                  </div>
                </div>
                {sel.id_venta && (
                  <Link href={`/dashboard/pedido/${sel.id_venta}`}
                    className="text-[11px] px-2 py-1 rounded-lg bg-mandarina-500/15 text-mandarina-400 hover:bg-mandarina-500/25 shrink-0">
                    📦 {sel.id_venta}
                  </Link>
                )}
              </div>

              {/* Mensajes */}
              <div ref={hiloRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {loadingHilo ? (
                  <div className="text-center text-gray-500 text-sm py-6">Cargando hilo…</div>
                ) : mensajes.length === 0 ? (
                  <div className="text-center text-gray-600 text-sm py-6">Sin mensajes.</div>
                ) : mensajes.map((m) => {
                  const out = m.direccion === 'OUT'
                  return (
                    <div key={m.mensaje_id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${out ? 'bg-mandarina-500 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>
                        {m.media_url && (esImagen(m)
                          ? <a href={m.media_url} target="_blank" rel="noreferrer"><img src={m.media_url} alt="adjunto" className="rounded-lg max-w-full max-h-60 mb-1" /></a>
                          : <a href={m.media_url} target="_blank" rel="noreferrer" className="block underline text-xs mb-1 opacity-90">📎 adjunto</a>
                        )}
                        {m.texto && <div className="whitespace-pre-wrap break-words">{m.texto}</div>}
                        <div className={`text-[10px] mt-0.5 ${out ? 'text-white/70' : 'text-gray-500'}`}>
                          {m.respuesta_ia ? '🤖 ' : ''}{fmtHora(m.fecha)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Composer */}
              <form onSubmit={enviar} className="p-2 border-t border-gray-800 flex gap-2 items-end">
                <textarea className="input flex-1 py-2 resize-none max-h-28" rows={1} placeholder="Escribí un mensaje…"
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(e) } }} />
                <button type="submit" disabled={enviando || !texto.trim()} className="btn-primary py-2 px-4 shrink-0">
                  {enviando ? '…' : 'Enviar'}
                </button>
              </form>
              <div className="px-3 pb-2 text-[10px] text-gray-600">
                El mensaje se guarda siempre. Si el envío por Meta está configurado (env por cuenta), además se manda por WhatsApp.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
