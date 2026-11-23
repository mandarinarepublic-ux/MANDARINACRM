'use client'
import { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react'
import { tiposParecidos } from '@/lib/tiposParecidos'

/**
 * Selector de tipo de prenda con BÚSQUEDA POR ESCRITURA.
 *
 * - Se escribe y la lista se filtra al vuelo (sin acentos ni mayúsculas).
 * - Navegable con flechas y Enter, para no obligar a soltar el teclado.
 *
 * ☠️ 7-oct-2026: "Crear" iba PRIMERO y ya resaltado, así que escribir
 * `HOODIE PREM` + Enter CREABA "HOODIE PREM" en vez de elegir HOODIE PREMIUM.
 * Así nació medio catálogo (BUZ, CAMISETA P, HOODIE CON, HOODIEPREMIU…): 346
 * tipos activos, 10 versiones de HOODIE PREMIUM. Ahora:
 *   · Enter elige la PRIMERA COINCIDENCIA; "Crear" va AL FINAL.
 *   · Si lo escrito se parece a uno que ya existe, se sugiere ese antes.
 *   · Solo un ADMIN puede crear (`permitirCrear`). La API lo exige igual.
 *
 * ☠️ La barra de desplazamiento no se ve (en el celular no existe, y en la
 * compu era gris oscuro sobre gris oscuro), así que parecía que no había más
 * opciones. Por eso el pie "↓ N más · desliza".
 *
 * Teclado (21-nov-2026): cerrado y con valor, lo que se veía era un <div> con
 * onClick — no se podía llegar con Tab. Ahora es un <button> que abre la
 * lista; la caja de texto es un combobox que anuncia la opción resaltada, y
 * Escape cierra y devuelve el foco al botón.
 *
 * `id` es el de la etiqueta de afuera (<label htmlFor>): va al control que esté
 * a la vista, botón o caja de texto.
 */
export default function SelectorTipoPrenda({ id, valor, onChange, productos, onCrear, creando, permitirCrear = false }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const [ocultasAbajo, setOcultasAbajo] = useState(0)
  const cajaRef = useRef(null)
  const inputRef = useRef(null)
  const listaRef = useRef(null)
  const botonRef = useRef(null)
  const uid = useId()
  const idLista = `${uid}-lista`
  const idOpcion = (idx) => `${uid}-op-${idx}`

  // Buscar "algodon" tiene que encontrar "CAMISETA ALGODÓN", y "diseno" -> "DISEÑO".
  const norm = (s) => String(s ?? '')
    .toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .trim()

  const todos = useMemo(() => (productos || []).map(p => p.NOMBRE), [productos])

  const filtrados = useMemo(() => {
    const q = norm(texto)
    if (!q) return todos
    // Primero los que EMPIEZAN por lo escrito; después los que lo contienen.
    const empiezan = todos.filter(n => norm(n).startsWith(q))
    const contienen = todos.filter(n => !norm(n).startsWith(q) && norm(n).includes(q))
    return [...empiezan, ...contienen]
  }, [texto, todos])

  const exacto = filtrados.some(n => norm(n) === norm(texto))
  const hayTexto = Boolean(texto.trim())

  // "HODIE PREMIUM" no CONTIENE "HOODIE PREMIUM", así que el filtro no lo
  // encuentra: lo que se parece se sugiere aparte, antes de ofrecer crear.
  const sugeridos = useMemo(() => {
    if (!hayTexto || exacto) return []
    return tiposParecidos(texto, todos).filter(n => !filtrados.includes(n))
  }, [texto, todos, filtrados, hayTexto, exacto])

  const ofreceCrear = permitirCrear && hayTexto && !exacto

  // Orden de navegación: coincidencias → sugeridos → crear (SIEMPRE al final).
  const opciones = [...filtrados, ...sugeridos, ...(ofreceCrear ? ['__crear__'] : [])]

  useEffect(() => { setResaltado(0) }, [texto])

  // Cuántas opciones quedan por debajo de lo visible.
  const medir = useCallback(() => {
    const el = listaRef.current
    if (!el) return setOcultasAbajo(0)
    const fila = el.querySelector('[data-opcion]')
    const alto = fila?.offsetHeight || 36
    const resto = el.scrollHeight - el.scrollTop - el.clientHeight
    setOcultasAbajo(resto > 4 ? Math.max(1, Math.ceil(resto / alto)) : 0)
  }, [])

  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(medir, 0)
    return () => clearTimeout(t)
  }, [abierto, filtrados.length, sugeridos.length, ofreceCrear, medir])

  // Al moverse con flechas, la opción resaltada tiene que quedar a la vista.
  useEffect(() => {
    const el = listaRef.current?.querySelector(`[data-idx="${resaltado}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [resaltado])

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

  // Al cerrar con valor elegido vuelve el botón: el foco se le devuelve para
  // que con teclado no se pierda el lugar en el formulario.
  function devolverFoco() {
    setTimeout(() => (botonRef.current || inputRef.current)?.focus(), 0)
  }

  function abrir() {
    setAbierto(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function elegir(nombre) {
    onChange(nombre)
    setTexto('')
    setAbierto(false)
    devolverFoco()
  }

  async function crear() {
    const nombre = texto.trim().toUpperCase()
    if (!nombre || !permitirCrear) return
    const ok = await onCrear(nombre)
    if (ok) { setTexto(''); setAbierto(false) }
  }

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
      // Solo "consume" Escape si había algo abierto: así no cierra de paso un
      // modal que esté detrás.
      if (abierto || texto) e.stopPropagation()
      setAbierto(false); setTexto('')
      if (valor) devolverFoco()
    }
  }

  // Cerrado con valor: flecha abajo / Enter / Espacio abren la lista.
  function teclasBoton(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir() }
  }

  const claseOpcion = (idx, n) => `w-full text-left px-3 py-2 text-sm truncate
    ${idx === resaltado ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800'}
    ${n === valor ? 'font-semibold text-mandarina-400' : ''}`

  const idxCrear = filtrados.length + sugeridos.length

  const mostrarBoton = !abierto && !!valor

  return (
    <div className="relative" ref={cajaRef}>
      {/* El clic en el recuadro (fuera del botón o la caja) sigue abriendo, como
          antes; el teclado entra por el <button> o el <input>. El anillo se ve
          con el foco en cualquiera de los dos (focus-within). */}
      <div
        onClick={abrir}
        className={`input flex items-center gap-2 cursor-text focus-within:ring-1 focus-within:ring-mandarina-500 ${abierto ? 'ring-1 ring-mandarina-500' : ''}`}>
        {mostrarBoton
          ? (
            <button type="button" id={id} ref={botonRef}
              aria-haspopup="listbox" aria-expanded={false}
              onClick={e => { e.stopPropagation(); abrir() }}
              onKeyDown={teclasBoton}
              className="flex-1 min-w-0 text-left text-white truncate outline-none sin-contorno">
              {valor}
            </button>
          )
          : (
            <input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-expanded={abierto}
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={abierto && opciones[resaltado] !== undefined ? idOpcion(resaltado) : undefined}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="flex-1 bg-transparent outline-none text-white placeholder-gray-600 min-w-0 sin-contorno"
              placeholder={valor || 'Escribe para buscar…'}
              value={texto}
              onChange={e => { setTexto(e.target.value); setAbierto(true) }}
              onFocus={() => setAbierto(true)}
              onKeyDown={teclas}
            />
          )}
        {mostrarBoton && (
          <button type="button" title="Quitar" aria-label={`Quitar ${valor}`}
            onClick={e => { e.stopPropagation(); onChange(''); setTimeout(() => inputRef.current?.focus(), 0) }}
            className="text-gray-600 hover:text-white text-xs flex-shrink-0 -my-2 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors">
            <span aria-hidden="true">✕</span>
          </button>
        )}
        <span className="text-gray-600 text-xs flex-shrink-0" aria-hidden="true">▾</span>
      </div>

      {abierto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] text-gray-500 border-b border-gray-800" aria-live="polite">
            {hayTexto
              ? `${filtrados.length} ${filtrados.length === 1 ? 'coincidencia' : 'coincidencias'}`
              : `${todos.length} tipos de prenda`}
          </div>

          <div ref={listaRef} onScroll={medir} id={idLista} role="listbox" aria-label="Tipos de prenda"
            className="lista-desplegable max-h-64 overflow-y-auto overscroll-contain">
            {filtrados.map((n, idx) => (
              <button key={n} type="button" data-opcion data-idx={idx}
                id={idOpcion(idx)} role="option" aria-selected={idx === resaltado} tabIndex={-1}
                onMouseEnter={() => setResaltado(idx)}
                onClick={() => elegir(n)}
                className={claseOpcion(idx, n)}>
                {n}
              </button>
            ))}

            {sugeridos.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[11px] text-yellow-400/90 border-t border-gray-800">
                  ¿Quisiste decir…?
                </div>
                {sugeridos.map((n, i) => {
                  const idx = filtrados.length + i
                  return (
                    <button key={`s-${n}`} type="button" data-opcion data-idx={idx}
                      id={idOpcion(idx)} role="option" aria-selected={idx === resaltado} tabIndex={-1}
                      onMouseEnter={() => setResaltado(idx)}
                      onClick={() => elegir(n)}
                      className={claseOpcion(idx, n)}>
                      {n}
                    </button>
                  )
                })}
              </>
            )}

            {filtrados.length === 0 && sugeridos.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-500">Sin resultados</div>
            )}

            {/* Crear va AL FINAL: arriba y resaltado, un Enter creaba tipos mal escritos. */}
            {ofreceCrear && (
              <button type="button" disabled={creando} data-opcion data-idx={idxCrear}
                id={idOpcion(idxCrear)} role="option" aria-selected={resaltado === idxCrear} tabIndex={-1}
                onMouseEnter={() => setResaltado(idxCrear)}
                onClick={crear}
                className={`w-full text-left px-3 py-2.5 border-t border-gray-800 disabled:opacity-50
                  ${resaltado === idxCrear ? 'bg-mandarina-500/20' : 'hover:bg-gray-800'}`}>
                <span className="text-mandarina-400 text-sm font-semibold">
                  {creando ? '⏳ Creando…' : `+ Crear "${texto.trim().toUpperCase()}"`}
                </span>
                <div className="text-xs text-gray-500">
                  {sugeridos.length > 0
                    ? '⚠️ Se parece a uno que ya existe. Revisa antes de crear.'
                    : 'Se agrega al catálogo para todos'}
                </div>
              </button>
            )}

            {hayTexto && !exacto && !permitirCrear && (
              <div className="px-3 py-2.5 text-xs text-gray-500 border-t border-gray-800">
                ¿No está? Elige el más parecido y anota el detalle abajo, o pídele a un ADMIN que lo cree.
              </div>
            )}
          </div>

          {ocultasAbajo > 0 && (
            <button type="button" tabIndex={-1}
              onClick={() => listaRef.current?.scrollBy({ top: listaRef.current.clientHeight * 0.8, behavior: 'smooth' })}
              className="w-full px-3 py-1.5 text-[11px] text-mandarina-400 bg-gray-950/80 border-t border-gray-800 text-center">
              ↓ {ocultasAbajo} más · desliza para ver
            </button>
          )}
        </div>
      )}
    </div>
  )
}
