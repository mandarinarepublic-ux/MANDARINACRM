'use client'
import { useState, useId, useEffect } from 'react'
import InputDinero from '@/components/InputDinero'

const TIPOS = ['EFECTIVO', 'TRANSFERENCIA', 'LINK_PAGO']

function PagoItem({ pago, index, onChange, onRemove, montoTotal, totalOtrosPagos }) {
  const [foto, setFoto] = useState(pago.fotoComprobante || null)
  // La foto también puede llegar de AFUERA con el pago ya montado (📌 PAGO del
  // inbox, lib/fotoDesdeInbox.js): sin esto se guardaba pero no se veía.
  useEffect(() => { if (pago.fotoComprobante) setFoto(pago.fotoComprobante) }, [pago.fotoComprobante])

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
  const uid = useId()
  const idCampo = (n) => `${uid}-${n}`

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white" id={idCampo('titulo')}>Pago {index + 1}</span>
        {index > 0 && (
          <button type="button" onClick={onRemove} aria-label={`Eliminar pago ${index + 1}`}
            className="text-red-400 text-sm hover:text-red-300 px-2 min-h-[40px] transition-colors">
            <span aria-hidden="true">✕ </span>Eliminar
          </button>
        )}
      </div>

      {/* Tipo: botones de alternar, por eso aria-pressed (el lector dice cuál
          está elegido; antes solo lo decía el color). */}
      <div className="flex gap-2" role="group" aria-label={`Forma del pago ${index + 1}`}>
        {TIPOS.map(t => (
          <button key={t} type="button" onClick={() => onChange({ ...pago, tipo: t })}
            aria-pressed={pago.tipo === t}
            className={`flex-1 py-3 min-h-[44px] rounded-xl text-xs font-semibold transition-colors border
              ${pago.tipo === t ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500'}`}>
            <span aria-hidden="true">{t === 'EFECTIVO' ? '💵' : t === 'TRANSFERENCIA' ? '🏦' : '🔗'} </span>{t.replace('_',' ')}
          </button>
        ))}
      </div>

      {/* Monto */}
      <div>
        <label className="label" htmlFor={idCampo('monto')}>Monto recibido $</label>
        <InputDinero id={idCampo('monto')}
          className={`input text-xl font-bold ${superaTotal ? 'border-red-500' : ''}`}
          aria-invalid={superaTotal || undefined}
          aria-describedby={superaTotal ? idCampo('monto-err') : undefined}
          value={pago.monto || ''}
          placeholder="0.00"
          onChange={e => onChange({ ...pago, monto: e.target.value })} />
        {superaTotal && (
          <p id={idCampo('monto-err')} className="text-red-400 text-xs mt-1">⚠️ El monto supera el total del pedido</p>
        )}
      </div>

      {/* Foto transferencia. El input va `sr-only` dentro del label (no
          `hidden`) para que con teclado también se pueda subir. */}
      {pago.tipo === 'TRANSFERENCIA' && (
        <div>
          <div className="label" id={idCampo('foto')}>Foto del comprobante *</div>
          <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-3 cursor-pointer transition-colors
            focus-within:ring-2 focus-within:ring-mandarina-500
            ${foto ? 'border-mandarina-500 bg-mandarina-500/10' : 'border-gray-700 hover:border-gray-500'}`}>
            <input type="file" accept="image/*" className="sr-only" aria-labelledby={idCampo('foto')}
              onChange={e => handleFoto(e.target.files[0])} />
            {foto
              ? <div className="flex items-center gap-2"><img src={foto} alt="Comprobante cargado" className="w-10 h-10 rounded-lg object-cover" /><span className="text-mandarina-400 text-sm">✓ Cargado — toca para cambiar</span></div>
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
        <label className="label" htmlFor={idCampo('notas')}>Notas</label>
        <input id={idCampo('notas')} className="input text-sm" placeholder="Abono inicial, saldo pendiente…"
          value={pago.notas || ''} onChange={e => onChange({ ...pago, notas: e.target.value })} />
      </div>

      {/* Resumen de lo que se VA a registrar. Antes decía "✅ Pago registrado"
          en verde apenas se escribía un número, pero aquí no se guarda nada:
          el pago entra recién al dar DE ACUERDO en el paso 4. Un vendedor
          podía creer que ya estaba y cerrar la pantalla. Tono neutro. */}
      {parseFloat(pago.monto || 0) > 0 && !superaTotal && (
        <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-2.5" aria-live="polite">
          <span className="text-gray-400 text-base" aria-hidden="true">🧾</span>
          <div className="flex-1 text-sm text-gray-300">
            Se registrará <span className="text-white font-semibold">${parseFloat(pago.monto || 0).toFixed(2)}</span> en {pago.tipo?.replace('_',' ')}
            <div className="text-xs text-gray-500">Se guarda al confirmar el pedido.</div>
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
      <button type="button" onClick={addPago}
        className="w-full border border-dashed border-gray-700 hover:border-mandarina-500 text-gray-500 hover:text-mandarina-400 rounded-xl py-3 text-sm transition-colors">
        + Agregar otro pago
      </button>
    </div>
  )
}
