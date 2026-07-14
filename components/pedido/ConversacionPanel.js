'use client'
// Panel de solo lectura con la conversación de WhatsApp del cliente (MANDI e IND),
// leída de Supabase (schema inbox). Drawer lateral en desktop, pantalla completa en
// mobile. Las fotos se muestran directo desde media_url (bucket inbox-media), sin Meta.
import { useState, useEffect } from 'react'

const hora = (ts) => {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
}
const diaCorto = (ts) => {
  const d = new Date(ts)
  return isNaN(d) ? '' : d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}
const esImagen = (m) => {
  const t = String(m.tipo || '').toLowerCase()
  return ['imagen', 'image', 'foto', 'sticker'].includes(t) || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.mediaUrl || '')
}

function Burbuja({ m }) {
  const isMe = m.direccion === 'SALIENTE'
  const img = esImagen(m)
  const hasMedia = !!m.mediaUrl
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
      <div style={{
        maxWidth: '80%',
        background: isMe ? '#0d4f3c' : '#111c2a',
        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        border: isMe ? '1px solid rgba(37,211,102,.1)' : '1px solid #1e2d3d',
      }}>
        {img && hasMedia && (
          <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: m.mensaje ? 6 : 0 }}>
            <img src={m.mediaUrl} alt="imagen" loading="lazy"
              style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, display: 'block', objectFit: 'cover', border: '1px solid rgba(255,255,255,.06)' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </a>
        )}
        {img && !hasMedia && (
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: m.mensaje ? 6 : 0 }}>🖼️ imagen no disponible</div>
        )}
        {!img && hasMedia && (
          <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 13, color: '#25d366', fontWeight: 600, textDecoration: 'none', marginBottom: m.mensaje ? 6 : 0 }}>
            📎 Abrir {m.tipo || 'archivo'}
          </a>
        )}
        {m.mensaje && (
          <p style={{ margin: 0, fontSize: 14, color: '#e2e8f0', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{m.mensaje}</p>
        )}
        {!m.mensaje && !hasMedia && !img && (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>[{m.tipo || 'mensaje'}]</p>
        )}
        <div style={{ textAlign: 'right', marginTop: 3 }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>{hora(m.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

export default function ConversacionPanel({ celular, nombreCliente, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conv, setConv] = useState({ MANDI: [], IND: [] })
  const [tab, setTab] = useState('MANDI')

  useEffect(() => {
    let cancel = false
    setLoading(true); setError('')
    fetch(`/api/conversacion?celular=${encodeURIComponent(celular || '')}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return
        if (d.error) { setError(d.error); return }
        const c = { MANDI: d.MANDI || [], IND: d.IND || [] }
        setConv(c)
        setTab(c.MANDI.length ? 'MANDI' : (c.IND.length ? 'IND' : 'MANDI'))
      })
      .catch((e) => { if (!cancel) setError(e.message) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [celular])

  const ambos = conv.MANDI.length > 0 && conv.IND.length > 0
  const msgs = conv[tab] || []
  const vacio = !loading && !error && conv.MANDI.length === 0 && conv.IND.length === 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="h-full w-full md:max-w-md flex flex-col border-l border-gray-800" style={{ background: '#0b141a' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800" style={{ background: '#111c2a' }}>
          <button onClick={onClose} className="text-gray-300 text-xl leading-none px-1">✕</button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-100 truncate">💬 {nombreCliente || 'Conversación'}</div>
            <div className="text-xs text-gray-400 truncate">{celular || 'sin celular'}</div>
          </div>
        </div>

        {/* Pestañas (solo si hay en ambas cuentas) */}
        {ambos && (
          <div className="flex border-b border-gray-800">
            {['MANDI', 'IND'].map((c) => (
              <button key={c} onClick={() => setTab(c)}
                className={`flex-1 py-2 text-xs font-semibold ${tab === c ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}>
                {c} ({conv[c].length})
              </button>
            ))}
          </div>
        )}

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && <div className="text-center text-gray-500 text-sm py-8">Cargando conversación…</div>}
          {error && <div className="text-center text-red-400 text-sm py-8">Error: {error}</div>}
          {vacio && <div className="text-center text-gray-500 text-sm py-10">Este cliente no tiene conversación de WhatsApp registrada.</div>}
          {!loading && !error && msgs.map((m, i) => {
            const prev = msgs[i - 1]
            const showDay = !prev || diaCorto(prev.timestamp) !== diaCorto(m.timestamp)
            return (
              <div key={m.id || i}>
                {showDay && diaCorto(m.timestamp) && (
                  <div className="text-center my-3">
                    <span className="text-[10px] text-gray-300 rounded-full px-3 py-1" style={{ background: 'rgba(255,255,255,.06)' }}>{diaCorto(m.timestamp)}</span>
                  </div>
                )}
                <Burbuja m={m} />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        {!loading && !vacio && (
          <div className="px-4 py-2 border-t border-gray-800 text-center" style={{ background: '#111c2a' }}>
            <span className="text-[11px] text-gray-500">Solo lectura ·</span>
          </div>
        )}
      </div>
    </div>
  )
}
