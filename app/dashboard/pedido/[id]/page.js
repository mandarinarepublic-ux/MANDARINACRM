'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ItemDetalle from '@/components/pedido/ItemDetalle'
import { ESTADO_LABELS, ESTADO_LABELS_LARGO } from '@/lib/labels'

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
      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID || '')}`)
      const cd = await cr.json()
      setCliente(cd.clientes?.[0] || null)
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
      if (!element) { alert('Error: PDF no encontrado'); return }
      await html2pdf().set({
        margin: [8,8,8,8], filename: `${pedido.PEDIDO_ID}.pdf`,
        html2canvas: { scale:2, useCORS:true, allowTaint:true, backgroundColor:'#ffffff' },
        jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
      }).from(element).save()
    } catch(e) { alert('Error PDF: ' + e.message) }
    finally { setGeneratingPdf(false) }
  }

  function sendWhatsApp() {
    if (!cliente) { alert('No hay datos del cliente'); return }
    const cel = (cliente.CELULAR || '').replace(/\D/g, '')
    if (!cel) { alert('El cliente no tiene celular'); return }
    const num = cel.startsWith('0') ? '593' + cel.slice(1) : '593' + cel
    const msg = encodeURIComponent(
      `Hola ${cliente.NOMBRE} 👋\n\n¡Tu pedido *${pedido.PEDIDO_ID}* ha sido registrado! 🎉\n\n` +
      `💰 Total: $${parseFloat(pedido.MONTO_TOTAL||0).toFixed(2)}\n\nGracias por tu compra 🍊`
    )
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank')
  }

  async function updateEstado(nuevoEstado) {
    await fetch(`/api/pedidos/${pedido.PEDIDO_ID}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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
  const readOnly = fromHistorial || user?.rol === 'VENDEDOR' || user?.rol === 'DISEÑO' || user?.rol === 'ESTAMPADO' || user?.rol === 'SUBLIMACION' || user?.rol === 'BORDADO' || user?.rol === 'DESPACHO'
  const canEditItems = user?.rol === 'ADMIN' || ['DISEÑO','ESTAMPADO','SUBLIMACION','BORDADO'].includes(user?.rol)
  const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
  const montoAbonado = parseFloat(pedido.MONTO_ABONADO || 0)
  const montoPendiente = montoTotal - montoAbonado
  const tieneGuia = !!(pedido.GUIA_NUMERO)

  // Banners de estado con colores claros
  const BANNERS = {
    PENDIENTE_FABRICA: { bg:'bg-yellow-500/10 border-yellow-500/30', icon:'⏳', color:'text-yellow-400', label:'Pendiente Fábrica' },
    EN_FABRICA:        { bg:'bg-blue-500/10 border-blue-500/30',     icon:'🏭', color:'text-blue-400',   label:'En Producción' },
    DESPACHO:          { bg:'bg-purple-500/10 border-purple-500/30', icon:'🚚', color:'text-purple-400', label:'En Despacho' },
    COMPLETADO:        { bg:'bg-green-500/15 border-green-500/50',   icon:'✅', color:'text-green-400',  label:'Completado' },
    ENTREGADO:         { bg:'bg-green-500/10 border-green-500/30',   icon:'✅', color:'text-green-400',  label:'Entregado' },
    CANCELADO:         { bg:'bg-red-500/10 border-red-500/30',       icon:'❌', color:'text-red-400',    label:'Cancelado' },
  }
  const banner = BANNERS[pedido.ESTADO_PEDIDO] || BANNERS.EN_FABRICA

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* Header sticky */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1 text-lg">←</button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-display font-bold text-white">{pedido.PEDIDO_ID}</h1>
                <span>{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
              </div>
              <div className="text-gray-500 text-xs">{pedido.TIENDA_ID === 'MANDARINA' ? 'Mandarina Republic' : 'Indstore'}</div>
            </div>
            {isNew && <span className="badge bg-green-500/20 text-green-400 text-xs">✅ Creado</span>}
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-bold text-white">${montoTotal.toFixed(2)}</div>
              <div className={`text-xs font-medium ${montoPendiente > 0.01 ? 'text-yellow-400' : 'text-green-400'}`}>
                {montoPendiente > 0.01 ? `Debe $${montoPendiente.toFixed(2)}` : '✓ Pagado'}
              </div>
            </div>
          </div>

          {/* Banner de estado — grande y claro */}
          {user?.rol === 'ADMIN' && !fromHistorial ? (
            <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2.5"
              value={pedido.ESTADO_PEDIDO} onChange={e => updateEstado(e.target.value)}>
              {Object.entries(ESTADO_LABELS_LARGO).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          ) : (
            <div className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 ${banner.bg}`}>
              <span className="text-2xl">{banner.icon}</span>
              <span className={`font-bold text-base ${banner.color}`}>{banner.label}</span>
              {tieneGuia && (
                <span className="ml-auto text-xs text-gray-400 font-mono">
                  Guía #{pedido.GUIA_NUMERO}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

          {/* Banner nuevo */}
          {isNew && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="font-semibold text-green-400 mb-3">🎉 Pedido creado exitosamente</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={sendWhatsApp} className="flex items-center gap-2 bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-600">📱 WhatsApp</button>
                <button onClick={generatePDF} disabled={generatingPdf} className="flex items-center gap-2 bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl">{generatingPdf?'⏳...':'⬇️ PDF'}</button>
                <Link href="/dashboard/nuevo-pedido" className="text-sm px-4 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white">➕ Nuevo</Link>
              </div>
            </div>
          )}

          {/* ── GUÍA DE DESPACHO — bloque verde prominente ── */}
          {tieneGuia && (
            <div className="bg-green-500/10 border-2 border-green-500/40 rounded-2xl p-4">
              <div className="flex items-start gap-4">
                <div className="text-4xl">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-green-400 font-bold uppercase tracking-wide mb-1">
                    Pedido completado · Guía registrada
                  </div>
                  <div className="text-white font-mono font-bold text-xl mb-0.5">
                    # {pedido.GUIA_NUMERO}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {pedido.GUIA_TRANSPORTISTA}
                    {pedido.GUIA_FECHA && <span> · Despachado el {pedido.GUIA_FECHA.split(' ')[0]}</span>}
                  </div>
                </div>
                {pedido.GUIA_FOTO_URL && (
                  <img
                    src={pedido.GUIA_FOTO_URL}
                    onClick={() => window.open(pedido.GUIA_FOTO_URL, '_blank')}
                    className="w-20 h-20 rounded-xl object-cover border-2 border-green-500/40 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    title="Ver comprobante"
                  />
                )}
              </div>
            </div>
          )}

          {/* Cliente */}
          {cliente && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-3">👤 Cliente</h3>
              <div className="space-y-1.5 text-sm">
                {[['Nombre',cliente.NOMBRE],['Cédula',cliente.CEDULA],['Celular',cliente.CELULAR],['Email',cliente.EMAIL]].map(([k,v])=>
                  v ? <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="text-white">{v}</span></div> : null
                )}
                {(pedido.DIRECCION_TEXTO||pedido.DIRECCION_PEDIDO) && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">Dirección</span>
                    <span className="text-white text-right text-xs">{pedido.DIRECCION_TEXTO||pedido.DIRECCION_PEDIDO}</span>
                  </div>
                )}
                {pedido.LATITUD && <a href={`https://maps.google.com/?q=${pedido.LATITUD},${pedido.LONGITUD}`} target="_blank" className="text-mandarina-400 text-xs hover:underline">📍 Ver en Google Maps</a>}
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
                <ItemDetalle key={item.ITEM_ID} item={item} readOnly={!canEditItems} canChangeSubestado={canEditItems && !fromHistorial} tiendaColor={tiendaColor} user={user} loadPedido={loadPedido} />
              ))}
            </div>
          </div>

          {/* Notas vendedor */}
          {pedido.NOTAS_VENDEDOR && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-white mb-2">📝 Notas internas</h3>
              <div className="text-sm text-gray-300 bg-gray-800/50 rounded-xl px-4 py-3">{pedido.NOTAS_VENDEDOR}</div>
            </div>
          )}

          {/* Entrega */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white mb-2">📦 Entrega</h3>
            <div className="text-sm text-gray-400">
              Fecha comprometida:
              <span className="text-white ml-2">
                {pedido.FECHA_ENTREGA_PROMETIDA
                  ? new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})
                  : '-'}
              </span>
            </div>
          </div>

          {/* Bitácora */}
          <div className="card overflow-hidden">
            <button onClick={() => setShowBitacora(b=>!b)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-all">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">📋 Bitácora</span>
                {logs.length > 0 && <span className="text-xs text-gray-500">{logs.length} evento(s)</span>}
              </div>
              <span className="text-gray-500">{showBitacora?'▲':'▼'}</span>
            </button>
            {showBitacora && (
              <div className="border-t border-gray-800 px-4 py-3">
                {logs.length === 0
                  ? <div className="text-xs text-gray-600 text-center py-4">Sin eventos</div>
                  : <div className="space-y-3 max-h-80 overflow-y-auto">
                      {logs.map((log,i)=>(
                        <div key={i} className="flex gap-3 text-xs">
                          <div className="flex-shrink-0 w-1 bg-gray-700 rounded-full" />
                          <div className="flex-1 pb-3 border-b border-gray-800/50 last:border-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-gray-600">{log.fecha?.split(' ')[0]}</span>
                              <span className="text-gray-600">{log.fecha?.split(' ')[1]}</span>
                              <span className="text-mandarina-400 font-medium">{log.usuario}</span>
                            </div>
                            <div className="text-gray-300">
                              {(()=>{
                                const c=log.campo
                                if(c==='CREACION') return '🆕 Pedido creado → EN PRODUCCIÓN'
                                if(c==='ESTADO_PEDIDO') return `📦 Estado: ${log.antes} → ${log.despues}`
                                if(c==='GUIA_DESPACHO') return `✅ Guía registrada: ${log.despues}`
                                if(c==='DIRECCION') return `📍 Dirección actualizada`
                                if(c==='ITEM_AGREGADO') return `➕ Ítem agregado: ${log.despues}`
                                if(c==='ITEM_ELIMINADO') return `❌ Ítem eliminado: ${log.antes}`
                                if(c==='PAGO_AGREGADO') return `💰 Pago: ${log.despues}`
                                if(c.startsWith('SUBESTADO')) return `🔧 ${c.replace('SUBESTADO ','')}: ${log.antes} → ${log.despues}`
                                if(c.startsWith('EDICION')) return `✏️ ${c.replace('EDICION ','')} editado`
                                if(c.startsWith('NOTA')) return `📝 Nota: ${log.despues}`
                                return `${c}: ${log.despues}`
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF modal */}
      {showPdfPreview && (
        <div className="fixed inset-0 bg-black/90 z-50 overflow-auto p-4" onClick={e=>e.target===e.currentTarget&&setShowPdfPreview(false)}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">{pedido.PEDIDO_ID}</h3>
              <div className="flex gap-2">
                {(user?.rol==='ADMIN'||user?.rol==='VENDEDOR')&&<button onClick={()=>{setShowPdfPreview(false);generatePDF()}} disabled={generatingPdf} className="btn-primary text-sm px-4 py-2">{generatingPdf?'⏳...':'⬇️ Descargar'}</button>}
                <button onClick={()=>setShowPdfPreview(false)} className="btn-secondary text-sm px-4 py-2">✕</button>
              </div>
            </div>
            <div className="bg-white rounded-xl overflow-hidden">
              <PdfGracias pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
              <PdfConfeccion pedido={pedido} items={items} tiendaColor={tiendaColor} />
            </div>
          </div>
        </div>
      )}
      <div style={{position:'fixed',top:'-9999px',left:'-9999px',width:'794px',backgroundColor:'white'}}>
        <div id="pdf-render">
          <PdfGracias pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
          <PdfConfeccion pedido={pedido} items={items} tiendaColor={tiendaColor} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-3 flex gap-2">
        {!['DISEÑO','ESTAMPADO','SUBLIMACION','BORDADO','DESPACHO'].includes(user?.rol) && (
          <button onClick={sendWhatsApp} className="btn-secondary flex-1 text-sm">📱 WhatsApp</button>
        )}
        <button onClick={()=>setShowPdfPreview(true)} className="btn-secondary flex-1 text-sm">👁️ Ver PDF</button>
        {user?.rol==='DESPACHO'&&pedido?.ESTADO_PEDIDO!=='COMPLETADO'&&(
          <Link href="/dashboard/despacho" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1" style={{backgroundColor:'#7C3AED'}}>🚚 Ir a despacho</Link>
        )}
        {(user?.rol==='ADMIN'||user?.rol==='VENDEDOR')&&(
          <button onClick={generatePDF} disabled={generatingPdf} className="btn-primary flex-1 text-sm" style={{backgroundColor:tiendaColor}}>
            {generatingPdf?'⏳...':'⬇️ PDF'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── HOJA 1: AGRADECIMIENTO AL CLIENTE ──────────────────────────────────────
function PdfGracias({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const montoTotal = parseFloat(pedido?.MONTO_TOTAL||0)
  const montoPendiente = parseFloat(pedido?.MONTO_PENDIENTE||0)
  const montoAbonado = parseFloat(pedido?.MONTO_ABONADO||0)
  const pagado = pedido?.ESTADO_PAGO === 'PAGADO'
  const nombreCorto = cliente?.NOMBRE?.split(' ')[0] || 'Cliente'

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#fff',
      width: '794px',
      minHeight: '1123px',
      position: 'relative',
      overflow: 'hidden',
      pageBreakAfter: 'always',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ═══ PANEL SUPERIOR — EXTERIOR DE LA CARTA (lo que ve el motorizado) ═══ */}
      {/* Ocupa el tercio superior — cuando la hoja se dobla en 3, esto queda afuera */}
      <div style={{
        backgroundColor: tiendaColor,
        minHeight: '374px', // 1/3 de la página
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 60px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Círculos decorativos de fondo */}
        <div style={{ position:'absolute', top:'-60px', right:'-60px', width:'200px', height:'200px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.07)' }} />
        <div style={{ position:'absolute', bottom:'-40px', left:'-40px', width:'160px', height:'160px', borderRadius:'50%', backgroundColor:'rgba(255,255,255,0.07)' }} />

        <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px' }}>
            {esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}
          </div>
          <div style={{ fontSize: '42px', fontWeight: '900', color: '#fff', lineHeight: 1.1, marginBottom: '16px' }}>
            ¡Gracias,<br />{nombreCorto}!
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', maxWidth: '400px', lineHeight: 1.6 }}>
            {esMandarina
              ? 'Tu pedido fue confeccionado con mucho cariño. Esperamos que lo disfrutes tanto como nosotros disfrutamos haciéndolo.'
              : 'Tu pedido fue preparado especialmente para ti. ¡Gracias por elegirnos!'}
          </div>
          <div style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255,255,255,0.6)', letterSpacing: '1px' }}>
            {esMandarina ? '🟧 mandarinaec.com' : '🛒 indstore.ec'}
          </div>
        </div>
      </div>

      {/* Línea de doblez */}
      <div style={{ borderTop: '2px dashed #e5e5e5', margin: '0', position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '-8px', backgroundColor: '#fff', padding: '0 8px', fontSize: '9px', color: '#ccc', letterSpacing: '1px' }}>DOBLAR AQUÍ</div>
      </div>

      {/* ═══ PANEL INFERIOR — INTERIOR DE LA CARTA ═══ */}
      <div style={{ flex: 1, padding: '28px 48px 80px' }}>

        {/* INFO DE ENVÍO — destacada, clara para el motorizado */}
        <div style={{ backgroundColor: '#1a1a1a', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Datos de envío</div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#fff', marginBottom: '12px', lineHeight: 1.1 }}>
            {cliente?.NOMBRE || '-'}
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {cliente?.CELULAR && (
              <div style={{ backgroundColor: '#2a2a2a', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '18px' }}>📱</div>
                <div>
                  <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Celular</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', fontFamily: 'monospace' }}>{cliente.CELULAR}</div>
                </div>
              </div>
            )}
            {cliente?.CEDULA && (
              <div style={{ backgroundColor: '#2a2a2a', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '18px' }}>🆔</div>
                <div>
                  <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Cédula</div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff', fontFamily: 'monospace' }}>{cliente.CEDULA}</div>
                </div>
              </div>
            )}
          </div>
          {(pedido?.DIRECCION_TEXTO || pedido?.DIRECCION_PEDIDO) && (
            <div style={{ backgroundColor: tiendaColor + '20', borderRadius: '10px', padding: '12px 16px', borderLeft: `4px solid ${tiendaColor}` }}>
              <div style={{ fontSize: '9px', color: tiendaColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', fontWeight: '700' }}>Dirección de entrega</div>
              <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600', lineHeight: 1.5 }}>
                {(pedido.DIRECCION_TEXTO || pedido.DIRECCION_PEDIDO).replace(/\n/g, ' · ')}
              </div>
            </div>
          )}
        </div>

        {/* PRODUCTOS — sin precios, sin detalle de texto */}
        <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' }}>
          Contenido del pedido · {(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)} prenda(s)
        </div>

        {(items||[]).map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '16px', marginBottom: '12px', padding: '12px', backgroundColor: '#fafafa', borderRadius: '12px', border: '1px solid #f0f0f0', alignItems: 'center' }}>
            {/* Foto */}
            <div style={{ flexShrink: 0 }}>
              {item.FOTO_PECHO_URL
                ? <img src={item.FOTO_PECHO_URL} style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} />
                : <div style={{ width: '70px', height: '70px', backgroundColor: '#eee', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#bbb' }}>Sin foto</div>
              }
            </div>
            {/* Info — SIN precios, SIN detalle de texto */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>{item.PRODUCTO_NOMBRE}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {item.COLOR && <span style={{ fontSize: '11px', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '20px', color: '#555' }}>Color: <strong>{item.COLOR}</strong></span>}
                {item.TALLA && <span style={{ fontSize: '11px', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '20px', color: '#555' }}>Talla: <strong>{item.TALLA}</strong></span>}
                <span style={{ fontSize: '11px', backgroundColor: tiendaColor+'15', padding: '2px 8px', borderRadius: '20px', color: tiendaColor, fontWeight: '700' }}>x{item.CANTIDAD}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Estado de pago — sin monto específico */}
        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px',
          backgroundColor: pagado ? '#dcfce7' : '#fef3c7',
          border: `1px solid ${pagado ? '#86efac' : '#fde68a'}`,
          display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '20px' }}>{pagado ? '✅' : '💳'}</div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '800', color: pagado ? '#15803d' : '#92400e' }}>
              {pagado ? 'Pedido pagado — listo para entregar' : 'Pendiente de pago al recibir'}
            </div>
            {!pagado && (
              <div style={{ fontSize: '11px', color: '#92400e', marginTop: '2px' }}>
                Cobrar el saldo al momento de la entrega
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 48px', backgroundColor: '#f9f9f9', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: '#bbb' }}>{pedido?.PEDIDO_ID}</div>
        <div style={{ fontSize: '10px', color: '#bbb' }}>{esMandarina ? 'MANDARINA REPUBLIC' : 'INDSTORE'}</div>
      </div>
    </div>
  )
}

// ─── HOJA 2: ORDEN DE CONFECCIÓN (sin precios) ───────────────────────────────
function PdfConfeccion({ pedido, items, tiendaColor }) {
  const now = new Date()
  const entrega = pedido?.FECHA_ENTREGA_PROMETIDA ? new Date(pedido.FECHA_ENTREGA_PROMETIDA) : null
  const diasRestantes = entrega ? Math.ceil((entrega - now) / 86400000) : null
  const urgente = diasRestantes !== null && diasRestantes <= 2

  return (
    <div style={{
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      backgroundColor: '#fff',
      width: '794px',
      minHeight: '1123px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Barra superior - negra para confección */}
      <div style={{ backgroundColor: '#1a1a1a', height: '8px', width: '100%' }} />

      {/* Header confección */}
      <div style={{ padding: '24px 48px 16px', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>Orden de Producción Interna</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: '#fff', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>{pedido?.PEDIDO_ID}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {urgente && (
            <div style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '4px 12px', borderRadius: '20px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              🚨 URGENTE
            </div>
          )}
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>Entrega comprometida</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: entrega && urgente ? '#ef4444' : '#fff' }}>
            {entrega ? entrega.toLocaleDateString('es-EC', {day:'numeric', month:'long', year:'numeric'}) : '-'}
          </div>
          {diasRestantes !== null && (
            <div style={{ fontSize: '10px', color: urgente ? '#ef4444' : '#888', marginTop: '2px' }}>
              {diasRestantes > 0 ? `${diasRestantes} día(s) restante(s)` : diasRestantes === 0 ? '¡ENTREGA HOY!' : `${Math.abs(diasRestantes)} día(s) de retraso`}
            </div>
          )}
        </div>
      </div>

      {/* Barra de área y vendedor */}
      <div style={{ backgroundColor: '#f5f5f5', padding: '10px 48px', display: 'flex', gap: '32px', borderBottom: '1px solid #eee' }}>
        <div><span style={{ fontSize: '10px', color: '#999' }}>VENDEDOR: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#333' }}>{pedido?.VENDEDOR_ID || '-'}</span></div>
        <div><span style={{ fontSize: '10px', color: '#999' }}>PRENDAS: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#333' }}>{(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)}</span></div>
        <div><span style={{ fontSize: '10px', color: '#999' }}>FECHA PEDIDO: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#333' }}>{pedido?.FECHA_PEDIDO?.split(' ')[0] || '-'}</span></div>
        <div><span style={{ fontSize: '10px', color: '#999' }}>ÁREAS: </span><span style={{ fontSize: '11px', fontWeight: '700', color: '#333' }}>{[...new Set((items||[]).map(i=>i.AREA).filter(Boolean))].join(', ') || '-'}</span></div>
      </div>

      {/* Ítems de producción */}
      <div style={{ padding: '20px 48px' }}>
        {(items||[]).map((item, idx) => {
          const fotosDiseno = [
            { url: item.FOTO_PECHO_URL,   label: 'PECHO'    },
            { url: item.FOTO_ESPALDA_URL, label: 'ESPALDA'  },
            { url: item.FOTO_MANGA_D_URL, label: 'M. DER'   },
            { url: item.FOTO_MANGA_I_URL, label: 'M. IZQ'   },
          ].filter(f => f.url)

          return (
            <div key={idx} style={{ marginBottom: '24px', border: '2px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header del ítem */}
              <div style={{ backgroundColor: '#1a1a1a', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '11px', fontWeight: '800', padding: '2px 10px', borderRadius: '20px' }}>#{idx+1}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>{item.PRODUCTO_NOMBRE}</div>
                </div>
                <div style={{ backgroundColor: tiendaColor, color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>
                  {item.AREA}
                </div>
              </div>

              {/* Cuerpo del ítem */}
              <div style={{ padding: '14px 16px', display: 'flex', gap: '16px' }}>
                {/* Datos de confección */}
                <div style={{ flex: '0 0 200px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {[
                      ['COLOR', item.COLOR || '—'],
                      ['TALLA', item.TALLA || '—'],
                      ['CANTIDAD', item.CANTIDAD],
                      ['SUBESTADO', item.SUBESTADO || 'SOLICITADO'],
                    ].map(([k,v]) => (
                      <div key={k} style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '8px 10px', border: '1px solid #eee' }}>
                        <div style={{ fontSize: '9px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{k}</div>
                        <div style={{ fontSize: k === 'CANTIDAD' ? '20px' : '12px', fontWeight: '800', color: k === 'CANTIDAD' ? tiendaColor : '#333', lineHeight: 1 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Instrucciones / detalle */}
                  {item.DETALLE_PERSONALIZADO && (
                    <div style={{ backgroundColor: '#fff8e1', borderRadius: '8px', padding: '10px', border: '1px solid #ffe082' }}>
                      <div style={{ fontSize: '9px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>📋 Instrucciones</div>
                      <div style={{ fontSize: '11px', color: '#333', lineHeight: 1.4 }}>{item.DETALLE_PERSONALIZADO}</div>
                    </div>
                  )}

                  {/* Nota de área si existe */}
                  {item.NOTAS_AREA && (
                    <div style={{ marginTop: '8px', backgroundColor: '#eff6ff', borderRadius: '8px', padding: '10px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>📝 Nota de área</div>
                      <div style={{ fontSize: '11px', color: '#333', lineHeight: 1.4 }}>{item.NOTAS_AREA}</div>
                    </div>
                  )}

                  {/* Archivo de diseño */}
                  {item.ARCHIVO_DISENO_URL && (
                    <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px 10px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: '700', marginBottom: '2px' }}>📎 Archivo AI/PSD disponible</div>
                      <div style={{ fontSize: '9px', color: '#888', wordBreak: 'break-all' }}>{item.ARCHIVO_DISENO_URL.split('/').pop()}</div>
                    </div>
                  )}
                </div>

                {/* Fotos de diseño — grandes */}
                <div style={{ flex: 1 }}>
                  {fotosDiseno.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fotosDiseno.length, 2)}, 1fr)`, gap: '8px' }}>
                      {fotosDiseno.map((f, i) => (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <img src={f.url} style={{ width: '100%', height: fotosDiseno.length <= 2 ? '140px' : '100px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#f9f9f9' }} />
                          <div style={{ fontSize: '9px', color: '#bbb', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ height: '120px', backgroundColor: '#f9f9f9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ddd' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', marginBottom: '4px' }}>✏️</div>
                        <div style={{ fontSize: '10px', color: '#bbb' }}>Sin archivos de diseño</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Checkbox de control de calidad */}
              <div style={{ backgroundColor: '#f9f9f9', padding: '8px 16px', borderTop: '1px solid #eee', display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>CONTROL:</div>
                {['Confeccionado', 'Diseño aplicado', 'Revisado', 'Listo para despacho'].map(step => (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '14px', height: '14px', border: '2px solid #ccc', borderRadius: '3px', flexShrink: 0 }} />
                    <span style={{ fontSize: '9px', color: '#666' }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer confección */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 48px', backgroundColor: '#f5f5f5', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: '#999' }}>Impreso: {now.toLocaleDateString('es-EC', {day:'numeric',month:'long',year:'numeric', hour:'2-digit', minute:'2-digit'})}</div>
        <div style={{ fontSize: '10px', color: '#999' }}>USO INTERNO — NO INCLUYE PRECIOS</div>
        <div style={{ fontSize: '10px', color: '#999' }}>{pedido?.PEDIDO_ID}</div>
      </div>
    </div>
  )
}
