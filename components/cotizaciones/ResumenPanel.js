'use client'
import { calcSubtotalProducto, fmtUSD, IVA_RATE } from '@/lib/cotizacion'

// Panel de resumen económico (modo edición): lista de prendas + totales.
export default function ResumenPanel({ productos, descuento, onDescuento, totales }) {
  return (
    <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Izquierda: prendas */}
      <div>
        <div className="label mb-2">Prendas</div>
        <div className="space-y-1.5">
          {productos.filter((p) => p.nombre || calcSubtotalProducto(p) > 0).length === 0 && (
            <div className="text-xs text-gray-600">Aún no hay prendas con datos.</div>
          )}
          {productos.map((p, i) => (
            (p.nombre || calcSubtotalProducto(p) > 0) ? (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate mr-2">
                  {p.nombre || `Prenda ${i + 1}`} <span className="text-gray-600">× {p.cantidad || 0}</span>
                </span>
                <span className="text-gray-400 font-mono">{fmtUSD(calcSubtotalProducto(p))}</span>
              </div>
            ) : null
          ))}
        </div>
      </div>

      {/* Derecha: totales */}
      <div className="md:border-l md:border-gray-800 md:pl-6">
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-gray-400">Subtotal</span>
          <span className="text-white font-mono">{fmtUSD(totales.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-gray-400">Descuento</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">-$</span>
            <input
              type="number" min={0} step="0.01"
              value={descuento}
              onChange={(e) => onDescuento(parseFloat(e.target.value) || 0)}
              className="w-24 bg-gray-800 border border-gray-700 text-white text-right font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-mandarina-500 focus:ring-1 focus:ring-mandarina-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-gray-400">IVA ({Math.round(IVA_RATE * 100)}%)</span>
          <span className="text-white font-mono">{fmtUSD(totales.iva)}</span>
        </div>
        <div className="border-t border-gray-800 mt-2 pt-3 flex items-center justify-between">
          <span className="text-gray-300 font-semibold">TOTAL</span>
          <span className="font-display text-3xl font-extrabold text-mandarina-400">{fmtUSD(totales.total)}</span>
        </div>
      </div>
    </div>
  )
}
