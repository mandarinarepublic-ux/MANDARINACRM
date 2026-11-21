'use client'
import { themeFor } from '@/lib/tiendaTheme'

// Pill toggle 🍊 Mandarina / 🏪 Indstore. El activo se pinta con el color de marca.
export default function TiendaToggle({ tienda, onChange }) {
  const opts = [
    { key: 'mandarina', label: '🍊 Mandarina' },
    { key: 'indstore', label: '🏪 Indstore' },
  ]
  return (
    // aria-pressed en cada botón: la tienda elegida no puede decirse solo con el color.
    <div className="inline-flex bg-gray-800 rounded-lg p-0.5 gap-0.5" role="group" aria-label="Tienda">
      {opts.map((o) => {
        const active = tienda === o.key
        const th = themeFor(o.key)
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className="px-3 py-1 rounded-md text-xs font-bold transition-colors"
            style={active
              ? { background: th.accent, color: '#fff' }
              : { background: 'transparent', color: '#9ca3af' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
