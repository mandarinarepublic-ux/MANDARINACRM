'use client'
import { useState } from 'react'

const TIPOS = ['EFECTIVO', 'TRANSFERENCIA', 'LINK_PAGO']

export default function SeccionPago({ pago, onChange, montoTotal }) {
  const [fotoComprobante, setFotoComprobante] = useState(null)

  function handleFoto(file) {
    const reader = new FileReader()
    reader.onload = e => {
      setFotoComprobante(e.target.result)
      onChange({ ...pago, fotoComprobante: e.target.result })
    }
    reader.readAsDataURL(file)
  }

  const montoPendiente = montoTotal - parseFloat(pago.monto || 0)

  return (
    <div className="card p-5 space-y-4">
      <h3 className="font-semibold text-white">💳 Pago</h3>

      {/* Tipo */}
      <div className="flex gap-2">
        {TIPOS.map(t => (
          <button key={t}
            onClick={() => onChange({ ...pago, tipo: t })}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border
              ${pago.tipo === t
                ? 'bg-mandarina-500 border-mandarina-500 text-white'
                : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
            {t === 'EFECTIVO' ? '💵' : t === 'TRANSFERENCIA' ? '🏦' : '🔗'} {t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Monto */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Total del pedido</label>
          <div className="input bg-gray-800/50 text-white font-bold text-lg cursor-default">
            ${montoTotal.toFixed(2)}
          </div>
        </div>
        <div>
          <label className="label">Monto recibido $</label>
          <input type="number" className="input" step="0.50" min="0" max={montoTotal}
            value={pago.monto}
            onChange={e => onChange({ ...pago, monto: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Resumen */}
      <div className={`rounded-xl px-4 py-3 text-sm ${montoPendiente > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
        {montoPendiente > 0 ? (
          <span className="text-yellow-400">
            Abono del {Math.round((parseFloat(pago.monto||0) / montoTotal) * 100)}% — pendiente <strong>${montoPendiente.toFixed(2)}</strong>
          </span>
        ) : (
          <span className="text-green-400">✅ Pago completo</span>
        )}
      </div>

      {/* Foto comprobante para transferencia */}
      {pago.tipo === 'TRANSFERENCIA' && (
        <div>
          <label className="label">Foto del comprobante *</label>
          <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all
            ${fotoComprobante ? 'border-mandarina-500 bg-mandarina-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
            <input type="file" accept="image/*" className="hidden" onChange={e => handleFoto(e.target.files[0])} />
            {fotoComprobante ? (
              <div className="flex items-center gap-3">
                <img src={fotoComprobante} className="w-12 h-12 rounded-lg object-cover" />
                <span className="text-mandarina-400 text-sm">Comprobante cargado ✓</span>
              </div>
            ) : (
              <span className="text-gray-500 text-sm">📷 Toca para subir foto del comprobante</span>
            )}
          </label>
        </div>
      )}

      {pago.tipo === 'LINK_PAGO' && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-400">
          ℹ️ Se generará un link de pago dLocal al crear el pedido
        </div>
      )}

      {/* Notas */}
      <div>
        <label className="label">Notas del pago</label>
        <input className="input" placeholder="Ej: Abono inicial, debe saldo antes de despacho..."
          value={pago.notas} onChange={e => onChange({ ...pago, notas: e.target.value })} />
      </div>
    </div>
  )
}
