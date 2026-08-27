'use client'
// La cabecera fija de las bandejas: título, buscador, filtros y acciones.
//
// POR QUÉ EXISTE: este bloque estaba copiado en cinco pantallas. Además de
// ocupar el 25% del alto —una fila entera solo para las etiquetas de cada
// select, y otra solo para Expandir/Contraer—, al estar duplicado se
// desincronizó: los mismos botones acabaron en sitios distintos en cada una.
//
// Ahora: UNA fila. Buscador ancho, el panel de filtros detrás de un botón con
// el número de los que están puestos, y las acciones como iconos.
//
// ☠️ EL PANEL SE PLIEGA, LOS CHIPS NO. Esconder los filtros solo es aceptable si
// lo que esconden sigue viéndose: una bandeja filtrada es idéntica a una
// completa, y aquí ya costó 21 pedidos invisibles durante 14 días. Los chips son
// la única señal cuando el panel está cerrado — por eso no se pueden ocultar ni
// resumir en un número.
export default function BarraFiltros({
  titulo, insignia, accion,
  busqueda, onBusqueda, placeholder = 'Buscar por pedido, nombre, cédula o celular...',
  chips = [], onQuitarChip, onLimpiar,
  abierto, onAlternarPanel,
  onExpandir, onContraer,
  debajo,          // contenido que NUNCA se pliega (p. ej. contadores con datos)
  children,
}) {
  const nFiltros = chips.length
  return (
    <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-3 pb-2">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-display font-bold text-white truncate">{titulo}</h1>
            {insignia}
          </div>
          {accion}
        </div>

        {/* UNA fila: buscador + filtros + acciones */}
        <div className="flex items-center gap-2">
          <input className="input flex-1 min-w-0" placeholder={placeholder}
            value={busqueda} onChange={(e) => onBusqueda(e.target.value)} />

          {children && (
            <button onClick={onAlternarPanel} aria-expanded={!!abierto}
              className={`flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border text-sm whitespace-nowrap transition-all
                ${nFiltros > 0
                  ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10'
                  : 'border-gray-700 text-gray-300 hover:text-white'}`}>
              <span>⚙</span>
              <span className="hidden sm:inline">Filtros</span>
              {nFiltros > 0 && (
                <span className="bg-mandarina-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {nFiltros}
                </span>
              )}
              <span className={`text-xs opacity-60 transition-transform ${abierto ? 'rotate-180' : ''}`}>▾</span>
            </button>
          )}

          {/* Iconos, sin texto y sin fila propia: son acciones de la lista, no
              filtros, y no merecen el mismo peso visual. */}
          {onExpandir && (
            <button onClick={onExpandir} title="Expandir todos" aria-label="Expandir todos"
              className="min-h-[44px] w-11 flex-shrink-0 text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-xl transition-all">⊞</button>
          )}
          {onContraer && (
            <button onClick={onContraer} title="Contraer todos" aria-label="Contraer todos"
              className="min-h-[44px] w-11 flex-shrink-0 text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-xl transition-all">⊟</button>
          )}
        </div>

        {/* Los chips: qué se está escondiendo, aunque el panel esté cerrado. */}
        {nFiltros > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {chips.map((c) => (
              <button key={c.clave} onClick={() => onQuitarChip?.(c.clave)}
                title={`Quitar ${c.etiqueta}`}
                className="flex items-center gap-1 text-xs bg-mandarina-500/10 border border-mandarina-500/40 text-mandarina-300 rounded-lg pl-2 pr-1.5 py-1 hover:bg-mandarina-500/20 transition-all">
                <span className="max-w-[180px] truncate">{c.etiqueta}</span>
                <span className="opacity-70">×</span>
              </button>
            ))}
            {nFiltros > 1 && (
              <button onClick={onLimpiar}
                className="text-xs text-gray-500 hover:text-white underline px-1 py-1">
                limpiar todo
              </button>
            )}
          </div>
        )}

        {/* Lo que no se pliega jamás: controles que además LLEVAN DATOS. Un
            contador escondido es información perdida, no espacio ganado. */}
        {debajo && <div className="mt-2">{debajo}</div>}

        {/* El panel. Solo ocupa sitio cuando alguien lo pide. */}
        {abierto && children && (
          <div className="mt-2 pt-2 border-t border-gray-800">{children}</div>
        )}
      </div>
    </div>
  )
}
