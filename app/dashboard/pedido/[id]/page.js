'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function PedidoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const isNew = searchParams.get('nuevo') === '1'
  const [user, setUser] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [items, setItems] = useState([])
  const [pagos, setPagos] = useState([])
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)

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
      setPagos(p.pagos || [])

      // Load client
      const cr = await fetch(`/api/clientes?q=${p.CLIENTE_ID}`)
      const cd = await cr.json()
      setCliente(cd.clientes?.[0] || null)
    } finally {
      setLoading(false)
    }
  }

  async function generatePDF() {
    setGeneratingPdf(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const element = document.getElementById('pdf-content')
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `${pedido.PEDIDO_ID}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(element).save()
    } finally {
      setGeneratingPdf(false)
    }
  }

  async function sendWhatsApp() {
    if (!cliente) return
    const cel = cliente.CELULAR?.replace(/\D/g,'')
    const msg = encodeURIComponent(
      `Hola ${cliente.NOMBRE} 👋\n\nTu pedido *${pedido.PEDIDO_ID}* ha sido registrado.\n\n` +
      `Total: $${parseFloat(pedido.MONTO_TOTAL||0).toFixed(2)}\n` +
      `Entrega estimada: ${new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC', {day:'numeric',month:'long'})}\n\n` +
      `¡Gracias por tu compra! 🍊`
    )
    window.open(`https://wa.me/593${cel?.replace(/^0/,'')}?text=${msg}`, '_blank')
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

  const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#1A1A2E'
  const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
  const montoAbonado = parseFloat(pedido.MONTO_ABONADO || 0)
  const montoPendiente = montoTotal - montoAbonado

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pt-2">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1">←</button>
        <div>
          <h1 className="text-xl font-display font-bold text-white">{pedido.PEDIDO_ID}</h1>
          <div className="text-gray-500 text-xs">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊 Mandarina Republic' : '🏪 Indstore'}</div>
        </div>
        {isNew && (
          <span className="ml-auto badge bg-green-500/20 text-green-400">✅ Creado</span>
        )}
      </div>

      {/* Status */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">Estado del pedido</span>
          <select
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1"
            value={pedido.ESTADO_PEDIDO}
            onChange={e => updateEstado(e.target.value)}>
            {['PENDIENTE_FABRICA','EN_FABRICA','DESPACHO','ENTREGADO','CANCELADO'].map(e => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-white">${montoTotal.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">${montoAbonado.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Abonado</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${montoPendiente > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              ${montoPendiente.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">Pendiente</div>
          </div>
        </div>
      </div>

      {/* Cliente */}
      {cliente && (
        <div className="card p-4 mb-4">
          <h3 className="text-sm font-semibold text-white mb-3">👤 Cliente</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Nombre</span><span className="text-white">{cliente.NOMBRE}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cédula</span><span className="text-white">{cliente.CEDULA}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Celular</span><span className="text-white">{cliente.CELULAR}</span></div>
            {cliente.EMAIL && <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-white">{cliente.EMAIL}</span></div>}
            {pedido.DIRECCION_TEXTO && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 shrink-0">Dirección</span>
                <span className="text-white text-right">{pedido.DIRECCION_TEXTO}</span>
              </div>
            )}
            {pedido.LATITUD && (
              <a href={`https://maps.google.com/?q=${pedido.LATITUD},${pedido.LONGITUD}`} target="_blank"
                className="flex items-center gap-1 text-mandarina-400 text-xs hover:underline">
                📍 Ver en Google Maps
              </a>
            )}
          </div>
        </div>
      )}

      {/* Productos */}
      <div className="card mb-4">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">👕 Productos ({items.length})</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {items.map(item => (
            <div key={item.ITEM_ID} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-sm font-medium text-white">{item.PRODUCTO_NOMBRE}</div>
                  <div className="text-xs text-gray-500">{item.COLOR} · {item.TALLA} · {item.AREA}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white">{item.CANTIDAD}x ${parseFloat(item.PRECIO_UNIT||0).toFixed(2)}</div>
                  <div className="text-xs text-mandarina-400">${parseFloat(item.SUBTOTAL||0).toFixed(2)}</div>
                </div>
              </div>
              {item.DETALLE_PERSONALIZADO && (
                <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2 mb-2">{item.DETALLE_PERSONALIZADO}</div>
              )}
              {/* Fotos */}
              {(item.FOTO_PECHO_URL || item.FOTO_ESPALDA_URL) && (
                <div className="flex gap-2 mt-2">
                  {[['FOTO_PECHO_URL','P'],['FOTO_ESPALDA_URL','E'],['FOTO_MANGA_D_URL','MD'],['FOTO_MANGA_I_URL','MI']].map(([key,label]) =>
                    item[key] ? (
                      <a key={key} href={item[key]} target="_blank"
                        className="w-12 h-12 rounded-lg overflow-hidden border border-gray-700 relative">
                        <img src={item[key]} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-center text-xs">{label}</div>
                      </a>
                    ) : null
                  )}
                </div>
              )}
              <div className="mt-2">
                <select
                  className="bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-2 py-1"
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
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entrega */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-white mb-3">📦 Entrega</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Días prometidos</span>
            <span className="text-white">{pedido.DIAS_ENTREGA_PROMETIDO} días</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha comprometida</span>
            <span className="text-white">
              {pedido.FECHA_ENTREGA_PROMETIDA
                ? new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric'})
                : '-'}
            </span>
          </div>
          {pedido.ALERTA_ENTREGA === 'TRUE' && (
            <div className="text-yellow-400 text-xs">⚠️ Fecha por debajo del mínimo recomendado</div>
          )}
        </div>
      </div>

      {/* Hidden PDF content */}
      <div id="pdf-content" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
      </div>

      {/* Actions - fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-4 flex gap-2">
        <button onClick={sendWhatsApp} className="btn-secondary flex-1 text-sm">
          📱 WhatsApp
        </button>
        <button onClick={generatePDF} disabled={generatingPdf} className="btn-primary flex-1 text-sm"
          style={{ backgroundColor: tiendaColor }}>
          {generatingPdf ? '⏳ Generando...' : '📄 PDF'}
        </button>
      </div>
    </div>
  )
}

function PdfContent({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', backgroundColor: '#fff', width: '190mm', padding: '5mm' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <div style={{ backgroundColor: tiendaColor, height: '8px', marginBottom: '12px', borderRadius: '4px' }} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
          {esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}
        </h2>
        {esMandarina && (
          <p style={{ margin: '6px 0', fontSize: '12px', color: '#555' }}>
            Hola {cliente?.NOMBRE}<br/>
            <strong>¡Gracias por tu compra! 🎉</strong><br/>
            <span style={{ fontSize: '11px' }}>Cada prenda que hacemos está pensada para gente única como tú.</span><br/>
            <span style={{ fontSize: '11px' }}>Síguenos en @mandarinarepublicec y descubre más diseños.</span><br/>
            <strong style={{ color: tiendaColor }}>💛 Tu confianza nos inspira 💛</strong>
          </p>
        )}
      </div>

      {/* Pedido info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '11px' }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5', width: '25%' }}>NUM FACTURA</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{pedido?.PEDIDO_ID}</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5', width: '20%' }}>VENDEDOR</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{pedido?.VENDEDOR_ID}</td>
          </tr>
          <tr>
            <td colSpan={4} style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>
              ESTADO PAGO: {pedido?.ESTADO_PAGO === 'ABONO'
                ? `🔴 Abono, monto pendiente $${parseFloat(pedido?.MONTO_PENDIENTE||0).toFixed(2)}`
                : pedido?.ESTADO_PAGO === 'PAGADO' ? '🟢 Pagado' : '🔴 Pendiente'}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>NOMBRE CLIENTE</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{cliente?.NOMBRE}</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>CANTIDAD</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{items.reduce((s,i) => s + parseInt(i.CANTIDAD||1), 0)}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>CÉDULA</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{cliente?.CEDULA}</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>NÚMERO CELULAR</td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{cliente?.CELULAR}</td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>DIRECCIÓN ENTREGA</td>
            <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 8px' }}>{pedido?.DIRECCION_TEXTO || cliente?.DIRECCION}</td>
          </tr>
        </tbody>
      </table>

      {/* Productos */}
      <h4 style={{ textAlign: 'center', margin: '10px 0', fontSize: '12px', fontWeight: 'bold' }}>
        Detalle de los productos solicitados
      </h4>
      {items.map((item, idx) => (
        <table key={idx} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: '#e0e0e0' }}>
              <th style={{ border: '1px solid #000', padding: '3px', width: '20%' }}>PRODUCTO</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '15%' }}>COLOR</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '8%' }}>CANT.</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '8%' }}>TALLA</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>DISEÑO PECHO</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>DISEÑO ESPALDA</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>MANGA DER.</th>
              <th style={{ border: '1px solid #000', padding: '3px' }}>MANGA IZQ.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #000', padding: '4px', verticalAlign: 'top' }}>
                {item.PRODUCTO_NOMBRE}<br/>
                <span style={{ color: tiendaColor, fontSize: '9px' }}>{item.AREA}</span>
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>{item.COLOR}</td>
              <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>{item.CANTIDAD}</td>
              <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>{item.TALLA}</td>
              {[item.FOTO_PECHO_URL, item.FOTO_ESPALDA_URL, item.FOTO_MANGA_D_URL, item.FOTO_MANGA_I_URL].map((url, i) => (
                <td key={i} style={{ border: '1px solid #000', padding: '2px', textAlign: 'center', width: '50px', height: '50px' }}>
                  {url ? <img src={url} style={{ maxWidth: '45px', maxHeight: '45px', objectFit: 'contain' }} crossOrigin="anonymous" /> : ''}
                </td>
              ))}
            </tr>
            {item.DETALLE_PERSONALIZADO && (
              <tr>
                <td colSpan={8} style={{ border: '1px solid #000', padding: '4px', fontSize: '9px' }}>
                  <strong>Detalles:</strong> {item.DETALLE_PERSONALIZADO}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ))}
    </div>
  )
}
