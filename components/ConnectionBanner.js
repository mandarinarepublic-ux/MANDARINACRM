'use client'
import { useState, useEffect, useRef } from 'react'

// ─── Banner de conexión ───────────────────────────────────────────────────────
// PWA usada en fábrica con WiFi irregular: avisa cuando se pierde el internet
// y confirma brevemente cuando vuelve. No falla en silencio.

export default function ConnectionBanner() {
  const [online, setOnline] = useState(true)
  const [reconectado, setReconectado] = useState(false)
  const reconTimer = useRef(null)

  useEffect(() => {
    // Estado inicial real (en SSR navigator no existe)
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)

    const goOnline = () => {
      setOnline(true)
      setReconectado(true)
      clearTimeout(reconTimer.current)
      reconTimer.current = setTimeout(() => setReconectado(false), 3000)
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearTimeout(reconTimer.current)
    }
  }, [])

  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[200] bg-red-500 text-white text-center text-sm font-medium py-2 px-4 shadow-2xl">
        <span className="inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Sin conexión a internet — revisa tu WiFi o datos
        </span>
      </div>
    )
  }

  if (reconectado) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[200] bg-green-600 text-white text-center text-sm font-medium py-2 px-4 shadow-2xl">
        ✅ Conexión restablecida
      </div>
    )
  }

  return null
}
