'use client'
import { useEffect, useState } from 'react'
import { GRUPOS } from '@/lib/conexiones'

// Tablero tipo panel de auto: una luz por servicio del que depende la empresa.
// Lo llena la rutina de Claude (7:00 y 15:00). Ver lib/conexiones.js.

const LUZ = {
  verde:    { bg: 'bg-green-400',  glow: '0 0 10px 2px rgba(74,222,128,.75)',  borde: 'border-green-500/30', texto: 'text-green-300' },
  amarillo: { bg: 'bg-yellow-400', glow: '0 0 10px 2px rgba(250,204,21,.75)',  borde: 'border-yellow-500/40', texto: 'text-yellow-300' },
  rojo:     { bg: 'bg-red-500',    glow: '0 0 12px 3px rgba(239,68,68,.85)',   borde: 'border-red-500/60', texto: 'text-red-300' },
  gris:     { bg: 'bg-gray-500',   glow: 'none',                                borde: 'border-gray-700', texto: 'text-gray-400' },
}

function hace(iso) {
  if (!iso) return ''
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `hace ${Math.max(min, 1)} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

export default function PanelConexiones({ headers }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/conexiones', { headers, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`); return r.json() })
      .then(d => { if (vivo) setDatos(d) })
      .catch(e => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [])

  if (error) return <div className="mb-4 text-xs text-red-400">No se pudo cargar el panel de conexiones: {error}</div>
  if (!datos) return <div className="mb-4 h-24 rounded-2xl bg-gray-900/60 animate-pulse" />

  const { conexiones = [], resumen: r = {} } = datos
  const ultima = conexiones.find(c => c.servicio === 'claude_rutina')?.revisado_en
  const todoVerde = conexiones.length > 0 && conexiones.every(c => c.estado === 'verde')
  const grupos = [...GRUPOS, ...new Set(conexiones.map(c => c.grupo).filter(g => !GRUPOS.includes(g)))]

  return (
    <section className="mb-5 rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-950 to-gray-900 p-4 shadow-inner">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide">🚗 Panel de conexiones</h2>
          <p className="text-[11px] text-gray-500">Se revisa a las 7:00 y 15:00{ultima ? ` · última ${hace(ultima)}` : ''}</p>
        </div>
        <div className={`text-xs font-semibold px-3 py-1 rounded-full ${todoVerde ? 'bg-green-500/15 text-green-300' : r.rojo ? 'bg-red-500/15 text-red-300' : 'bg-yellow-500/15 text-yellow-300'}`}>
          {todoVerde ? '✅ Todo en verde' : `${r.rojo ? `${r.rojo} rojo · ` : ''}${r.amarillo ? `${r.amarillo} amarillo · ` : ''}${r.verde || 0} verde`}
        </div>
      </div>

      {conexiones.length === 0 && <p className="text-xs text-gray-500">Todavía no hay revisiones. La rutina llena esto a las 7:00 y 15:00.</p>}

      {grupos.map(g => {
        const suyas = conexiones.filter(c => c.grupo === g)
        if (!suyas.length) return null
        return (
          <div key={g} className="mb-3 last:mb-0">
            <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-1.5">{g}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {suyas.map(c => {
                const l = LUZ[c.estado] || LUZ.gris
                const open = abierta === c.servicio
                return (
                  <button key={c.servicio} type="button" onClick={() => setAbierta(open ? null : c.servicio)}
                    className={`text-left rounded-xl border ${l.borde} bg-black/40 px-3 py-2 transition hover:bg-black/60 ${open ? 'col-span-2 sm:col-span-3' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${l.bg}`} style={{ boxShadow: l.glow }} />
                      <span className="text-xs font-semibold text-gray-100 truncate">{c.nombre}</span>
                    </div>
                    <p className={`mt-1 text-[11px] leading-snug ${l.texto} ${open ? '' : 'line-clamp-2'}`}>{c.detalle || '—'}</p>
                    {open && (
                      <p className="mt-1 text-[10px] text-gray-500">
                        Revisado {hace(c.revisado_en)} · en {c.estado} desde {hace(c.cambio_en)}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
}
