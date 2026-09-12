'use client'

// Las pestañas de opciones de una cotizacion.
//
// ☠️ Con UNA sola opcion no se pinta NADA. La cotizacion de siempre —que es la
// mayoria— tiene que verse y usarse exactamente igual que antes; las pestañas
// aparecen recien cuando alguien pide la segunda.
export default function OpcionesTabs({ opciones, activa, onActiva, onAdd, onRemove, onUpd }) {
  const varias = opciones.length > 1
  const op = opciones[activa]

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        {varias && opciones.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onActiva(i)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              i === activa ? 'bg-mandarina-500 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            {o.nombre || `Opción ${String.fromCharCode(65 + i)}`}
          </button>
        ))}
        <button type="button" onClick={onAdd} className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-300">
          + Agregar opción
        </button>
      </div>

      {varias && op && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-400">
            Nombre
            <input
              value={op.nombre || ''}
              onChange={(e) => onUpd(op.id, 'nombre', e.target.value)}
              className="ml-2 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </label>
          <label className="text-sm text-gray-400">
            Entrega (días)
            <input
              type="number" min="0"
              value={op.entrega_dias ?? ''}
              onChange={(e) => onUpd(op.id, 'entrega_dias', Number(e.target.value) || 0)}
              className="ml-2 w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => onRemove(op.id)}
            className="text-sm text-red-400"
          >
            Quitar esta opción
          </button>
        </div>
      )}
    </div>
  )
}
