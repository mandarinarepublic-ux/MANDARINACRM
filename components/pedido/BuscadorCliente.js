'use client'
import { useState, useRef } from 'react'

export default function BuscadorCliente({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)
  const debounceRef = useRef(null)

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    setSeleccionado(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(() => buscar(val), 400)
  }

  async function buscar(q) {
    setLoading(true)
    try {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.clientes || [])
    } finally { setLoading(false) }
  }

  function select(c) {
    setSeleccionado(c)
    setQuery('')
    setResults([])
    onSelect({
      CLIENTE_ID: c.CLIENTE_ID || '',
      nombre:     c.NOMBRE     || '',
      cedula:     c.CEDULA     || '',
      celular:    c.CELULAR    || '',
      email:      c.EMAIL      || '',
      ciudad:     c.CIUDAD     || '',
      direccion:  c.DIRECCION  || '',
    })
  }

  return (
    <div className="relative mb-4">
      {seleccionado && (
        <div className="flex items-center justify-between bg-mandarina-500/10 border border-mandarina-500/30 rounded-xl px-4 py-2.5 mb-2">
          <div>
            <div className="text-sm text-white font-medium">{seleccionado.NOMBRE}</div>
            <div className="text-xs text-gray-400">{seleccionado.CEDULA} · {seleccionado.CELULAR}</div>
          </div>
          <button onClick={() => { setSeleccionado(null); setQuery('') }}
            className="text-gray-500 hover:text-white text-xs ml-4">✕ Cambiar</button>
        </div>
      )}
      {!seleccionado && (
        <div className="relative">
          <input className="input pl-9"
            placeholder="Buscar cliente existente (nombre, cédula, celular)..."
            value={query} onChange={handleChange}
            autoComplete="off" />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 card mt-1 divide-y divide-gray-800 shadow-xl max-h-48 overflow-y-auto">
              {results.map(c => (
                <button key={c.CLIENTE_ID} onClick={() => select(c)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors">
                  <div className="text-sm text-white font-medium">{c.NOMBRE}</div>
                  <div className="text-xs text-gray-500">
                    {c.CEDULA} · {c.CELULAR}{c.CIUDAD ? ` · ${c.CIUDAD}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
