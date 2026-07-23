'use client'
import { useState } from 'react'
import { SUBESTADO_LABELS, SUBESTADO_COLORS, SUBESTADO_BG } from '@/lib/labels'
import { imagenAncho } from '@/lib/imagenes'

const SUBESTADOS_ORDEN = ['SOLICITADO','EN_PROCESO','ENVIADO_APROBACION','LISTO']
const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

// Estados de CORTE — independiente del área, aplica a todos los ítems
const CORTE_ESTADOS = [
  { key: 'PENDIENTE',   label: '✂️ Pendiente',  color: 'bg-gray-600' },
  { key: 'SOLICITADO',  label: '🛒 Solicitado', color: 'bg-yellow-500' },
  { key: 'CORTADO',     label: '✅ Cortado',    color: 'bg-green-500' },
]

// Parsear subestado del item (puede ser simple "LISTO" o multi "ESTAMPADO:LISTO|BORDADO:EN_PROCESO")
function parseSubestados(subestadoStr, areaStr) {
  if (!subestadoStr) return null
  const areas = (areaStr || '').split(/\s*\+\s*|\s*,\s*/).map(a => a.trim().toUpperCase()).filter(a => AREAS_BASE.includes(a))
  if (subestadoStr.includes(':')) {
    const result = {}
    subestadoStr.split('|').forEach(part => {
      const [area, estado] = part.split(':')
      if (area && estado) result[area.trim()] = estado.trim()
    })
    return { tipo: 'multi', estados: result, areas }
  }
  if (areas.length > 1) {
    // Pedido viejo con área combinada pero subestado simple: expandir
    const estados = {}
    areas.forEach(a => estados[a] = subestadoStr)
    return { tipo: 'multi', estados, areas }
  }
  return { tipo: 'simple', estado: subestadoStr, areas }
}

// El más atrasado define el estado global
const ORDEN_ESTADOS = ['SOLICITADO','EN_PROCESO','ENVIADO_APROBACION','LISTO','ENTREGADO_TIENDA','ELIMINADO']
function estadoGlobal(estados) {
  const vals = Object.values(estados)
  let minIdx = ORDEN_ESTADOS.length
  vals.forEach(v => { const i = ORDEN_ESTADOS.indexOf(v); if (i >= 0 && i < minIdx) minIdx = i })
  return ORDEN_ESTADOS[minIdx] || 'SOLICITADO'
}

// Qué área puede cambiar este usuario
function areaDelRol(user, item) {
  if (user?.rol === 'ADMIN') return null // null = puede ver todo pero no toca áreas individuales
  const areas = (user?.areas || []).filter(a => AREAS_BASE.includes(a))
  if (areas.length > 0 && areas[0] !== 'TODAS') {
    // Verificar que el ítem requiere esa área
    const areasItem = (item.AREA || '').toUpperCase()
    const match = areas.find(a => areasItem.includes(a))
    return match || null
  }
  // Por rol
  if (user?.rol === 'ESTAMPADO')   return item.AREA?.includes('ESTAMPADO')   ? 'ESTAMPADO'   : null
  if (user?.rol === 'SUBLIMACION') return item.AREA?.includes('SUBLIMACION') ? 'SUBLIMACION' : null
  if (user?.rol === 'BORDADO')     return item.AREA?.includes('BORDADO')     ? 'BORDADO'     : null
  return null
}

