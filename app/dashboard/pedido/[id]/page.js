'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ItemDetalle from '@/components/pedido/ItemDetalle'

// Estado labels updated
const ESTADO_LABELS = {
  'PENDIENTE_FABRICA': 'PENDIENTE ENVIAR A FÁBRICA',
  'EN_FABRICA': 'EN PRODUCCIÓN',
  'DESPACHO': 'DESPACHO',
  'ENTREGADO': 'ENTREGADO',
  'CANCELADO': 'CANCELADO',
}

export default function PedidoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const isNew = searchParams.get('nuevo') === '1'
  const fromHistorial = searchParams.get('from') === 'historial'
  const [user, setUser] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [logs, setLogs] = useState([])
  const [showBitacora, setShowBitacora] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    loadPedido()
  }, [])

  async function loadPedido() {
    try {
      const res = await fetch(`/api/pedidos?rol=ADMIN`)
      const data = await res.json()
      const p = data.pedidos?.find(p => p.PEDIDO_ID === params.id)
      if (!p) return
      setPedido(p)
      setItems(p.items || [])
      // Load client by ID
      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID || '')}`)
      const cd = await cr.json()
      setCliente(cd.clientes?.[0] || null)
      // Load logs
      const lr = await fetch(`/api/pedidos/logs?pedidoId=${params.id}`)
      const ld = await lr.json()
      setLogs(ld.logs || [])
    } finally { setLoading(false) }
  }

  async function generatePDF() {
    setGeneratingPdf(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const element = document.getElementById('pdf-render')
      if (!element) { alert('Error: contenido PDF no encontrado'); return }
      await html2pdf().set({
        margin: [8, 8, 8, 8],
        filename: `${pedido.PEDIDO_ID}.pdf`,
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(element).save()
    } catch(e) { alert('Error PDF: ' + e.message) }
    finally { setGeneratingPdf(false) }
  }

  function sendWhatsApp() {
    if (!cliente) { alert('No hay datos del cliente'); return }
    const cel = (cliente.CELULAR || '').replace(/\D/g, '')
    if (!cel) { alert('El cliente no tiene celular registrado'); return }
    const num = cel.startsWith('0') ? '593' + cel.slice(1) : '593' + cel
    const fecha = pedido.FECHA_ENTREGA_PROMETIDA
      ? new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })
      : 'por confirmar'
    const msg = encodeURIComponent(
      `Hola ${cliente.NOMBRE} 👋\n\n¡Tu pedido *${pedido.PEDIDO_ID}* ha sido registrado! 🎉\n\n` +
      `💰 Total: $${parseFloat(pedido.MONTO_TOTAL || 0).toFixed(2)}\n\nGracias por tu compra 🍊`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  async function updateEstado(nuevoEstado) {
    await fetch(`/api/pedidos/${pedido.PEDIDO_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ESTADO_PEDIDO: nuevoEstado }),
    })
    loadPedido()
  }

  if (loading || !pedido) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
  // readOnly: can't edit pedido-level data (status, address, payments)
  const readOnly = fromHistorial || user?.rol === 'VENDEDOR' || user?.rol === 'DISEÑO' || user?.rol === 'ESTAMPADO' || user?.rol === 'SUBLIMACION' || user?.rol === 'BORDADO' || user?.rol === 'DESPACHO'
  // canEditItems: can change subestado and notas_area on items (production roles)
  const canEditItems = !fromHistorial && (user?.rol === 'ADMIN' || user?.rol === 'DISEÑO' || user?.rol === 'ESTAMPADO' || user?.rol === 'SUBLIMACION' || user?.rol === 'BORDADO')
  const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
  const montoAbonado = parseFloat(pedido.MONTO_ABONADO || 0)
  const montoPendiente = montoTotal - montoAbonado

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.push('/dashboard/historial')} className="text-gray-500 hover:text-white p-1">←</button>
            <div className="flex-1">
              <h1 className="text-lg font-display font-bold text-white">{pedido.PEDIDO_ID}</h1>
              <div className="text-gray-500 text-xs">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊 Mandarina Republic' : '🏪 Indstore'}</div>
            </div>
            {isNew && <span className="badge bg-green-500/20 text-green-400">✅ Creado</span>}
          </div>

          {/* Status row in header */}
          <div className="flex items-center gap-3">
            {user?.rol === 'ADMIN' && !fromHistorial ? (
              <select className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5 flex-1"
                value={pedido.ESTADO_PEDIDO} onChange={e => updateEstado(e.target.value)}>
                {Object.entries(ESTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) : (
              <div className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 flex-1">
                {ESTADO_LABELS[pedido.ESTADO_PEDIDO] || pedido.ESTADO_PEDIDO}
              </div>
            )}
            <div className="flex gap-3 text-center">
              <div><div className="text-sm font-bold text-white">${montoTotal.toFixed(2)}</div><div className="text-xs text-gray-500">Total</div></div>
              <div><div className={`text-sm font-bold ${montoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>${montoPendiente.toFixed(2)}</div><div className="text-xs text-gray-500">Pendiente</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

          {/* New order banner */}
          {isNew && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="font-semibold text-green-400 mb-3">🎉 Pedido creado exitosamente</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={sendWhatsApp}
                  className="flex items-center gap-2 bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-600 transition-all">
                  📱 WhatsApp al cliente
                </button>
                <button onClick={generatePDF} disabled={generatingPdf}
                  className="flex items-center gap-2 bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-600 transition-all">
                  {generatingPdf ? '⏳...' : '⬇️ Descargar PDF'}
                </button>
                <Link href="/dashboard/nuevo-pedido"
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white transition-all">
                  ➕ Nuevo pedido
                </Link>
                <Link href="/dashboard"
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white transition-all">
                  🏠 Inicio
                </Link>
              </div>
            </div>
          )}

          {/* Cliente */}
          {cliente && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">👤 Cliente</h3>
              <div className="space-y-1.5 text-sm">
                {[['Nombre', cliente.NOMBRE], ['Cédula', cliente.CEDULA], ['Celular', cliente.CELULAR], ['Email', cliente.EMAIL]].map(([k, v]) =>
                  v ? <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="text-white">{v}</span></div> : null
                )}
                {(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO) && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">Dirección</span>
                    <span className="text-white text-right text-xs">{(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO)}</span>
                  </div>
                )}
                {pedido.LATITUD && (
                  <a href={`https://maps.google.com/?q=${pedido.LATITUD},${pedido.LONGITUD}`} target="_blank"
                    className="text-mandarina-400 text-xs hover:underline">📍 Ver en Google Maps</a>
                )}
              </div>
            </div>
          )}

          {/* Productos */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">👕 Productos ({items.length})</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {items.map(item => (
                <ItemDetalle key={item.ITEM_ID} item={item} readOnly={!canEditItems} tiendaColor={tiendaColor} user={user} loadPedido={loadPedido} />
              ))}
            </div>
          </div>

          {/* Notas del vendedor */}
          {pedido.NOTAS_VENDEDOR && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-2">📝 Notas internas</h3>
              <div className="text-sm text-gray-300 bg-gray-800/50 rounded-xl px-4 py-3">
                {pedido.NOTAS_VENDEDOR}
              </div>
            </div>
          )}

          {/* Entrega */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white mb-2">📦 Entrega</h3>
            <div className="text-sm text-gray-400">
              Fecha comprometida: <span className="text-white ml-2">
                {pedido.FECHA_ENTREGA_PROMETIDA
                  ? new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric'})
                  : '-'}
              </span>
            </div>
          </div>

          {/* Bitácora colapsable */}
          <div className="card overflow-hidden">
            <button onClick={() => setShowBitacora(b => !b)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-all">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">📋 Bitácora del pedido</span>
                {logs.length > 0 && (
                  <span className="text-xs text-gray-500">{logs.length} evento(s)</span>
                )}
              </div>
              <span className="text-gray-500 text-sm">{showBitacora ? '▲' : '▼'}</span>
            </button>

            {showBitacora && (
              <div className="border-t border-gray-800 px-4 py-3">
                {logs.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-4">
                    No hay eventos registrados aún
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-3 text-xs">
                        <div className="flex-shrink-0 w-1 bg-gray-700 rounded-full" />
                        <div className="flex-1 pb-3 border-b border-gray-800/50 last:border-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-600">{log.fecha?.split(' ')[0]}</span>
                            <span className="text-gray-600">{log.fecha?.split(' ')[1]}</span>
                            <span className="text-mandarina-400 font-medium">{log.usuario}</span>
                          </div>
                          <div className="text-gray-300">
                            {(() => {
                              const c = log.campo
                              if (c === 'CREACION') return '🆕 Pedido creado → EN PRODUCCIÓN'
                              if (c === 'ESTADO_PEDIDO') return `📦 Estado: ${log.antes} → ${log.despues}`
                              if (c === 'DIRECCION') return `📍 Dirección: ${log.despues}`
                              if (c === 'ITEM_AGREGADO') return `➕ Agregado: ${log.despues}`
                              if (c === 'ITEM_ELIMINADO') return `❌ Eliminado: ${log.antes}`
                              if (c === 'PAGO_AGREGADO') return `💰 Pago: ${log.despues}`
                              if (c.startsWith('SUBESTADO')) return `🔧 ${c}: ${log.antes} → ${log.despues}`
                              if (c.startsWith('EDICION')) return `✏️ ${c.replace('EDICION ','')} — ${log.despues}`
                              if (c.startsWith('NOTA')) return `📝 Nota ${c.replace('NOTA ','')}: ${log.despues}`
                              if (c === 'PRODUCTO_EDITADO') return `✏️ Renombrado: ${log.antes} → ${log.despues}`
                              return `${c}: ${log.despues}`
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {showPdfPreview && (
        <div className="fixed inset-0 bg-black/90 z-50 overflow-auto p-4" onClick={e => e.target === e.currentTarget && setShowPdfPreview(false)}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Vista previa — {pedido.PEDIDO_ID}</h3>
              <div className="flex gap-2">
                {(user?.rol === 'ADMIN' || user?.rol === 'VENDEDOR') && (
                  <button onClick={() => { setShowPdfPreview(false); generatePDF() }}
                    disabled={generatingPdf} className="btn-primary text-sm px-4 py-2">
                    {generatingPdf ? '⏳...' : '⬇️ Descargar'}
                  </button>
                )}
                <button onClick={() => setShowPdfPreview(false)} className="btn-secondary text-sm px-4 py-2">✕ Cerrar</button>
              </div>
            </div>
            <div className="bg-white rounded-xl overflow-hidden">
              <PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF for download */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '794px', backgroundColor: 'white' }}>
        <div id="pdf-render">
          <PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-3 flex gap-2">
        {user?.rol !== 'DISEÑO' && user?.rol !== 'ESTAMPADO' && user?.rol !== 'SUBLIMACION' && user?.rol !== 'BORDADO' && user?.rol !== 'DESPACHO' && (
          <button onClick={sendWhatsApp} className="btn-secondary flex-1 text-sm">📱 WhatsApp</button>
        )}
        <button onClick={() => setShowPdfPreview(true)} className="btn-secondary flex-1 text-sm">👁️ Ver PDF</button>
        {user?.rol === 'DESPACHO' && pedido?.ESTADO_PEDIDO !== 'ENTREGADO' && (
          <a href={`/dashboard/despacho`}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-1" style={{ backgroundColor: '#7C3AED' }}>
            🚚 Ir a despacho
          </a>
        )}
        {(user?.rol === 'ADMIN' || user?.rol === 'VENDEDOR') && (
          <button onClick={generatePDF} disabled={generatingPdf} className="btn-primary flex-1 text-sm" style={{ backgroundColor: tiendaColor }}>
            {generatingPdf ? '⏳...' : '⬇️ Descargar PDF'}
          </button>
        )}
      </div>
    </div>
  )
}

function PdfContent({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const montoTotal = parseFloat(pedido?.MONTO_TOTAL || 0)
  const montoPendiente = parseFloat(pedido?.MONTO_PENDIENTE || 0)
  const montoAbonado = parseFloat(pedido?.MONTO_ABONADO || 0)

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', backgroundColor: '#fff', padding: '12mm', width: '100%', fontSize: '11px' }}>
      <div style={{ backgroundColor: tiendaColor, height: '5px', marginBottom: '10px', borderRadius: '3px' }} />
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 'bold', color: tiendaColor }}>
          {esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}
        </h2>
        {esMandarina && (
          <>
            <p style={{ margin: '3px 0', fontSize: '12px', fontWeight: 'bold' }}>Hola {cliente?.NOMBRE || ''}</p>
            <p style={{ margin: '2px 0', fontSize: '13px', fontWeight: 'bold' }}>¡Gracias por tu compra! 🎉</p>
            <p style={{ margin: '2px 0', fontSize: '10px', color: '#555' }}>Cada prenda que hacemos está pensada para gente única como tú.</p>
            <p style={{ margin: '2px 0', fontSize: '10px', color: '#555' }}>Síguenos en @mandarinarepublicec y descubre más diseños.</p>
            <p style={{ margin: '5px 0', fontSize: '11px', fontWeight: 'bold', color: tiendaColor }}>💛 Tu confianza nos inspira 💛</p>
          </>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0', width: '22%' }}>NUM FACTURA</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{pedido?.PEDIDO_ID}</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0', width: '22%' }}>VENDEDOR</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{pedido?.VENDEDOR_ID || '-'}</td>
          </tr>
          <tr>
            <td colSpan={4} style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold' }}>
              ESTADO PAGO: {pedido?.ESTADO_PAGO === 'PAGADO' ? '🟢 Pagado' : pedido?.ESTADO_PAGO === 'ABONO' ? `🔴 Abono $${montoAbonado.toFixed(2)}, pendiente $${montoPendiente.toFixed(2)}` : `🔴 Pendiente $${montoTotal.toFixed(2)}`}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>NOMBRE CLIENTE</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{cliente?.NOMBRE || '-'}</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>CANTIDAD</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>CÉDULA</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{cliente?.CEDULA || '-'}</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>NÚMERO CELULAR</td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{cliente?.CELULAR || '-'}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>DIRECCIÓN ENTREGA</td>
            <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 6px' }}>{(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) || cliente?.DIRECCION || '-'}</td>
          </tr>
        </tbody>
      </table>
      <h4 style={{ textAlign: 'center', margin: '8px 0 6px', fontSize: '11px', fontWeight: 'bold' }}>Detalle de los productos solicitados</h4>
      {(items||[]).map((item, idx) => (
        <div key={idx} style={{ marginBottom: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e8e8e8' }}>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'left', width: '18%' }}>PRODUCTO</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', width: '50px' }}>FOTO</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', width: '11%' }}>COLOR</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', width: '6%' }}>CANT.</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', width: '6%' }}>TALLA</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>DISEÑO PECHO</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>DISEÑO ESPALDA</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>MANGA DERECHA</th>
                <th style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>MANGA IZQUIERDA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'top' }}>
                  {item.PRODUCTO_NOMBRE}<br/><span style={{ color: tiendaColor, fontSize: '9px' }}>{item.AREA}</span>
                </td>
                <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', verticalAlign: 'middle', width: '50px', height: '50px' }}>
                  {(item.FOTO_PECHO_URL && item.FOTO_PECHO_URL !== '')
                    ? <img src={item.FOTO_PECHO_URL} style={{ maxWidth: '46px', maxHeight: '46px', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                    : <span style={{ color: '#ccc', fontSize: '8px' }}>—</span>}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>{item.COLOR}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>{item.CANTIDAD}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>{item.TALLA}</td>
                {[item.FOTO_PECHO_URL, item.FOTO_ESPALDA_URL, item.FOTO_MANGA_D_URL, item.FOTO_MANGA_I_URL].map((url, i) => (
                  <td key={i} style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '50px', height: '50px', verticalAlign: 'middle' }}>
                    {url ? <img src={url} style={{ maxWidth: '46px', maxHeight: '46px', objectFit: 'contain', display: 'block', margin: '0 auto' }} /> : <span style={{ color: '#ccc', fontSize: '8px' }}>—</span>}
                  </td>
                ))}
              </tr>
              {item.DETALLE_PERSONALIZADO && (
                <tr>
                  <td colSpan={9} style={{ border: '1px solid #000', padding: '4px', fontSize: '9px' }}>
                    <strong>Detalles:</strong> {item.DETALLE_PERSONALIZADO}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{ marginTop: '10px', borderTop: '1px solid #ddd', paddingTop: '6px', textAlign: 'center', fontSize: '9px', color: '#888' }}>
        Pedido: {pedido?.FECHA_PEDIDO?.split(' ')[0] || '-'} · Entrega: {pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'}) : '-'}
      </div>
    </div>
  )
}
