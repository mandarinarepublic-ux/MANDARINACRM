'use client'
import { useEffect, useRef } from 'react'

// Cierra un modal / foto ampliada con la tecla Escape.
// Se usa en las pantallas del taller: con teclado o lector de pantalla no hay
// forma de "tocar el fondo", así que Escape es la salida que se espera de un diálogo.
// `activo` permite montarlo siempre y escuchar solo mientras el modal está abierto.
// Se guarda `alCerrar` en una ref para no re-suscribir el listener en cada render.
export function useTeclaEscape(activo, alCerrar) {
  const ref = useRef(alCerrar)
  ref.current = alCerrar
  useEffect(() => {
    if (!activo) return
    const onKey = (e) => { if (e.key === 'Escape') ref.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activo])
}
