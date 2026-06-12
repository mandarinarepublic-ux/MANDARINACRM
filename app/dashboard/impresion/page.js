'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ImpresionPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [printing, setPrinting] = useState(false)
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

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(p => p.PEDIDO_ID)))
  }

  // Parse fecha from format "01Jun2026 23:59:00" or ISO
  function parseFecha(str) {
    if (!str) return null
    if (str.includes('T') || str.match(/^\d{4}-/)) return new Date(str)
    // Format: 01Jun2026 23:59:00
    const months = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11}
    const m = str.match(/^(\d{2})([A-Za-z]{3})(\d{4})/)
    if (!m) return null
    return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]))
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
      const q = busqueda.toLowerCase()
      if (!p.PEDIDO_ID?.toLowerCase().includes(q) &&
          !clientes[p.CLIENTE_ID]?.NOMBRE?.toLowerCase().includes(q)) return false
    }
    return true
  })

  async function printSelected() {
    if (selected.size === 0) return
    setPrinting(true)
    const selectedPedidos = pedidos.filter(p => selected.has(p.PEDIDO_ID))

    const html = selectedPedidos.map(pedido => {
      const cliente = clientes[pedido.CLIENTE_ID] || {}
      const items = pedido.items || []
      const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
      const esMandarina = pedido.TIENDA_ID === 'MANDARINA'
      const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
      const montoPendiente = parseFloat(pedido.MONTO_PENDIENTE || 0)
      const montoAbonado = parseFloat(pedido.MONTO_ABONADO || 0)

      const productosHTML = items.map(item => `
        <div style="margin-bottom:8px">
          <table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead>
              <tr style="background:#e8e8e8">
                <th style="border:1px solid #000;padding:3px 4px;text-align:left;width:18%">PRODUCTO</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center;width:50px">FOTO</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center;width:11%">COLOR</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center;width:6%">CANT.</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center;width:6%">TALLA</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center">DISEÑO PECHO</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center">DISEÑO ESPALDA</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center">MANGA DERECHA</th>
                <th style="border:1px solid #000;padding:3px 4px;text-align:center">MANGA IZQUIERDA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border:1px solid #000;padding:4px;vertical-align:top">${item.PRODUCTO_NOMBRE}<br><span style="color:${tiendaColor};font-size:9px">${item.AREA}</span></td>
                <td style="border:1px solid #000;padding:2px;text-align:center;vertical-align:middle;width:50px;height:50px">
                  ${item.FOTO_PECHO_URL?`<img src="${item.FOTO_PECHO_URL}" style="max-width:46px;max-height:46px;object-fit:contain;display:block;margin:0 auto">`:'<span style="color:#ccc;font-size:8px">—</span>'}
                </td>
                <td style="border:1px solid #000;padding:4px;text-align:center;vertical-align:middle">${item.COLOR||''}</td>
                <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;vertical-align:middle">${item.CANTIDAD}</td>
                <td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;vertical-align:middle">${item.TALLA||''}</td>
                ${[item.FOTO_PECHO_URL,item.FOTO_ESPALDA_URL,item.FOTO_MANGA_D_URL,item.FOTO_MANGA_I_URL].map(url =>
                  `<td style="border:1px solid #000;padding:2px;text-align:center;width:50px;height:50px;vertical-align:middle">
                    ${url?`<img src="${url}" style="max-width:46px;max-height:46px;object-fit:contain;display:block;margin:0 auto">`:'<span style="color:#ccc;font-size:8px">—</span>'}
                  </td>`
                ).join('')}
              </tr>
              ${item.DETALLE_PERSONALIZADO?`<tr><td colspan="9" style="border:1px solid #000;padding:4px;font-size:9px"><strong>Detalles:</strong> ${item.DETALLE_PERSONALIZADO}</td></tr>`:''}
            </tbody>
          </table>
        </div>`).join('')

      return `
        <div style="page-break-after:always;font-family:Arial,sans-serif;padding:12mm;font-size:11px;color:#000;background:#fff">
          <div style="background:${tiendaColor};height:5px;margin-bottom:10px;border-radius:3px"></div>
          <div style="text-align:center;margin-bottom:10px">
            <h2 style="margin:0 0 4px;font-size:15px;font-weight:bold;color:${tiendaColor}">${esMandarina?'MANDARINA REPUBLIC':'INDSTORE'}</h2>
            ${esMandarina?`
              <p style="margin:3px 0;font-size:12px;font-weight:bold">Hola ${cliente.NOMBRE||''}</p>
              <p style="margin:2px 0;font-size:13px;font-weight:bold">¡Gracias por tu compra! 🎉</p>
              <p style="margin:2px 0;font-size:10px;color:#555">Cada prenda que hacemos está pensada para gente única como tú.</p>
              <p style="margin:2px 0;font-size:10px;color:#555">Síguenos en @mandarinarepublicec y descubre más diseños.</p>
              <p style="margin:5px 0;font-size:11px;font-weight:bold;color:${tiendaColor}">💛 Tu confianza nos inspira 💛</p>`:''}
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
            <tr>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0;width:22%">NUM FACTURA</td>
              <td style="border:1px solid #000;padding:4px 6px">${pedido.PEDIDO_ID}</td>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0;width:22%">VENDEDOR</td>
              <td style="border:1px solid #000;padding:4px 6px">${pedido.VENDEDOR_ID||'-'}</td>
            </tr>
            <tr>
              <td colspan="4" style="border:1px solid #000;padding:4px 6px;font-weight:bold">
                ESTADO PAGO: ${pedido.ESTADO_PAGO==='PAGADO'?'🟢 Pagado':pedido.ESTADO_PAGO==='ABONO'?`🔴 Abono $${montoAbonado.toFixed(2)}, pendiente $${montoPendiente.toFixed(2)}`:`🔴 Pendiente $${montoTotal.toFixed(2)}`}
              </td>
            </tr>
            <tr>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0">NOMBRE CLIENTE</td>
              <td style="border:1px solid #000;padding:4px 6px">${cliente.NOMBRE||'-'}</td>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0">CANTIDAD</td>
              <td style="border:1px solid #000;padding:4px 6px">${items.reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)}</td>
            </tr>
            <tr>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0">CÉDULA</td>
              <td style="border:1px solid #000;padding:4px 6px">${cliente.CEDULA||'-'}</td>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0">NÚMERO CELULAR</td>
              <td style="border:1px solid #000;padding:4px 6px">${cliente.CELULAR||'-'}</td>
            </tr>
            <tr>
              <td style="border:1px solid #000;padding:4px 6px;font-weight:bold;background:#f0f0f0">DIRECCIÓN ENTREGA</td>
              <td colspan="3" style="border:1px solid #000;padding:4px 6px">${pedido.DIRECCION_TEXTO||cliente.DIRECCION||'-'}</td>
            </tr>
          </table>
          <h4 style="text-align:center;margin:8px 0 6px;font-size:11px;font-weight:bold">Detalle de los productos solicitados</h4>
          ${productosHTML}
          <div style="margin-top:10px;border-top:1px solid #ddd;padding-top:6px;text-align:center;font-size:9px;color:#888">
            Pedido: ${pedido.FECHA_PEDIDO?.split(' ')[0]||'-'} · Entrega: ${pedido.FECHA_ENTREGA_PROMETIDA?new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'}):'-'}
          </div>
        </div>`
    }).join('')

    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><title>Pedidos</title><style>@media print{body{margin:0}}body{margin:0;background:white}</style></head><body>${html}<script>window.onload=()=>{window.print()}<\/script></body></html>`)
    win.document.close()
    setPrinting(false)
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
          <input className="input mb-2" placeholder="Buscar por ID o cliente..."
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
              {selected.size === filtered.length && filtered.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
            <span className="text-xs text-gray-500">{filtered.length} pedido(s) · {selected.size} seleccionado(s)</span>
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
                return (
                  <button key={p.PEDIDO_ID} onClick={() => toggleSelect(p.PEDIDO_ID)}
                    className={`w-full card p-4 flex items-center gap-4 transition-all text-left
                      ${isSelected ? 'border-mandarina-500 bg-mandarina-500/5' : 'hover:border-gray-700'}`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isSelected ? 'bg-mandarina-500 border-mandarina-500' : 'border-gray-600'}`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium text-white">{p.PEDIDO_ID}</span>
                        <span className="text-xs">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        <span className={`badge text-xs ${p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {p.ESTADO_PEDIDO === 'EN_FABRICA' ? 'EN PRODUCCIÓN' : 'PEND. FÁBRICA'}
                        </span>
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
          {printing ? '⏳ Preparando...' : `🖨️ Imprimir ${selected.size > 0 ? `${selected.size} pedido(s)` : ''}`}
        </button>
        {selected.size === 0 && <p className="text-center text-gray-600 text-xs mt-2">Selecciona al menos un pedido</p>}
      </div>
    </div>
  )
}
