'use client'
import { useState } from 'react'

const SUBESTADO_COLORS = {
  LISTO:              'bg-green-500/20 text-green-400',
  EN_PROCESO:         'bg-blue-500/20 text-blue-400',
  ENVIADO_APROBACION: 'bg-purple-500/20 text-purple-400',
  SOLICITADO:         'bg-yellow-500/20 text-yellow-400',
  ENTREGADO_TIENDA:   'bg-gray-500/20 text-gray-400',
}

export default function ItemDetalle({ item, readOnly, tiendaColor, user, loadPedido }) {
  const fotos = [
    { key: 'FOTO_PECHO_URL',   label: 'Pecho'   },
    { key: 'FOTO_ESPALDA_URL', label: 'Espalda' },
    { key: 'FOTO_MANGA_D_URL', label: 'M. Der'  },
    { key: 'FOTO_MANGA_I_URL', label: 'M. Izq'  },
  ].filter(f => item[f.key])

  const [fotoActiva,     setFotoActiva]    = useState(fotos[0]?.key || null)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)
  const [editingNota,    setEditingNota]   = useState(false)
  const [notaText,       setNotaText]      = useState(item.NOTAS_AREA || '')
  const [savingNota,     setSavingNota]    = useState(false)

  async function saveNota() {
    setSavingNota(true)
    try {
      await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ NOTAS_AREA: notaText, _usuarioId: user?.id }),
      })
      setEditingNota(false)
      loadPedido()
    } finally { setSavingNota(false) }
  }

  return (
    <div className="p-4">
      {/* Precio */}
      <div className="flex justify-between items-start mb-4">
        <div className="font-medium text-white text-sm">{item.PRODUCTO_NOMBRE}</div>
        <div className="text-right flex-shrink-0 ml-3">
          <div className="text-sm text-white">{item.CANTIDAD}x ${parseFloat(item.PRECIO_UNIT||0).toFixed(2)}</div>
          <div className="text-xs font-medium" style={{ color: tiendaColor }}>${parseFloat(item.SUBTOTAL||0).toFixed(2)}</div>
        </div>
      </div>

      {/* 2 columnas */}
      <div className="flex gap-4">
        {/* Izquierda: foto */}
        <div className="w-36 flex-shrink-0">
          {fotos.length > 0 ? (
            <>
              <div className="w-36 h-36 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 mb-2 cursor-pointer"
                onDoubleClick={() => setFotoFullscreen(item[fotoActiva || fotos[0].key])}>
                <img src={item[fotoActiva || fotos[0].key]} className="w-full h-full object-contain" alt="foto" />
              </div>
              {fotos.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {fotos.map(f => (
                    <button key={f.key} onClick={() => setFotoActiva(f.key)}
                      className={`flex flex-col items-center p-0.5 rounded-lg border transition-all
                        ${(fotoActiva || fotos[0].key) === f.key ? 'border-mandarina-500' : 'border-gray-700'}`}>
                      <img src={item[f.key]} className="w-9 h-9 rounded object-cover" alt={f.label} />
                      <span className="text-xs text-gray-600">{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-700 mt-1 text-center">2× = pantalla completa</div>
            </>
          ) : (
            <div className="w-36 h-36 rounded-xl border border-gray-800 bg-gray-800/30 flex items-center justify-center">
              <span className="text-gray-700 text-xs">Sin fotos</span>
            </div>
          )}
        </div>

        {/* Derecha: detalle */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="bg-gray-800/50 rounded-xl px-3 py-2 space-y-1.5 text-xs">
            <div><span className="text-gray-500">Color:</span> <span className="text-gray-300">{item.COLOR || '—'}</span></div>
            <div><span className="text-gray-500">Talla:</span> <span className="text-gray-300">{item.TALLA || '—'}</span></div>
            <div><span className="text-gray-500">Cant.:</span> <span className="text-gray-300">{item.CANTIDAD}</span></div>
            <div><span className="text-gray-500">Área:</span> <span className="text-mandarina-400 font-medium">{item.AREA}</span></div>
            {item.DETALLE_PERSONALIZADO && (
              <div><span className="text-gray-500">Detalle:</span> <span className="text-gray-300">{item.DETALLE_PERSONALIZADO}</span></div>
            )}
          </div>

          {/* Notas del área — editable para roles de producción */}
          {!readOnly ? (
            editingNota ? (
              <div>
                <textarea className="input resize-none text-sm mb-2 w-full" rows={2}
                  placeholder="Nota para este producto..."
                  value={notaText} onChange={e => setNotaText(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={saveNota} disabled={savingNota}
                    className="btn-primary text-xs px-3 py-1.5">
                    {savingNota ? '⏳' : '💾 Guardar'}
                  </button>
                  <button onClick={() => setEditingNota(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
                </div>
              </div>
            ) : (
              <div>
                {item.NOTAS_AREA && (
                  <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-1">
                    📝 {item.NOTAS_AREA}
                  </div>
                )}
                <button onClick={() => { setEditingNota(true); setNotaText(item.NOTAS_AREA || '') }}
                  className="text-xs text-gray-600 hover:text-gray-400">
                  {item.NOTAS_AREA ? '✏️ Editar nota' : '+ Agregar nota de área'}
                </button>
              </div>
            )
          ) : (
            item.NOTAS_AREA && (
              <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                📝 {item.NOTAS_AREA}
              </div>
            )
          )}

          {/* Subestado */}
          {(readOnly || user?.rol === 'DESPACHO') ? (
            <span className={`badge text-xs ${SUBESTADO_COLORS[item.SUBESTADO] || 'bg-gray-500/20 text-gray-400'}`}>
              {item.SUBESTADO}
            </span>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {[
                { key: 'SOLICITADO',         label: '⏳ Solicitado',         color: 'bg-yellow-500' },
                { key: 'EN_PROCESO',         label: '🔧 En proceso',         color: 'bg-blue-500' },
                { key: 'ENVIADO_APROBACION', label: '📤 Enviado aprobación', color: 'bg-purple-500' },
                { key: 'LISTO',              label: '✅ Listo',              color: 'bg-green-500' },
              ].map(s => (
                <button key={s.key}
                  onClick={async () => {
                    await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ SUBESTADO: s.key, _usuarioId: user?.id }),
                    })
                    loadPedido()
                  }}
                  className={`py-1.5 rounded-xl text-xs font-semibold transition-all
                    ${item.SUBESTADO === s.key
                      ? `${s.color} text-white`
                      : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen */}
      {fotoFullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoFullscreen(null)}>
          <img src={fotoFullscreen} className="max-w-full max-h-full object-contain rounded-xl" alt="fullscreen" />
          <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  )
}
