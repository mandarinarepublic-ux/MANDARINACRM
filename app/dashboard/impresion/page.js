'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PdfGracias, PdfConfeccionPagina } from '@/components/pedido/PdfPedido'
import { parseFecha } from '@/lib/parseFecha'

const MAX_LOTE_IMPRESION = 30
const ITEMS_POR_PAGINA_CONF = 3

const H2C_OPTS = {
  scale: 2,
  useCORS: true,
  allowTaint: true,
  backgroundColor: '#ffffff',
  width: 794,
  windowWidth: 794,
  scrollX: 0,
  scrollY: 0,
  logging: false,
}

export default function ImpresionPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [printing, setPrinting] = useState(false)
  const [printProgress, setPrintProgress] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    loadPedidos()
  }, [])

  async function loadPedidos() {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const enFabrica = (data.pedidos || []).filter(p =>
        p.ESTADO_PEDIDO === 'EN_FABRICA' || p.ESTADO_PEDIDO === 'PENDIENTE_FABRICA'
      )
      setPedidos(enFabrica)
      // UNA sola lectura de toda la hoja CLIENTES. Antes se hacía un fetch por
      // pedido en paralelo (hasta 30), lo que saturaba Google Sheets (429) y
      // dejaba pedidos sin la sección de datos del cliente de forma aleatoria.
      const r = await fetch('/api/clientes?all=1')
      const d = await r.json()
      const map = {}
      for (const c of (d.clientes || [])) {
        if (c.CLIENTE_ID) map[c.CLIENTE_ID] = c
      }
      setClientesMap(map)
    } finally { setLoading(false) }
  }

  function toggleSelect(pedido) {
    const id = pedido.PEDIDO_ID
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); return next }
      if (next.size >= MAX_LOTE_IMPRESION) {
        alert(`Máximo ${MAX_LOTE_IMPRESION} pedidos por lote de impresión.`)
        return prev
      }
      if (pedido.FECHA_IMPRESION_PRODUCCION) {
        const ok = window.confirm(
          `⚠️ ESTE PEDIDO YA FUE IMPRESO PARA PRODUCCIÓN\n\n` +
          `${pedido.PEDIDO_ID}\n` +
          `Impreso: ${pedido.FECHA_IMPRESION_PRODUCCION}\n` +
          `Por: ${pedido.IMPRESO_POR || '—'}\n\n` +
          `¿Seguro que deseas reimprimirlo?`
        )
        if (!ok) return prev
      }
      next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size > 0) { setSelected(new Set()); return }
    const sinImprimir = filtered.filter(p => !p.FECHA_IMPRESION_PRODUCCION)
    let candidatos = sinImprimir
    if (sinImprimir.length === 0 && filtered.length > 0) {
      const ok = window.confirm(`Los ${filtered.length} pedido(s) YA fueron impresos. ¿Reimprimirlos?`)
      if (!ok) return
      candidatos = filtered
    }
    if (candidatos.length > MAX_LOTE_IMPRESION) {
      alert(`Se seleccionan los primeros ${MAX_LOTE_IMPRESION} (máximo por lote).`)
    }
    setSelected(new Set(candidatos.slice(0, MAX_LOTE_IMPRESION).map(p => p.PEDIDO_ID)))
  }

  const filtered = pedidos.filter(p => {
    if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
    if (fechaDesde) {
      const fp = parseFecha(p.FECHA_PEDIDO)
      if (fp && fp < new Date(fechaDesde)) return false
    }
    if (fechaHasta) {
      const fp = parseFecha(p.FECHA_PEDIDO)
      const hasta = new Date(fechaHasta)
      hasta.setHours(23,59,59)
      if (fp && fp > hasta) return false
    }
    if (busqueda) {
      const q = busqueda.toLowerCase().replace(/[\s-]/g, '')
      const c = clientes[p.CLIENTE_ID] || {}
      const campos = [p.PEDIDO_ID, c.NOMBRE, c.CEDULA, c.CELULAR]
      if (!campos.some(v => v && String(v).toLowerCase().replace(/[\s-]/g, '').includes(q))) return false
    }
    return true
  })

  // Captura un elemento por ID y lo agrega al PDF
  async function capturarElemento(html2canvas, pdf, elementId, esPrimera) {
    const el = document.getElementById(elementId)
    if (!el) return esPrimera
    // Esperar un tick para asegurar que el elemento esté pintado
    await new Promise(r => setTimeout(r, 50))
    const canvas = await html2canvas(el, H2C_OPTS)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    if (!esPrimera) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
    canvas.width = 1; canvas.height = 1
    return false // ya no es primera
  }

  async function printSelected() {
    if (selected.size === 0) return
    setPrinting(true)
    setPrintProgress('Preparando...')
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default

      const ids = Array.from(selected)
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      let esPrimera = true
      let paginaActual = 0

      // Calcular total de páginas para el progreso
      const totalPaginas = ids.reduce((sum, id) => {
        const p = pedidos.find(x => x.PEDIDO_ID === id)
        const nItems = p?.items?.length || 0
        const pagConf = Math.max(1, Math.ceil(nItems / ITEMS_POR_PAGINA_CONF))
        return sum + 1 + pagConf // 1 gracias + N confeccion
      }, 0)

      for (const pedidoId of ids) {
        // ── Hoja gracias (cliente) ──
        paginaActual++
        setPrintProgress(`Generando ${paginaActual}/${totalPaginas}...`)
        esPrimera = await capturarElemento(html2canvas, pdf, `pdf-${pedidoId}-gracias`, esPrimera)

        // ── Hojas confección (una por cada sub-página) ──
        const pedido = pedidos.find(x => x.PEDIDO_ID === pedidoId)
        const nItems = pedido?.items?.length || 0
        const nPagConf = Math.max(1, Math.ceil(nItems / ITEMS_POR_PAGINA_CONF))

        for (let pi = 0; pi < nPagConf; pi++) {
          paginaActual++
          setPrintProgress(`Generando ${paginaActual}/${totalPaginas}...`)
          esPrimera = await capturarElemento(html2canvas, pdf, `pdf-${pedidoId}-conf-${pi}`, esPrimera)
        }
      }

      pdf.save(`pedidos_${new Date().toISOString().split('T')[0]}.pdf`)

      // Registrar impresión secuencial
      setPrintProgress('Registrando impresión...')
      let usuario = {}
      try { usuario = JSON.parse(localStorage.getItem('mp_user') || '{}') } catch {}
      const usuarioId = usuario.nombre || usuario.id || 'SISTEMA'
      const ahora = new Date().toLocaleDateString('es-EC', { day:'2-digit', month:'short', year:'numeric' })

      for (let i = 0; i < ids.length; i++) {
        setPrintProgress(`Registrando ${i + 1}/${ids.length}...`)
        await fetch(`/api/pedidos/${ids[i]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcarImpreso: true, _usuarioId: usuarioId }),
        }).catch(() => {})
        if (i < ids.length - 1) await new Promise(r => setTimeout(r, 350))
      }

      setPedidos(prev => prev.map(p =>
        ids.includes(p.PEDIDO_ID)
          ? { ...p, FECHA_IMPRESION_PRODUCCION: ahora, IMPRESO_POR: usuarioId }
          : p
      ))
      setSelected(new Set())
    } catch(e) {
      alert('Error PDF: ' + e.message)
    } finally {
      setPrinting(false)
      setPrintProgress('')
    }
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-display font-bold text-white">🖨️ Imprimir Pedidos</h1>
              <p className="text-xs text-gray-500">Pedidos en producción</p>
            </div>
            <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-sm">← Volver</button>
          </div>

          <input className="input mb-2" placeholder="Buscar por pedido, nombre, cédula o celular..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="label">Tienda</label>
              <select className="input py-2 text-sm" value={filtroTienda} onChange={e => setFiltroTienda(e.target.value)}>
                <option value="TODAS">Todas las tiendas</option>
                <option value="MANDARINA">🍊 Mandarina Republic</option>
                <option value="INDSTORE">🏪 Indstore</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input py-2 text-sm" value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input py-2 text-sm" value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroTienda('TODAS'); setBusqueda('') }}
                className="btn-ghost text-xs w-full py-2.5">Limpiar filtros</button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <button onClick={selectAll} className="text-sm text-mandarina-400 hover:text-mandarina-300">
              {selected.size > 0 ? 'Deseleccionar todos' : 'Seleccionar todos (sin imprimir)'}
            </button>
            <span className={`text-xs ${selected.size >= MAX_LOTE_IMPRESION ? 'text-amber-400 font-semibold' : 'text-gray-500'}`}>
              {filtered.length} pedido(s) · {selected.size}/{MAX_LOTE_IMPRESION} seleccionado(s)
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600">
              <div className="text-3xl mb-3">🏭</div>No hay pedidos con estos filtros
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const cliente = clientes[p.CLIENTE_ID] || {}
                const isSelected = selected.has(p.PEDIDO_ID)
                const yaImpreso = !!p.FECHA_IMPRESION_PRODUCCION
                return (
                  <button key={p.PEDIDO_ID} onClick={() => toggleSelect(p)}
                    className={`w-full card p-4 flex items-center gap-4 transition-all text-left
                      ${isSelected ? 'border-mandarina-500 bg-mandarina-500/5' : yaImpreso ? 'border-amber-700/40' : 'hover:border-gray-700'}`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isSelected ? 'bg-mandarina-500 border-mandarina-500' : 'border-gray-600'}`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                        <span className="text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        <span className={`badge text-xs ${p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'EN PRODUCCIÓN' : 'PEND. FÁBRICA'}
                        </span>
                        {yaImpreso && (
                          <span className="badge text-xs bg-amber-500/20 text-amber-400" title={`Impreso por ${p.IMPRESO_POR || '—'}`}>
                            🖨️ Ya impreso · {p.FECHA_IMPRESION_PRODUCCION?.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {cliente.NOMBRE || '...'} · {p.items?.length || 0} prendas · ${parseFloat(p.MONTO_TOTAL||0).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 flex-shrink-0">
                      {p.FECHA_PEDIDO?.split(' ')[0] || '-'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4">
        <button onClick={printSelected} disabled={selected.size === 0 || printing}
          className="btn-primary w-full flex items-center justify-center gap-2"
          style={{ opacity: selected.size === 0 ? 0.5 : 1 }}>
          {printing ? `⏳ ${printProgress || 'Preparando...'}` : `🖨️ Imprimir ${selected.size > 0 ? `${selected.size} pedido(s)` : ''}`}
        </button>
        {selected.size === 0 && <p className="text-center text-gray-600 text-xs mt-2">Selecciona al menos un pedido</p>}
      </div>

      {/* Zona de render oculto — cada página tiene su propio ID atómico.
          La paginación de confección se hace aquí con chunkArray, no dentro
          del componente, para que cada sub-página sea un div independiente
          que html2canvas capture por separado sin hojas en blanco. */}
      <div style={{ position:'fixed', top:'-9999px', left:'-9999px', width:'794px', backgroundColor:'white', fontFamily:"'Helvetica Neue', Arial, sans-serif" }}>
        {pedidos.filter(p => selected.has(p.PEDIDO_ID)).map(pedido => {
          const cliente = clientes[pedido.CLIENTE_ID] || {}
          const items = pedido.items || []
          const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
          const chunks = chunkArray(items, ITEMS_POR_PAGINA_CONF)
          const totalPagConf = Math.max(chunks.length, 1)

          return (
            <div key={pedido.PEDIDO_ID}>
              {/* Hoja gracias — 1 por pedido */}
              <div id={`pdf-${pedido.PEDIDO_ID}-gracias`} style={{ width:'794px' }}>
                <PdfGracias pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
              </div>

              {/* Hojas confección — 1 div atómico por sub-página */}
              {(chunks.length === 0 ? [[]] : chunks).map((pageItems, pIdx) => (
                <div key={pIdx} id={`pdf-${pedido.PEDIDO_ID}-conf-${pIdx}`} style={{ width:'794px' }}>
                  <PdfConfeccionPagina
                    pedido={pedido}
                    items={pageItems}
                    tiendaColor={tiendaColor}
                    paginaActual={pIdx + 1}
                    totalPaginas={totalPagConf}
                    offsetIdx={pIdx * ITEMS_POR_PAGINA_CONF}
                    esUltimaPagina={pIdx === totalPagConf - 1}
                  />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
