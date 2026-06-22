'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PdfGracias, PdfConfeccion } from '@/components/pedido/PdfPedido'
import { parseFecha } from '@/lib/parseFecha'

// Máximo recomendado de pedidos por lote de impresión.
// Antes esto evitaba que html2canvas generara un canvas gigante (y saliera en
// blanco al superar el límite de píxeles del navegador). Ahora el render es
// página-por-página, así que el límite ya no es una restricción técnica dura —
// es un tope de cortesía para no congelar el navegador con loops muy largos
// (cada página tarda ~1-2s en renderizarse).
const MAX_LOTE_IMPRESION = 30

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
      const map = {}
      await Promise.all(enFabrica.map(async p => {
        if (!p.CLIENTE_ID || map[p.CLIENTE_ID]) return
        const r = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID)}`)
        const d = await r.json()
        if (d.clientes?.[0]) map[p.CLIENTE_ID] = d.clientes[0]
      }))
      setClientesMap(map)
    } finally { setLoading(false) }
  }

  // Recibe el pedido completo (no solo el id) para poder chequear si ya se imprimió antes
  function toggleSelect(pedido) {
    const id = pedido.PEDIDO_ID
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= MAX_LOTE_IMPRESION) {
        alert(`Máximo ${MAX_LOTE_IMPRESION} pedidos por lote de impresión.\n\nImprime este lote primero y continúa con el resto — así evitamos que el navegador se congele generando demasiadas páginas de una sola vez.`)
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
      const ok = window.confirm(
        `Los ${filtered.length} pedido(s) con estos filtros YA fueron impresos antes.\n\n¿Deseas reimprimirlos todos?`
      )
      if (!ok) return
      candidatos = filtered
    }

    if (candidatos.length > MAX_LOTE_IMPRESION) {
      alert(`Hay ${candidatos.length} pedidos disponibles. Por seguridad se seleccionan solo los primeros ${MAX_LOTE_IMPRESION} (máximo por lote). Imprime este lote y luego continúa con el resto.`)
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
      const match = campos.some(v => v && String(v).toLowerCase().replace(/[\s-]/g, '').includes(q))
      if (!match) return false
    }
    return true
  })

  async function printSelected() {
    if (selected.size === 0) return
    setPrinting(true)
    setPrintProgress('Preparando...')
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default

      const ids = Array.from(selected)
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const totalPaginas = ids.length * 2
      let paginaActual = 0
      let esPrimera = true

      // Render PÁGINA POR PÁGINA (no todo el lote en un solo canvas gigante).
      // Esto evita el límite de tamaño de canvas del navegador que causaba
      // PDFs en blanco al seleccionar muchos pedidos.
      for (const pedidoId of ids) {
        for (const sufijo of ['gracias', 'confeccion']) {
          paginaActual++
          setPrintProgress(`Generando página ${paginaActual}/${totalPaginas}...`)
          const el = document.getElementById(`pdf-page-${pedidoId}-${sufijo}`)
          if (!el) continue

          const canvas = await html2canvas(el, {
            scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
          })
          const imgData = canvas.toDataURL('image/jpeg', 0.92)

          if (!esPrimera) pdf.addPage()
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297)
          esPrimera = false

          // Liberar el canvas de memoria antes de seguir con la siguiente página
          canvas.width = 1
          canvas.height = 1
        }
      }

      pdf.save(`pedidos_${new Date().toISOString().split('T')[0]}.pdf`)

      // Marcar los pedidos como impresos para producción (para alertar reimpresiones futuras)
      setPrintProgress('Registrando impresión...')
      let usuario = {}
      try { usuario = JSON.parse(localStorage.getItem('mp_user') || '{}') } catch {}
      await Promise.all(ids.map(id =>
        fetch(`/api/pedidos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marcarImpreso: true, _usuarioId: usuario.nombre || usuario.id || 'SISTEMA' }),
        }).catch(() => {})
      ))

      setSelected(new Set())
      await loadPedidos() // refresca para que se vean los badges de "ya impreso"
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

          {/* Filters */}
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
            <div className="col-span-1">
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

      {/* PDFs ocultos renderizados con el nuevo diseño.
          Cada hoja tiene su propio id único (pdf-page-{ID}-gracias / -confeccion)
          para poder capturarla con html2canvas de forma INDIVIDUAL en printSelected(),
          en vez de un solo canvas gigante con todo el lote. */}
      <div style={{position:'fixed',top:'-9999px',left:'-9999px',width:'794px',backgroundColor:'white'}}>
        {pedidos.filter(p => selected.has(p.PEDIDO_ID)).map(pedido => {
          const cliente = clientes[pedido.CLIENTE_ID] || {}
          const items = pedido.items || []
          const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
          return (
            <div key={pedido.PEDIDO_ID}>
              <div id={`pdf-page-${pedido.PEDIDO_ID}-gracias`}>
                <PdfGracias pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
              </div>
              <div id={`pdf-page-${pedido.PEDIDO_ID}-confeccion`}>
                <PdfConfeccion pedido={pedido} items={items} tiendaColor={tiendaColor} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
