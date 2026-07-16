'use client'
import { TALLAS } from '@/lib/cotizacion'

const LABEL = { XS: 'XS', S: 'S', M: 'M', L: 'L', XL: 'XL', XXL: '2XL', XXXL: '3XL' }

// Grid de inputs numéricos por talla (XS…3XL). La suma alimenta `cantidad`.
export default function TallasGrid({ tallas, onChange }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {TALLAS.map((t) => (
        <div key={t} className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{LABEL[t]}</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={tallas?.[t] || 0}
            onChange={(e) => onChange(t, e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white text-center rounded-lg px-1 py-1.5 text-sm focus:outline-none focus:border-mandarina-500 focus:ring-1 focus:ring-mandarina-500"
          />
        </div>
      ))}
    </div>
  )
}
