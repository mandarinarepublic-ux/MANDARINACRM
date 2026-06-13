'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
  const [user, setUser] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [logs, setLogs] = useState([])

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
  const readOnly = user?.rol === 'VENDEDOR' || user?.rol === 'DISEÑO' || user?.rol === 'ESTAMPADO' || user?.rol === 'SUBLIMACION' || user?.rol === 'BORDADO'
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
            <select className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1.5 flex-1"
              value={pedido.ESTADO_PEDIDO} onChange={e => updateEstado(e.target.value)}>
              {Object.entries(ESTADO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
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
                <div key={item.ITEM_ID} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-sm font-medium text-white">{item.PRODUCTO_NOMBRE}</div>
                      <div className="text-xs text-gray-500">{item.COLOR} · {item.TALLA} · <span className="text-mandarina-400">{item.AREA}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white">{item.CANTIDAD}x ${parseFloat(item.PRECIO_UNIT||0).toFixed(2)}</div>
                      <div className="text-xs font-medium" style={{ color: tiendaColor }}>${parseFloat(item.SUBTOTAL||0).toFixed(2)}</div>
                    </div>
                  </div>
                  {item.DETALLE_PERSONALIZADO && (
                    <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 mb-2">{item.DETALLE_PERSONALIZADO}</div>
                  )}
                  {item.NOTAS_AREA && (
                    <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-2">
                      📝 Nota fábrica: {item.NOTAS_AREA}
                    </div>
                  )}
                  {(item.FOTO_PECHO_URL || item.FOTO_ESPALDA_URL || item.FOTO_MANGA_D_URL || item.FOTO_MANGA_I_URL) && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {[['FOTO_PECHO_URL','Pecho'],['FOTO_ESPALDA_URL','Espalda'],['FOTO_MANGA_D_URL','Manga Der.'],['FOTO_MANGA_I_URL','Manga Izq.']].map(([key,label]) =>
                        item[key] ? (
                          <a key={key} href={item[key]} target="_blank" className="flex flex-col items-center gap-1">
                            <img src={item[key]} className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                            <span className="text-xs text-gray-500">{label}</span>
                          </a>
                        ) : null
                      )}
                    </div>
                  )}
                  <div className="mt-2">
                    {!readOnly && (
                    <select className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-2 py-1"
                      value={item.SUBESTADO}
                      onChange={async e => {
                        await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ SUBESTADO: e.target.value }),
                        })
                        loadPedido()
                      }}>
                      {['SOLICITADO','EN_PROCESO','LISTO'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  )}
                  </div>
                </div>
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

          {/* Bitácora de cambios */}
          {logs.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">📋 Bitácora del pedido</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="text-xs border-l-2 border-gray-700 pl-3 py-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-gray-500">{log.fecha}</span>
                      <span className="text-mandarina-400 font-medium">{log.usuario}</span>
                    </div>
                    <div className="text-gray-300">
                      {(() => {
                        const c = log.campo
                        if (c === 'CREACION') return '🆕 Pedido creado → EN PRODUCCIÓN'
                        if (c === 'ESTADO_PEDIDO') return `📦 Estado: ${log.antes} → ${log.despues}`
                        if (c === 'DIRECCION') return `📍 Dirección actualizada: ${log.despues}`
                        if (c === 'ITEM_AGREGADO') return `➕ Producto agregado: ${log.despues}`
                        if (c === 'ITEM_ELIMINADO') return `❌ Eliminado: ${log.antes}`
                        if (c === 'PAGO_AGREGADO') return `💰 Pago: ${log.despues}`
                        if (c.startsWith('SUBESTADO')) return `🔧 ${c}: ${log.antes} → ${log.despues}`
                        if (c.startsWith('EDICION')) return `✏️ ${c}: ${log.despues}`
                        if (c.startsWith('NOTA')) return `📝 ${c}: ${log.despues}`
                        if (c.startsWith('PRODUCTO_EDITADO')) return `✏️ Producto: ${log.antes} → ${log.despues}`
                        return `${c}: ${log.despues}`
                      })()}
                    </div>
                  </div>
                ))}
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
        </div>
      </div>

      {/* Hidden PDF */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '794px', backgroundColor: 'white' }}>
        <div id="pdf-render">
          <PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
        </div>
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-3 flex gap-2">
        {user?.rol !== 'DISEÑO' && user?.rol !== 'ESTAMPADO' && user?.rol !== 'SUBLIMACION' && user?.rol !== 'BORDADO' && (
          <button onClick={sendWhatsApp} className="btn-secondary flex-1 text-sm">📱 WhatsApp</button>
        )}
        <button onClick={() => setShowPdfPreview(true)} className="btn-secondary flex-1 text-sm">👁️ Ver PDF</button>
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
