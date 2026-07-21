'use client'
import { useState, useEffect, useRef, useMemo } from 'react'

/**
 * Selector de tipo de prenda con BÚSQUEDA POR ESCRITURA.
 *
 * Sustituye a un <select> nativo que listaba los ~60 tipos del catálogo sin
 * forma de filtrar: había que recorrerlos a ojo, y en el celular es peor.
 * Además el "+ Agregar nuevo" quedaba al final de todo, después de los 60.
 *
 * - Se escribe y la lista se filtra al vuelo (sin acentos ni mayúsculas).
 * - "Crear" aparece ARRIBA en cuanto lo escrito no coincide exactamente.
 * - Navegable con flechas y Enter, para no obligar a soltar el teclado.
 */
export default function SelectorTipoPrenda({ valor, onChange, productos, onCrear, creando }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const cajaRef = useRef(null)
  const inputRef = useRef(null)

  // Buscar "algodon" tiene que encontrar "CAMISETA ALGODÓN", y "diseno" -> "DISEÑO".
  const norm = (s) => String(s ?? '')
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .trim()

  const filtrados = useMemo(() => {
    const q = norm(texto)
    const lista = (productos || []).map(p => p.NOMBRE)
    if (!q) return lista
    // Primero los que EMPIEZAN por lo escrito; después los que lo contienen.
    const empiezan = lista.filter(n => norm(n).startsWith(q))
    const contienen = lista.filter(n => !norm(n).startsWith(q) && norm(n).includes(q))
    return [...empiezan, ...contienen]
  }, [texto, productos])

  const exacto = filtrados.some(n => norm(n) === norm(texto))
  const puedeCrear = Boolean(texto.trim()) && !exacto

  useEffect(() => { setResaltado(0) }, [texto])

  // Cerrar al tocar fuera (en móvil el blur del input no alcanza).
  useEffect(() => {
    function fuera(e) {
      if (cajaRef.current && !cajaRef.current.contains(e.target)) {
        setAbierto(false)
        setTexto('')
      }
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('touchstart', fuera)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('touchstart', fuera)
    }
  }, [])

  function elegir(nombre) {
    onChange(nombre)
    setTexto('')
    setAbierto(false)
  }

  async function crear() {
    const nombre = texto.trim().toUpperCase()
    if (!nombre) return
    const ok = await onCrear(nombre)
    if (ok) { setTexto(''); setAbierto(false) }
  }

  // Las opciones incluyen "crear" como primera entrada navegable.
  const opciones = puedeCrear ? ['__crear__', ...filtrados] : filtrados

  function teclas(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setAbierto(true)
      setResaltado(i => Math.min(i + 1, opciones.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setResaltado(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const sel = opciones[resaltado]
      if (sel === '__crear__') crear()
      else if (sel) elegir(sel)
    } else if (e.key === 'Escape') {
      setAbierto(false); setTexto('')
    }
  }

  return (
    <div className="relative" ref={cajaRef}>
      <div
        onClick={() => { setAbierto(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className={`input flex items-center gap-2 cursor-text ${abierto ? 'ring-1 ring-mandarina-500' : ''}`}>
        {!abierto && valor
          ? <span className="flex-1 text-white truncate">{valor}</span>
          : (
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 min-w-0"
              placeholder={valor || 'Escribe para buscar…'}
              value={texto}
              onChange={e => { setTexto(e.target.value); setAbierto(true) }}
              onFocus={() => setAbierto(true)}
              onKeyDown={teclas}
            />
          )}
        {valor && !abierto && (
          <button type="button" title="Quitar"
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="text-gray-600 hover:text-white text-xs flex-shrink-0">✕</button>
        )}
        <span className="text-gray-600 text-xs flex-shrink-0">▾</span>
      </div>

      {abierto && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl">
          {/* Crear va PRIMERO: antes había que bajar los 60 productos para verlo. */}
          {puedeCrear && (
            <button type="button" disabled={creando}
              onMouseEnter={() => setResaltado(0)}
              onClick={crear}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800 disabled:opacity-50
                ${resaltado === 0 ? 'bg-mandarina-500/20' : 'hover:bg-gray-800'}`}>
              <span className="text-mandarina-400 text-sm font-semibold">
                {creando ? '⏳ Creando…' : `+ Crear "${texto.trim().toUpperCase()}"`}
              </span>
              <div className="text-xs text-gray-500">Se agrega al catálogo para todos</div>
            </button>
          )}

          {filtrados.length === 0 && !puedeCrear && (
            <div className="px-3 py-3 text-sm text-gray-500">Sin resultados</div>
          )}

          {filtrados.map((n, i) => {
            const idx = puedeCrear ? i + 1 : i
            return (
              <button key={n} type="button"
                onMouseEnter={() => setResaltado(idx)}
                onClick={() => elegir(n)}
                className={`w-full text-left px-3 py-2 text-sm truncate
                  ${idx === resaltado ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}
                  ${n === valor ? 'font-semibold text-mandarina-400' : ''}`}>
                {n}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