export default function ItemDetalle({ item, readOnly, canChangeSubestado, tiendaColor, user, loadPedido }) {
  const parsed = parseSubestados(item.SUBESTADO, item.AREA)
  const esMulti = parsed?.tipo === 'multi'
  const miArea = areaDelRol(user, item)

  // Estado local: objeto {ESTAMPADO: 'LISTO', BORDADO: 'EN_PROCESO'} o string simple
  // Si área es ENTREGA EN TIENDA → siempre LISTO
  const esEntregaTienda2 = (item.AREA || '').toUpperCase().includes('ENTREGA EN TIENDA')
  const [estadosLocales, setEstadosLocales] = useState(
    esEntregaTienda2
      ? { _simple: 'LISTO' }
      : esMulti ? { ...parsed.estados } : { _simple: parsed?.estado || 'SOLICITADO' }
  )

  const subestadoActual = esMulti
    ? estadoGlobal(estadosLocales)
    : (estadosLocales._simple || 'SOLICITADO')

  // Estado CORTE — independiente, siempre presente
  // Si área es ENTREGA EN TIENDA → ya está cortado y listo por defecto
  const esEntregaTienda = (item.AREA || '').toUpperCase().includes('ENTREGA EN TIENDA')
  const [subestadoCorte, setSubestadoCorte] = useState(
    esEntregaTienda ? 'CORTADO' : (item.SUBESTADO_CORTE || 'PENDIENTE')
  )

  async function cambiarCorte(nuevoEstado) {
    const anterior = subestadoCorte
    setSubestadoCorte(nuevoEstado)
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ SUBESTADO_CORTE: nuevoEstado, _usuarioId: user?.id }),
      })
      if (!res.ok) setSubestadoCorte(anterior)
    } catch { setSubestadoCorte(anterior) }
  }

  const puedeSubestado = canChangeSubestado !== undefined ? canChangeSubestado : !readOnly
  const puedeSubestadoProduccion = puedeSubestado && user?.rol !== 'CORTE'

  const fotos = [
    { key:'FOTO_PECHO_URL',   label:'Pecho'   },
    { key:'FOTO_ESPALDA_URL', label:'Espalda' },
    { key:'FOTO_MANGA_D_URL', label:'M. Der'  },
    { key:'FOTO_MANGA_I_URL', label:'M. Izq'  },
  ].filter(f => item[f.key])

  const [fotoActiva,     setFotoActiva]     = useState(fotos[0]?.key || null)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)
  const [editingNota,    setEditingNota]    = useState(false)
  const [notaText,       setNotaText]       = useState(item.NOTAS_AREA || '')
  const [notaGuardada,   setNotaGuardada]   = useState(item.NOTAS_AREA || '')
  const [savingNota,     setSavingNota]     = useState(false)
  const [notaError,      setNotaError]      = useState('')

  async function saveNota() {
    setSavingNota(true); setNotaError('')
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ NOTAS_AREA:notaText, _usuarioId:user?.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setNotaError(data.error||'Error al guardar'); return }
      setNotaGuardada(notaText); setEditingNota(false)
    } finally { setSavingNota(false) }
  }

  // Cambiar subestado — puede ser de un área específica o global (admin)
  async function cambiarSubestado(nuevoEstado, areaRol) {
    const bodyPatch = { SUBESTADO: nuevoEstado, _usuarioId: user?.id }
    if (areaRol) bodyPatch.AREA_ROL = areaRol

    // Optimistic update local
    if (areaRol) {
      setEstadosLocales(prev => ({ ...prev, [areaRol]: nuevoEstado }))
    } else {
      setEstadosLocales({ _simple: nuevoEstado })
    }

    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(bodyPatch),
      })
      if (!res.ok) {
        // Revertir si falla
        setEstadosLocales(esMulti ? { ...parsed.estados } : { _simple: parsed?.estado })
      }
    } catch {
      setEstadosLocales(esMulti ? { ...parsed.estados } : { _simple: parsed?.estado })
    }
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-start mb-4">
        <div className="font-medium text-white text-sm">{item.PRODUCTO_NOMBRE}</div>
        <div className="text-right flex-shrink-0 ml-3">
          <div className="text-sm text-white">{item.CANTIDAD}x ${parseFloat(item.PRECIO_UNIT||0).toFixed(2)}</div>
          <div className="text-xs font-medium" style={{color:tiendaColor}}>${parseFloat(item.SUBTOTAL||0).toFixed(2)}</div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Fotos */}
        <div className="w-full sm:w-36 flex-shrink-0">
          {fotos.length > 0 ? (
            <>
              <div className="w-full h-52 sm:w-36 sm:h-36 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 mb-2 cursor-pointer"
                onClick={() => setFotoFullscreen(item[fotoActiva||fotos[0].key])}>
                <img src={imagenAncho(item[fotoActiva||fotos[0].key], 600)} className="w-full h-full object-contain" alt="foto" />
              </div>
              {fotos.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {fotos.map(f=>(
                    <button key={f.key} onClick={()=>setFotoActiva(f.key)}
                      className={`flex flex-col items-center p-1 rounded-lg border transition-all ${(fotoActiva||fotos[0].key)===f.key?'border-mandarina-500':'border-gray-700'}`}>
                      <img src={imagenAncho(item[f.key], 120)} className="w-11 h-11 sm:w-9 sm:h-9 rounded object-cover" alt={f.label}/>
                      <span className="text-[10px] text-gray-500">{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1 text-center">👆 Toca para ampliar</div>
            </>
          ) : (
            <div className="w-full h-40 sm:w-36 sm:h-36 rounded-xl border border-gray-800 bg-gray-800/30 flex items-center justify-center">
              <span className="text-gray-700 text-xs">Sin fotos</span>
            </div>
          )}
        </div>

        {/* Info + acciones */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="bg-gray-800/50 rounded-xl px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div><span className="text-gray-500">Color:</span> <span className="text-gray-300">{item.COLOR||'—'}</span></div>
            <div><span className="text-gray-500">Talla:</span> <span className="text-gray-300">{item.TALLA||'—'}</span></div>
            <div><span className="text-gray-500">Cant.:</span> <span className="text-gray-300">{item.CANTIDAD}</span></div>
            <div className="col-span-2"><span className="text-gray-500">Área:</span> <span className="text-mandarina-400 font-medium">{item.AREA}</span></div>
            {item.DETALLE_PERSONALIZADO&&<div className="col-span-2"><span className="text-gray-500">Detalle:</span> <span className="text-gray-300">{item.DETALLE_PERSONALIZADO}</span></div>}
            {/* Diseño: nombre del diseño si existe */}
            {item.DISENO&&<div className="col-span-2"><span className="text-gray-500">Diseño:</span> <span className="text-gray-300">{item.DISENO}</span></div>}
          </div>

          {/* Nota */}
          {readOnly ? (
            notaGuardada && (
              <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                📝 {notaGuardada}
              </div>
            )
          ) : editingNota ? (
            <div>
              <textarea className="input resize-none text-sm mb-2 w-full" rows={2}
                placeholder="Nota para este producto..."
                value={notaText} onChange={e=>setNotaText(e.target.value)} autoFocus />
              {notaError&&<div className="text-xs text-red-400 mb-2">⚠️ {notaError}</div>}
              <div className="flex gap-2">
                <button onClick={saveNota} disabled={savingNota} className="btn-primary text-xs px-3 py-1.5">{savingNota?'⏳ Guardando...':'💾 Guardar'}</button>
                <button onClick={()=>{setEditingNota(false);setNotaText(notaGuardada);setNotaError('')}} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
              </div>
            </div>
          ) : (
            <div>
              {notaGuardada&&<div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-1">📝 {notaGuardada}</div>}
              <button onClick={()=>{setEditingNota(true);setNotaText(notaGuardada)}} className="text-xs text-gray-600 hover:text-gray-400">
                {notaGuardada?'✏️ Editar nota':'+ Agregar nota de área'}
              </button>
            </div>
          )}

          {/* ─── PANEL CORTE — siempre primero, editable solo CORTE y ADMIN ─── */}
          {(puedeSubestado && (user?.rol === 'CORTE' || user?.rol === 'ADMIN')) ? (
            <div className="rounded-xl border border-gray-700 p-2">
              <div className="text-xs font-bold text-gray-400 mb-1.5">✂️ CORTE DE TELA</div>
              <div className="flex gap-1">
                {CORTE_ESTADOS.map(s => (
                  <button key={s.key} onClick={() => cambiarCorte(s.key)}
                    className={`flex-1 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all
                      ${subestadoCorte === s.key ? `${s.color} text-white` : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2">
              <span className="text-xs text-gray-500">✂️ Corte:</span>
              <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${
                subestadoCorte==='CORTADO' ? 'bg-green-600' : subestadoCorte==='SOLICITADO' ? 'bg-yellow-600' : 'bg-gray-600'
              }`}>
                {CORTE_ESTADOS.find(s=>s.key===subestadoCorte)?.label || subestadoCorte}
              </span>
            </div>
          )}

          {/* ─── SUBESTADOS DE PRODUCCIÓN ─── */}
          {puedeSubestadoProduccion ? (
            esMulti ? (
              // MULTI-ÁREA: mostrar panel por cada área
              <div className="space-y-2">
                {parsed.areas.map(area => {
                  const estadoArea = estadosLocales[area] || 'SOLICITADO'
                  const esMiArea = miArea === area || user?.rol === 'ADMIN'
                  const colorBadge = area === 'ESTAMPADO' ? 'text-orange-400' : area === 'BORDADO' ? 'text-purple-400' : 'text-blue-400'
                  return (
                    <div key={area} className={`rounded-xl border p-2 ${esMiArea ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}>
                      <div className={`text-xs font-bold mb-1.5 ${colorBadge}`}>{area}</div>
                      {esMiArea ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {SUBESTADOS_ORDEN.map(s => (
                            <button key={s} onClick={() => cambiarSubestado(s, area)}
                              className={`py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all ${estadoArea===s?`${SUBESTADO_BG[s]} text-white`:'bg-gray-800 text-gray-500 hover:text-white'}`}>
                              {SUBESTADO_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className={`badge text-xs ${SUBESTADO_COLORS[estadoArea]||'bg-gray-500/20 text-gray-400'}`}>
                          {SUBESTADO_LABELS[estadoArea]||estadoArea}
                        </span>
                      )}
                    </div>
                  )
                })}
                {/* Badge global */}
                <div className="text-xs text-gray-600 text-right">
                  Global: <span className={`font-medium ${SUBESTADO_COLORS[subestadoActual]?.replace('bg-','text-').replace('/20','') || 'text-gray-400'}`}>{SUBESTADO_LABELS[subestadoActual]||subestadoActual}</span>
                </div>
              </div>
            ) : (
              // ÁREA SIMPLE: botones normales
              <div className="grid grid-cols-2 gap-1.5">
                {SUBESTADOS_ORDEN.map(s=>(
                  <button key={s} onClick={()=>cambiarSubestado(s, null)}
                    className={`py-2.5 min-h-[44px] rounded-xl text-xs font-semibold transition-all ${subestadoActual===s?`${SUBESTADO_BG[s]} text-white`:'bg-gray-800 text-gray-500 hover:text-white'}`}>
                    {SUBESTADO_LABELS[s]}
                  </button>
                ))}
              </div>
            )
          ) : (
            // Solo lectura — mostrar badge global con label
            <div className="rounded-xl border border-gray-800 px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Estado:</span>
              <span className={`badge text-xs ${SUBESTADO_COLORS[subestadoActual]||'bg-gray-500/20 text-gray-400'}`}>
                {SUBESTADO_LABELS[subestadoActual]||subestadoActual}
              </span>
            </div>
          )}
        </div>
      </div>

      {fotoFullscreen&&(
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={()=>setFotoFullscreen(null)}>
          <img src={fotoFullscreen} className="max-w-full max-h-full object-contain rounded-xl" alt="fullscreen"/>
          <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  )
}
