'use client'
import { useEffect, useRef } from 'react'

// Lo mínimo para que un modal se comporte como diálogo en el formulario de
// pedido (nuevo, editar y la foto ampliada de una prenda):
//
//   · Al abrir, el foco entra al diálogo. Sin esto, con teclado o lector de
//     pantalla el modal aparecía pero el foco seguía en el botón de atrás y
//     Tab recorría el formulario que quedó TAPADO.
//   · Escape lo cierra, pero solo si `alCerrar` existe. El de "¿recuperar el
//     pedido?" no se puede cerrar sin contestar: si se cerrara, el borrador no
//     se volvería a guardar nunca (ver listoParaGuardar en nuevo-pedido).
//   · Al cerrar, el foco vuelve a donde estaba, para no perder el lugar.
//
// `alCerrar` se guarda en una ref para no re-suscribir el listener en cada
// render. Devuelve la ref que va en la caja del diálogo; el foco va al
// elemento marcado con `data-autofocus`, o al primer botón si no hay.
export function useDialogo(abierto, alCerrar) {
  const cajaRef = useRef(null)
  const cerrarRef = useRef(alCerrar)
  cerrarRef.current = alCerrar

  useEffect(() => {
    if (!abierto) return
    const antes = typeof document !== 'undefined' ? document.activeElement : null
    const t = setTimeout(() => {
      const caja = cajaRef.current
      if (!caja) return
      const destino = caja.querySelector('[data-autofocus]') || caja.querySelector('button, [href], input, select, textarea') || caja
      destino.focus?.({ preventScroll: true })
    }, 0)
    const onKey = (e) => {
      if (e.key === 'Escape' && cerrarRef.current) {
        e.stopPropagation()
        cerrarRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      // Solo si sigue en la página (un router.push ya lo desmontó todo).
      if (antes && antes.isConnected && typeof antes.focus === 'function') antes.focus({ preventScroll: true })
    }
  }, [abierto])

  return cajaRef
}
