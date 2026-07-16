'use client'
import { TECNICAS, tecnicaLabel, calcSubtotalProducto, fmtUSD } from '@/lib/cotizacion'
import TallasGrid from './TallasGrid'

const TECNICA_ICON = { sublimacion: '🖨️', bordado: '🧵', dtf: '🎨' }

// Card de una prenda en MODO EDICIÓN (oscuro).
export default function ProductoCard({ index, producto: p, onUpd, onTalla, onToggleTallas, onDup, onRemove, canRemove }) {
  const sub = calcSubtotalProducto(p)
  const set = (field) => (e) => onUpd(p.id, field, e.target.value)

  return (
    <div className="card p-4 mb-2.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-mandarina-500/15 text-mandarina-400 text-xs font-display font-bold">
            #{String(index + 1).padStart(2, '0')}
          </span>
          <span className="text-xs text-gray-400">{TECNICA_ICON[p.tecnica]} {tecnicaLabel(p.tecnica)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onDup(p.id)}
            className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 transition-all">⧉ Duplicar</button>
          {canRemove && (
            <button type="button" onClick={() => onRemove(p.id)}
              className="text-xs text-red-400 hover:text-red-300 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 transition-all">✕</button>
          )}
        </div>
      </div>

      {/* Foto + campos */}
      <div className="flex gap-3.5">
        <div className="flex-shrink-0">
          {p.foto
            ? <img src={p.foto} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-700" onError={(e)=>{e.currentTarget.style.display='none'}} />
            : <div className="w-20 h-20 rounded-xl bg-gray-800 border border-dashed border-gray-700 flex items-center justify-center text-gray-600 text-2xl">👕</div>}
          <input value={p.foto || ''} onChange={set('foto')} placeholder="URL foto"
            className="mt-1.5 w-20 text-[10px] bg-gray-800 border border-gray-700 text-gray-300 rounded px-1 py-1 focus:outline-none focus:border-mandarina-500" />
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <div className="label">Nombre de la prenda</div>
            <input className="input" value={p.nombre} onChange={set('nombre')} placeholder="Ej. Camiseta polo sublimada" />
          </div>
          <div>
            <div className="label">Técnica</div>
            <select className="input" value={p.tecnica} onChange={set('tecnica')}>
              {TECNICAS.map((t) => <option key={t} value={t}>{tecnicaLabel(t)}</option>)}
            </select>
          </div>
          <div>
            <div className="label">Color / descripción</div>
            <input className="input" value={p.color} onChange={set('color')} placeholder="Azul marino, logo pecho izq." />
          </div>
          <div>
            <div className="label">Precio unitario</div>
            <input className="input font-mono" type="number" min={0} step="0.01" value={p.precio} onChange={set('precio')} placeholder="0.00" />
          </div>
          <div>
            <div className="label">Subtotal</div>
            <div className="h-[46px] flex items-center font-display text-xl font-bold text-mandarina-400">{fmtUSD(sub)}</div>
          </div>
        </div>
      </div>

      {/* Cantidad + tallas */}
      <div className="mt-4 pt-3.5 border-t border-gray-800">
        <div className="flex items-center gap-4 flex-wrap">
          {!p.conTallas && (
            <div className="w-28">
              <div className="label">Cantidad</div>
              <input className="input" type="number" min={0} value={p.cantidad} onChange={set('cantidad')} />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
            <input type="checkbox" checked={!!p.conTallas} onChange={(e) => onToggleTallas(p.id, e.target.checked)}
              className="accent-mandarina-500 w-4 h-4" />
            <span className="text-xs text-gray-300">📐 Desglosar por talla</span>
          </label>
          {p.conTallas && (
            <span className="text-xs text-gray-500 pt-1">Total: <b className="text-white">{p.cantidad}</b> prendas</span>
          )}
        </div>
        {p.conTallas && (
          <div className="mt-3">
            <TallasGrid tallas={p.tallas} onChange={(t, v) => onTalla(p.id, t, v)} />
          </div>
        )}
      </div>

      {/* Diseños por posición */}
      <div className="mt-4 pt-3.5 border-t border-gray-800">
        <div className="text-xs text-gray-400 mb-2">🎨 Diseño por posición</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="label">Pecho</div>
            <input className="input" value={p.diseno_pecho} onChange={set('diseno_pecho')} placeholder="—" />
          </div>
          <div>
            <div className="label">Espalda</div>
            <input className="input" value={p.diseno_espalda} onChange={set('diseno_espalda')} placeholder="—" />
          </div>
          <div>
            <div className="label">Manga der.</div>
            <input className="input" value={p.manga_derecha} onChange={set('manga_derecha')} placeholder="—" />
          </div>
          <div>
            <div className="label">Manga izq.</div>
            <input className="input" value={p.manga_izquierda} onChange={set('manga_izquierda')} placeholder="—" />
          </div>
        </div>
      </div>
    </div>
  )
}
