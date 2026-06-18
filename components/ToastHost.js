'use client'
import { useState, useEffect, useRef } from 'react'

// ─── Toasts globales de confirmación ──────────────────────────────────────────
// Dos usos:
//  1) Llamar manualmente desde cualquier componente:  showToast('✅ Guardado')
//  2) AUTOMÁTICO: cualquier PATCH exitoso a /api/pedidos/item dispara "✅ Guardado".
//     Así Producción muestra confirmación SIN tocar su página (526 líneas).

// Llama esto desde cualquier parte de la app
export function showToast(mensaje, tipo = 'success') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('mp:toast', { detail: { mensaje, tipo } }))
}

export default function ToastHost() {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  useEffect(() => {
    function onToast(e) {
      const id = ++idRef.current
      const { mensaje, tipo } = e.detail || {}
      setToasts(prev => [...prev.slice(-3), { id, mensaje, tipo }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2200)
    }
    window.addEventListener('mp:toast', onToast)

    // ── Auto-confirmación: envolver window.fetch (no modifica respuestas) ──
    const origFetch = window.fetch
    if (!window.__mpFetchPatched) {
      window.__mpFetchPatched = true
      window.fetch = async (...args) => {
        const res = await origFetch(...args)
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '')
          const method = (
            args[1]?.method ||
            (typeof args[0] !== 'string' ? args[0]?.method : '') ||
            'GET'
          ).toUpperCase()
          if (method === 'PATCH' && url.includes('/api/pedidos/item') && res.ok) {
            window.dispatchEvent(new CustomEvent('mp:toast', {
              detail: { mensaje: '✅ Guardado', tipo: 'success' },
            }))
          }
        } catch (_) { /* nunca romper el fetch real */ }
        return res
      }
    }

    return () => {
      window.removeEventListener('mp:toast', onToast)
      if (window.__mpFetchPatched) {
        window.fetch = origFetch
        window.__mpFetchPatched = false
      }
    }
  }, [])

  if (!toasts.length) return null

  const estilos = {
    success: 'border-green-500/40 text-green-300',
    error:   'border-red-500/40 text-red-300',
    info:    'border-gray-700 text-gray-200',
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center gap-2 pointer-events-none mb-safe">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-2.5 rounded-xl border bg-gray-900 text-sm font-medium shadow-2xl
            animate-in fade-in slide-in-from-bottom-2 duration-200 ${estilos[t.tipo] || estilos.info}`}
        >
          {t.mensaje}
        </div>
      ))}
    </div>
  )
}
