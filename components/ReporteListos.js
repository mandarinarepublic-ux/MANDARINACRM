'use client'
// Al pie de Tablero: prendas que cada persona marcó LISTO, por día y área.
import { useEffect, useMemo, useState } from 'react'

const ICONO = { BORDADO: '🧵', SUBLIMACION: '🌈', ESTAMPADO: '🖨️' }
const DIA = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' })
}
// Día de calendario en Ecuador (UTC-5, sin horario de verano).
const diaEc = (ms) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10)

export default function ReporteListos() {
  const [dias, setDias] = useState(14)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    setDatos(null); setError('')
    fetch(`/api/reporte-areas?dias=${dias}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Error'); setDatos(j) })
      .catch((e) => setError(e.message))
  }, [dias])

  const { columnas, filas } = useMemo(() => {
    if (!datos) return { columnas: [], filas: [] }
    const cols = new Map()
    const porDia = new Map()
    for (const e of datos.eventos) {
      const col = `${e.area}|${e.nombre}`
      cols.set(col, { area: e.area, nombre: e.nombre })
      const dia = diaEc(new Date(e.fecha).getTime())
      if (!porDia.has(dia)) porDia.set(dia, {})
      const celdas = porDia.get(dia)
      if (!celdas[col]) celdas[col] = { prendas: new Set(), pedidos: new Set() }
      celdas[col].prendas.add(e.item_id)
      celdas[col].pedidos.add(e.pedido_id)
    }
    const todos = []
    for (let i = 0; i < dias; i++) {
      const d = diaEc(Date.now() - i * 86400e3)
      todos.push({ dia: d, celdas: porDia.get(d) || {} })
    }
    return { columnas: [...cols.entries()].sort((a, b) => a[0].localeCompare(b[0])), filas: todos }
  }, [datos, dias])

  const total = (col) => filas.reduce((s, f) => s + (f.celdas[col]?.prendas.size || 0), 0)

  if (error === 'Solo ADMIN') return null
  return (
    <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-bold text-white">✅ Lo que marcaron LISTO, por día</h2>
          <p className="text-[11px] text-gray-500">
            Prendas que cada persona pasó a LISTO a mano (no cuenta los cierres automáticos). Toca un número para ver los pedidos.
          </p>
        </div>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="input text-xs w-auto">
          {[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} días</option>)}
        </select>
      </div>
      {error && <div className="p-4 text-xs text-red-400">{error}</div>}
      {!datos && !error && <div className="p-4 text-xs text-gray-500">Cargando…</div>}
      {datos && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left px-3 py-2">Día</th>
                {columnas.map(([k, c]) => (
                  <th key={k} className="px-3 py-2 text-right">
                    {ICONO[c.area]} {c.area}
                    <div className="text-[10px] text-gray-500 font-normal">{c.nombre}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const domingo = new Date(f.dia + 'T12:00:00').getDay() === 0
                return (
                  <tr key={f.dia} className={`border-t border-gray-800 ${domingo ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-300 capitalize">{DIA(f.dia)}</td>
                    {columnas.map(([k]) => {
                      const c = f.celdas[k]
                      const n = c?.prendas.size || 0
                      const clave = `${f.dia}|${k}`
                      return (
                        <td key={k} className="px-3 py-1.5 text-right align-top">
                          {n ? (
                            <button onClick={() => setAbierto(abierto === clave ? null : clave)} className="text-white font-semibold hover:underline">
                              {n} <span className="text-gray-500 font-normal">({c.pedidos.size} ped.)</span>
                            </button>
                          ) : <span className={domingo ? 'text-gray-700' : 'text-red-400/70'}>0</span>}
                          {abierto === clave && <div className="text-[10px] text-gray-400 mt-1">{[...c.pedidos].join(', ')}</div>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr className="border-t border-gray-700 font-bold text-white">
                <td className="px-3 py-2">Total</td>
                {columnas.map(([k]) => <td key={k} className="px-3 py-2 text-right">{total(k)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
