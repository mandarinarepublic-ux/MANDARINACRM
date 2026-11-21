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

  // Con la PWA a pantalla completa (viewport-fit=cover) la franja empezaba
  // DEBAJO de la hora/notch y el texto quedaba tapado: se suma el margen seguro.
  const arriba = { paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }

  if (!online) {
    // role="alert": perder internet a media venta es urgente, se anuncia ya.
    return (
      <div role="alert" style={arriba} className="fixed top-0 left-0 right-0 z-[200] bg-red-500 text-white text-center text-sm font-medium py-2 px-4 shadow-2xl">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
          Sin conexión a internet — revisa tu WiFi o datos
        </span>
      </div>
    )
  }

  if (reconectado) {
    return (
      // role="status": es una buena noticia, se anuncia sin interrumpir.
      <div role="status" style={arriba} className="fixed top-0 left-0 right-0 z-[200] bg-green-600 text-white text-center text-sm font-medium py-2 px-4 shadow-2xl">
        <span aria-hidden="true">✅</span> Conexión restablecida
      </div>
    )
  }

  return null
}
