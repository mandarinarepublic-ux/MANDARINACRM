'use client'
import { useState } from 'react'

const TIPOS = ['EFECTIVO', 'TRANSFERENCIA', 'LINK_PAGO']

function PagoItem({ pago, index, onChange, onRemove, montoTotal, totalOtrosPagos }) {
  const [foto, setFoto] = useState(pago.fotoComprobante || null)

  function handleFoto(file) {
    const reader = new FileReader()
    reader.onload = e => {
      setFoto(e.target.result)
      onChange({ ...pago, fotoComprobante: e.target.result })
    }
    reader.readAsDataURL(file)
  }

  const montoNum = parseFloat(pago.monto || 0)
  const superaTotal = (totalOtrosPagos + montoNum) > montoTotal && montoTotal > 0

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Pago {index + 1}</span>
        {index > 0 && (
          <button onClick={onRemove} className="text-red-400 text-xs hover:text-red-300">✕ Eliminar</button>
        )}
      </div>

      {/* Tipo */}
      <div className="flex gap-2">
        {TIPOS.map(t => (
          <button key={t} onClick={() => onChange({ ...pago, tipo: t })}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border
              ${pago.tipo === t ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500'}`}>
            {t === 'EFECTIVO' ? '💵' : t === 'TRANSFERENCIA' ? '🏦' : '🔗'} {t.replace('_',' ')}
          </button>
        ))}
      </div>

      {/* Monto */}
      <div>
        <label className="label">Monto recibido $</label>
        <input type="number" step="0.50" min="0"
          className={`input text-xl font-bold ${superaTotal ? 'border-red-500' : ''}`}
          value={pago.monto || ''}
          placeholder="0.00"
          onChange={e => onChange({ ...pago, monto: e.target.value })} />
        {superaTotal && (
          <p className="text-red-400 text-xs mt-1">⚠️ El monto supera el total del pedido</p>
        )}
      </div>

      {/* Foto transferencia */}
      {pago.tipo === 'TRANSFERENCIA' && (
        <div>
          <label className="label">Foto del comprobante *</label>
          <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all
            ${foto ? 'border-mandarina-500 bg-mandarina-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
            <input type="file" accept="image/*" className="hidden" onChange={e => handleFoto(e.target.files[0])} />
            {foto
              ? <div className="flex items-center gap-2"><img src={foto} className="w-10 h-10 rounded-lg object-cover" /><span className="text-mandarina-400 text-sm">✓ Cargado</span></div>
              : <span className="text-gray-500 text-sm">📷 Subir foto del comprobante</span>}
          </label>
        </div>
      )}

      {pago.tipo === 'LINK_PAGO' && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-400">
          ℹ️ Se generará link dLocal al crear el pedido
        </div>
      )}

      <div>
        <label className="label">Notas</label>
        <input className="input text-sm" placeholder="Abono inicial, saldo pendiente..."
          value={pago.notas || ''} onChange={e => onChange({ ...pago, notas: e.target.value })} />
      </div>

      {/* Grabar pago */}
      {parseFloat(pago.monto || 0) > 0 && !superaTotal && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5">
          <span className="text-green-400 text-lg">✅</span>
          <div className="flex-1">
            <div className="text-green-400 text-sm font-semibold">Pago registrado</div>
            <div className="text-xs text-green-600">${parseFloat(pago.monto || 0).toFixed(2)} en {pago.tipo?.replace('_',' ')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SeccionPago({ pagos, onChange, montoTotal }) {
  // pagos is now an array
  const pagosArr = Array.isArray(pagos) ? pagos : [{ tipo: 'EFECTIVO', monto: '', notas: '' }]

  function updatePago(idx, updated) {
    const newPagos = pagosArr.map((p, i) => i === idx ? updated : p)
    onChange(newPagos)
  }

  function addPago() {
    onChange([...pagosArr, { tipo: 'EFECTIVO', monto: '', notas: '' }])
  }

  function removePago(idx) {
    onChange(pagosArr.filter((_, i) => i !== idx))
  }

  const totalAbonado = pagosArr.reduce((s, p) => s + parseFloat(p.monto || 0), 0)
  const pendiente = montoTotal - totalAbonado

  return (
    <div className="space-y-4">
      {/* Total destacado */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total del pedido</div>
          <div className="text-3xl font-bold text-white">${montoTotal.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">
            {totalAbonado >= montoTotal ? 'Estado' : 'Pendiente'}
          </div>
          <div className={`text-xl font-bold ${totalAbonado >= montoTotal ? 'text-green-400' : 'text-yellow-400'}`}>
            {totalAbonado >= montoTotal ? '✅ Pagado' : `$${pendiente.toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Pagos */}
      {pagosArr.map((pago, idx) => (
        <PagoItem key={idx} pago={pago} index={idx}
          montoTotal={montoTotal}
          totalOtrosPagos={pagosArr.filter((_, i) => i !== idx).reduce((s, p) => s + parseFloat(p.monto || 0), 0)}
          onChange={updated => updatePago(idx, updated)}
          onRemove={() => removePago(idx)} />
      ))}

      {/* Agregar otro pago */}
      <button onClick={addPago}
        className="w-full border border-dashed border-gray-700 hover:border-mandarina-500 text-gray-500 hover:text-mandarina-400 rounded-xl py-3 text-sm transition-all">
        + Agregar otro pago
      </button>
    </div>
  )
}
