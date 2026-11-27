import { urlRastreoGuia } from '@/lib/rastreoGuia'

// Botón «Consultar» → rastreo de la guía en Servientrega, en pestaña nueva.
// No pinta nada si la guía no se puede rastrear (ver lib/rastreoGuia.js).
export default function ConsultarGuia({ numero, transportista, className = '' }) {
  const url = urlRastreoGuia(numero, transportista)
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      aria-label={`Consultar la guía ${String(numero).trim()} en Servientrega (abre otra pestaña)`}
      className={`inline-flex items-center justify-center gap-1 min-h-[40px] px-3 rounded-xl border border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/20 hover:text-white text-xs font-semibold whitespace-nowrap transition-colors ${className}`}>
      🔎 Consultar
    </a>
  )
}
