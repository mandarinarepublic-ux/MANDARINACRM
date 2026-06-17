'use client'
import { useState, useEffect, useRef } from 'react'

/**
 * Envuelve contenido de ancho fijo (los componentes PdfGracias/PdfConfeccion
 * miden 794px, tamaño A4 a 96dpi) y lo escala para que quepa en pantallas
 * angostas como un celular, sin alterar el HTML que se usa para generar
 * el PDF real (ese sigue renderizándose aparte, fuera de pantalla, a 794px).
 *
 * El contenedor padre debe tener un ancho definido (ej. w-full) para que
 * ResizeObserver pueda medirlo correctamente.
 */
const ANCHO_PDF = 794

export default function PdfScaler({ children }) {
  const wrapperRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [alturaEscalada, setAlturaEscalada] = useState(0)

  useEffect(() => {
    function recalcular() {
      if (!wrapperRef.current) return
      const anchoDisponible = wrapperRef.current.offsetWidth
      const nuevaEscala = Math.min(1, anchoDisponible / ANCHO_PDF)
      setScale(nuevaEscala)

      // Medir la altura real del contenido interno (sin escalar) para
      // poder reservarle el espacio correcto ya escalado y evitar que
      // el contenedor colapse a 0px de alto.
      const contenido = wrapperRef.current.querySelector('.pdf-scaler-content')
      if (contenido) {
        setAlturaEscalada(contenido.scrollHeight * nuevaEscala)
      }
    }

    recalcular()
    const ro = new ResizeObserver(recalcular)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    window.addEventListener('resize', recalcular)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recalcular)
    }
  }, [children])

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: alturaEscalada || 'auto', overflow: 'hidden' }}>
      <div
        className="pdf-scaler-content"
        style={{
          width: `${ANCHO_PDF}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
