'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'

// ─── Toast individual ─────────────────────────────────────────────────────────
function NotifToast({ notif, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [])

  const tiendaIcon = notif.pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'
  const totalPrendas = (notif.pedido.items || []).reduce((s, i) => s + parseInt(i.CANTIDAD || 1), 0)
  const areas = [...new Set((notif.pedido.items || []).map(i => i.AREA).filter(Boolean))].join(', ')

  return (
    <div className={`
      flex items-start gap-3 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 w-80
      animate-in slide-in-from-right-full duration-300
    `}>
      {/* Ícono */}
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-mandarina-500/20 flex items-center justify-center text-xl">
        🆕
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-bold text-mandarina-400 uppercase tracking-wide">Nuevo pedido</span>
          <span>{tiendaIcon}</span>
        </div>
        <div className="font-mono font-bold text-white text-sm mb-1">{notif.pedido.PEDIDO_ID}</div>
        <div className="text-xs text-gray-400 space-y-0.5">
          <div>{totalPrendas} prenda(s) · {areas}</div>
          {notif.pedido.VENDEDOR_ID && (
            <div className="text-gray-500">Vendedor: {notif.pedido.VENDEDOR_ID}</div>
          )}
        </div>
        <Link href={`/dashboard/pedido/${notif.pedido.PEDIDO_ID}`}
          onClick={onClose}
          className="inline-block mt-2 text-xs text-mandarina-400 hover:text-mandarina-300 font-medium hover:underline">
          Ver pedido →
        </Link>
      </div>

      {/* Cerrar */}
      <button onClick={onClose}
        className="flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none">
        ✕
      </button>
    </div>
  )
}

// ─── Contenedor de toasts ─────────────────────────────────────────────────────
export function NotifContainer({ notifs, onClose }) {
  if (notifs.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {notifs.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <NotifToast notif={n} onClose={() => onClose(n.id)} />
        </div>
      ))}
    </div>
  )
}

// ─── Hook para manejar la lista de toasts ─────────────────────────────────────
export function useNotifs() {
  const [notifs, setNotifs] = useState([])

  const addNotif = useCallback((pedido) => {
    const id = `${pedido.PEDIDO_ID}_${Date.now()}`
    setNotifs(prev => [...prev.slice(-4), { id, pedido }]) // máximo 5 toasts

    // Sonido de notificación del sistema (solo desktop)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch(e) {}

  }, [])

  const removeNotif = useCallback((id) => {
    setNotifs(prev => prev.filter(n => n.id !== id))
  }, [])

  return { notifs, addNotif, removeNotif }
}
