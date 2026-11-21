'use client'
// Aviso de que la pantalla volvió con filtros puestos de antes.
//
// ☠️ POR QUÉ ES OBLIGATORIO donde se restauran filtros: una bandeja filtrada se
// ve exactamente igual de sana que una bandeja completa. Este repo ya pagó por
// eso — 21 pedidos invisibles 14 días con la pantalla diciendo "¡Todo al día!".
// Devolverle a alguien un filtro que él no acaba de poner, sin decírselo, es
// fabricar ese mismo engaño.
export default function AvisoFiltros({ visible, onLimpiar, onOcultar }) {
  if (!visible) return null
  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 mb-4 flex items-center gap-3">
      <span aria-hidden="true" className="text-xl flex-shrink-0">🔎</span>
      <div className="flex-1 min-w-0">
        <div className="text-amber-300 font-semibold text-sm">Estás viendo la lista filtrada</div>
        <div className="text-xs text-gray-400">
          Se guardaron los filtros de tu última visita. No estás viendo todo.
        </div>
      </div>
      <button type="button" onClick={onLimpiar}
        className="btn-secondary text-xs px-3 py-2 flex-shrink-0">
        Limpiar filtros
      </button>
      {/* 40×40 para el dedo: antes la zona tocable era solo la × (~10px). */}
      <button type="button" onClick={onOcultar} aria-label="Ocultar aviso"
        className="w-10 h-10 -my-2 -mr-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors text-lg leading-none flex-shrink-0">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
