'use client'
import { useRef, useState } from 'react'
import { TECNICAS, tecnicaLabel, calcSubtotalProducto, fmtUSD, precioUnitarioConIva } from '@/lib/cotizacion'
import { subirFoto } from '@/lib/subirImagen'
import TallasGrid from './TallasGrid'

const TECNICA_ICON = { sublimacion: '🖨️', bordado: '🧵', dtf: '🎨' }

// Card de una prenda en MODO EDICIÓN (oscuro).
export default function ProductoCard({ index, producto: p, onUpd, onTalla, onToggleTallas, onDup, onRemove, canRemove }) {
  const sub = calcSubtotalProducto(p)
  const set = (field) => (e) => onUpd(p.id, field, e.target.value)

  const fileRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errFoto, setErrFoto] = useState('')

  async function onPickFoto(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-elegir el mismo archivo
    if (!file) return
    setErrFoto('')
    setSubiendo(true)
    try {
      const url = await subirFoto(file, 'cotizacion')
      if (url) onUpd(p.id, 'foto', url)
    } catch (err) {
      setErrFoto(err.message || 'No se pudo subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

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
          <button type="button" onClick={() => onDup(p.id)} aria-label={`Duplicar prenda ${index + 1}`}
            className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 transition-colors">⧉ Duplicar</button>
          {canRemove && (
            <button type="button" onClick={() => onRemove(p.id)} aria-label={`Quitar prenda ${index + 1}`}
              className="text-xs text-red-400 hover:text-red-300 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 min-w-[40px] min-h-[32px] transition-colors">
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Foto + campos */}
      <div className="flex gap-3.5">
        <div className="flex-shrink-0 w-20">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFoto} />
          {/* El botón solo tiene una miniatura (alt="") o un ícono: necesita nombre propio. */}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={subiendo}
            aria-label={p.foto ? 'Cambiar foto de la prenda' : 'Subir foto de la prenda'}
            className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-700 hover:border-mandarina-500 transition-colors block">
            {p.foto
              ? <img src={p.foto} alt="" className="w-20 h-20 object-cover" onError={(e)=>{e.currentTarget.style.display='none'}} />
              : <div className="w-20 h-20 bg-gray-800 border-dashed flex flex-col items-center justify-center text-gray-500 text-xl gap-0.5"><span aria-hidden="true">📷</span><span className="text-[9px]">Subir foto</span></div>}
            {subiendo && <div role="status" className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white">Subiendo…</div>}
          </button>
          {p.foto && !subiendo && (
            <button type="button" onClick={() => onUpd(p.id, 'foto', '')}
              className="mt-1 w-full text-[10px] text-gray-500 hover:text-red-400" aria-label="Quitar foto de la prenda">✕ quitar</button>
          )}
          {errFoto && <div role="alert" className="mt-1 text-[10px] text-red-400 leading-tight">{errFoto}</div>}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor={`cot-nombre-de-la-prenda-${p.id}`} className="label block">Nombre de la prenda</label>
            <input id={`cot-nombre-de-la-prenda-${p.id}`} className="input" value={p.nombre} onChange={set('nombre')} placeholder="Ej. Camiseta polo sublimada" />
          </div>
          <div>
            <label htmlFor={`cot-tecnica-${p.id}`} className="label block">Técnica</label>
            <select id={`cot-tecnica-${p.id}`} className="input" value={p.tecnica} onChange={set('tecnica')}>
              {TECNICAS.map((t) => <option key={t} value={t}>{tecnicaLabel(t)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`cot-color-descripcion-${p.id}`} className="label block">Color / descripción</label>
            <textarea id={`cot-color-descripcion-${p.id}`}
              className="input resize-y min-h-[46px]"
              rows={3}
              value={p.color}
              onChange={set('color')}
              placeholder={'Azul marino, logo pecho izq.\nPuedes usar varias líneas.'}
            />
          </div>
          <div>
            <label htmlFor={`cot-precio-unitario-${p.id}`} className="label block">Precio unitario</label>
            <input id={`cot-precio-unitario-${p.id}`} className="input font-mono" type="number" min={0} step="0.01" inputMode="decimal" value={p.precio} onChange={set('precio')} placeholder="0.00" />
          </div>
          <div>
            <div className="label">Subtotal y precio unitario</div>
            <div className="h-[46px] flex flex-col justify-center leading-tight">
              <span className="font-display text-xl font-bold text-mandarina-400">{fmtUSD(sub)}</span>
              {/* El precio de lista es el que negocias; el de al lado es el que
                  el cliente paga de verdad. Tenerlos juntos evita la cuenta mental. */}
              <span className="text-[11px] text-gray-400">
                {fmtUSD(parseFloat(String(p.precio)) || 0)} sin IVA · {fmtUSD(precioUnitarioConIva(p))} c/u con IVA
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cantidad + tallas */}
      <div className="mt-4 pt-3.5 border-t border-gray-800">
        <div className="flex items-center gap-4 flex-wrap">
          {!p.conTallas && (
            <div className="w-28">
              <label htmlFor={`cot-cantidad-${p.id}`} className="label block">Cantidad</label>
              <input id={`cot-cantidad-${p.id}`} className="input" type="number" min={0} inputMode="numeric" value={p.cantidad} onChange={set('cantidad')} />
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
            <label htmlFor={`cot-pecho-${p.id}`} className="label block">Pecho</label>
            <input id={`cot-pecho-${p.id}`} className="input" value={p.diseno_pecho} onChange={set('diseno_pecho')} placeholder="—" />
          </div>
          <div>
            <label htmlFor={`cot-espalda-${p.id}`} className="label block">Espalda</label>
            <input id={`cot-espalda-${p.id}`} className="input" value={p.diseno_espalda} onChange={set('diseno_espalda')} placeholder="—" />
          </div>
          <div>
            <label htmlFor={`cot-manga-der-${p.id}`} className="label block">Manga der.</label>
            <input id={`cot-manga-der-${p.id}`} className="input" value={p.manga_derecha} onChange={set('manga_derecha')} placeholder="—" />
          </div>
          <div>
            <label htmlFor={`cot-manga-izq-${p.id}`} className="label block">Manga izq.</label>
            <input id={`cot-manga-izq-${p.id}`} className="input" value={p.manga_izquierda} onChange={set('manga_izquierda')} placeholder="—" />
          </div>
        </div>
      </div>
    </div>
  )
}
