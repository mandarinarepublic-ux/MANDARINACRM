'use client'
import { useEffect, useState } from 'react'
import { limpiarDecimal, normalizarDecimal, leerDecimal } from '@/lib/decimal'

/**
 * Caja de dinero que acepta punto o coma para los centavos (ver lib/decimal.js).
 * Se usa igual que un <input>: `value` y `onChange(e)`, donde e.target.value
 * llega SIEMPRE con punto ("12,50" → "12.50"), así los parseFloat de siempre
 * siguen funcionando. En pantalla se ve tal cual lo tecleó el vendedor.
 */
export default function InputDinero({ value, onChange, ...resto }) {
  const desdeProp = v => (v === undefined || v === null || v === '' || Number(v) === 0 ? '' : String(v))
  const [texto, setTexto] = useState(() => desdeProp(value))

  // Si el valor cambia desde afuera (reiniciar el formulario, cargar otro
  // pedido), se muestra el nuevo. Si es el mismo número que ya está escrito
  // ("12," y 12), se deja lo tecleado para no comerse la coma a medio escribir.
  useEffect(() => {
    const n = Number(value)
    if (leerDecimal(texto) !== (Number.isFinite(n) ? n : 0)) setTexto(desdeProp(value))
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...resto}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      onChange={e => {
        const limpio = limpiarDecimal(e.target.value)
        setTexto(limpio)
        const valor = normalizarDecimal(limpio)
        onChange?.({ target: { value: valor }, currentTarget: { value: valor } })
      }}
    />
  )
}
