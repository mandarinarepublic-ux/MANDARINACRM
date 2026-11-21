'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'

const DURACION_MS = 8000

// ─── Toast individual ─────────────────────────────────────────────────────────
function NotifToast({ notif, onClose }) {
  // Se PAUSA mientras el puntero está encima o el foco está dentro: 8 s no
  // alcanzan para leer el pedido y llegar a "Ver pedido →" con el teclado, y el
  // aviso se iba justo cuando uno iba a tocarlo.
  const [pausado, setPausado] = useState(false)
  const restanteRef = useRef(DURACION_MS)

  useEffect(() => {
    if (pausado) return
    const inicio = Date.now()
    const t = setTimeout(onClose, restanteRef.current)
    return () => {
      clearTimeout(t)
      restanteRef.current = Math.max(1000, restanteRef.current - (Date.now() - inicio))
    }
  }, [pausado])

  const tiendaIcon = notif.pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'
  const totalPrendas = (notif.pedido.items || []).reduce((s, i) => s + parseInt(i.CANTIDAD || 1), 0)
  const areas = [...new Set((notif.pedido.items || []).map(i => i.AREA).filter(Boolean))].join(', ')

  return (
    <div
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPausado(false) }}
      className="aviso-entra flex items-start gap-3 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 w-full md:w-80"
    >
      {/* Ícono */}
      <div aria-hidden="true" className="flex-shrink-0 w-10 h-10 rounded-xl bg-mandarina-500/20 flex items-center justify-center text-xl">
        🆕
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-bold text-mandarina-400 uppercase tracking-wide">Nuevo pedido</span>
          <span aria-hidden="true">{tiendaIcon}</span>
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
          Ver pedido <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Cerrar: 40×40 para el dedo (el ✕ solo medía lo que la letra). El
          margen negativo lo deja visualmente en la misma esquina de antes. */}
      <button type="button" onClick={onClose} aria-label="Cerrar aviso"
        className="flex-shrink-0 -mt-2 -mr-2 w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors text-lg leading-none">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

// ─── Contenedor de toasts ─────────────────────────────────────────────────────
// Arriba (ver `.avisos-arriba` en globals.css): abajo tapaba las barras fijas
// de Imprimir, Siguiente y la del pedido durante 8 s.
//
// El contenedor vive SIEMPRE montado (aunque esté vacío): una región aria-live
// que aparece junto con su contenido muchos lectores de pantalla no la anuncian.
export function NotifContainer({ notifs, onClose }) {
  return (
    <div role="status" aria-live="polite"
      className="avisos-arriba fixed z-[100] flex flex-col gap-3 pointer-events-none">
      {notifs.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <NotifToast notif={n} onClose={() => onClose(n.id)} />
        </div>
      ))}
    </div>
  )
}

// ─── Sonido ───────────────────────────────────────────────────────────────────
// UN solo AudioContext para toda la pestaña. Antes se creaba uno nuevo por cada
// aviso y nunca se cerraba: Chrome permite pocos a la vez (~6) y, en una PC de
// fábrica que pasa el día abierta, después de unos cuantos pedidos dejaba de
// sonar y además retenía memoria y el hilo de audio.
let audioCtx = null
function contextoAudio() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AC()
  // El navegador lo suspende si la pestaña estuvo quieta o sin interacción.
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

function sonarAviso() {
  try {
    const ctx = contextoAudio()
    if (!ctx) return
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
    // Se sueltan los nodos al terminar; el contexto se queda para el próximo.
    osc.onended = () => { osc.disconnect(); gain.disconnect() }
  } catch (e) {}
}

// ─── Hook para manejar la lista de toasts ─────────────────────────────────────
export function useNotifs() {
  const [notifs, setNotifs] = useState([])

  const addNotif = useCallback((pedido) => {
    const id = `${pedido.PEDIDO_ID}_${Date.now()}`
    setNotifs(prev => [...prev.slice(-4), { id, pedido }]) // máximo 5 toasts

    // Sonido de notificación (solo desktop)
    sonarAviso()
  }, [])

  const removeNotif = useCallback((id) => {
    setNotifs(prev => prev.filter(n => n.id !== id))
  }, [])

  return { notifs, addNotif, removeNotif }
}
