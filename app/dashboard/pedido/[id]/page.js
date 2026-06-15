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
                <ItemDetalle key={item.ITEM_ID} item={item} readOnly={!canEditItems} tiendaColor={tiendaColor} user={user} loadPedido={loadPedido} />
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
            <div className="bg-white rounded-xl overflow-hidden"><PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} /></div>
          </div>
        </div>
      )}
      <div style={{position:'fixed',top:'-9999px',left:'-9999px',width:'794px',backgroundColor:'white'}}>
        <div id="pdf-render"><PdfContent pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} /></div>
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

function PdfContent({ pedido, items, cliente, tiendaColor }) {
  const esMandarina = pedido?.TIENDA_ID === 'MANDARINA'
  const montoTotal = parseFloat(pedido?.MONTO_TOTAL||0)
  const montoPendiente = parseFloat(pedido?.MONTO_PENDIENTE||0)
  const montoAbonado = parseFloat(pedido?.MONTO_ABONADO||0)
  return (
    <div style={{fontFamily:'Arial,Helvetica,sans-serif',color:'#000',backgroundColor:'#fff',padding:'12mm',width:'100%',fontSize:'11px'}}>
      <div style={{backgroundColor:tiendaColor,height:'5px',marginBottom:'10px',borderRadius:'3px'}}/>
      <div style={{textAlign:'center',marginBottom:'10px'}}>
        <h2 style={{margin:'0 0 4px',fontSize:'15px',fontWeight:'bold',color:tiendaColor}}>{esMandarina?'MANDARINA REPUBLIC':'INDSTORE'}</h2>
        {esMandarina&&(<>
          <p style={{margin:'3px 0',fontSize:'12px',fontWeight:'bold'}}>Hola {cliente?.NOMBRE||''}</p>
          <p style={{margin:'2px 0',fontSize:'13px',fontWeight:'bold'}}>¡Gracias por tu compra! 🎉</p>
          <p style={{margin:'2px 0',fontSize:'10px',color:'#555'}}>Cada prenda que hacemos está pensada para gente única como tú.</p>
          <p style={{margin:'5px 0',fontSize:'11px',fontWeight:'bold',color:tiendaColor}}>💛 Tu confianza nos inspira 💛</p>
        </>)}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'8px'}}>
        <tbody>
          <tr>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0',width:'22%'}}>NUM FACTURA</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{pedido?.PEDIDO_ID}</td>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0',width:'22%'}}>VENDEDOR</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{pedido?.VENDEDOR_ID||'-'}</td>
          </tr>
          <tr><td colSpan={4} style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold'}}>
            ESTADO PAGO: {pedido?.ESTADO_PAGO==='PAGADO'?'🟢 Pagado':pedido?.ESTADO_PAGO==='ABONO'?`🔴 Abono $${montoAbonado.toFixed(2)}, pendiente $${montoPendiente.toFixed(2)}`:`🔴 Pendiente $${montoTotal.toFixed(2)}`}
          </td></tr>
          <tr>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0'}}>NOMBRE CLIENTE</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{cliente?.NOMBRE||'-'}</td>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0'}}>CANTIDAD</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{(items||[]).reduce((s,i)=>s+parseInt(i.CANTIDAD||1),0)}</td>
          </tr>
          <tr>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0'}}>CÉDULA</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{cliente?.CEDULA||'-'}</td>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0'}}>CELULAR</td>
            <td style={{border:'1px solid #000',padding:'4px 6px'}}>{cliente?.CELULAR||'-'}</td>
          </tr>
          <tr>
            <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#f0f0f0'}}>DIRECCIÓN</td>
            <td colSpan={3} style={{border:'1px solid #000',padding:'4px 6px'}}>{(pedido?.DIRECCION_TEXTO||pedido?.DIRECCION_PEDIDO)||cliente?.DIRECCION||'-'}</td>
          </tr>
          {pedido?.GUIA_NUMERO&&(
            <tr>
              <td style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold',backgroundColor:'#d4edda'}}>GUÍA DESPACHO</td>
              <td colSpan={3} style={{border:'1px solid #000',padding:'4px 6px',fontWeight:'bold'}}>{pedido.GUIA_TRANSPORTISTA} # {pedido.GUIA_NUMERO}</td>
            </tr>
          )}
        </tbody>
      </table>
      <h4 style={{textAlign:'center',margin:'8px 0 6px',fontSize:'11px',fontWeight:'bold'}}>Detalle de los productos solicitados</h4>
      {(items||[]).map((item,idx)=>(
        <div key={idx} style={{marginBottom:'8px'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'10px'}}>
            <thead><tr style={{backgroundColor:'#e8e8e8'}}>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'left',width:'18%'}}>PRODUCTO</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center',width:'50px'}}>FOTO</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center',width:'11%'}}>COLOR</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center',width:'6%'}}>CANT.</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center',width:'6%'}}>TALLA</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center'}}>PECHO</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center'}}>ESPALDA</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center'}}>M.DER</th>
              <th style={{border:'1px solid #000',padding:'3px 4px',textAlign:'center'}}>M.IZQ</th>
            </tr></thead>
            <tbody>
              <tr>
                <td style={{border:'1px solid #000',padding:'4px',verticalAlign:'top'}}>{item.PRODUCTO_NOMBRE}<br/><span style={{color:tiendaColor,fontSize:'9px'}}>{item.AREA}</span></td>
                <td style={{border:'1px solid #000',padding:'2px',textAlign:'center',verticalAlign:'middle',width:'50px',height:'50px'}}>{item.FOTO_PECHO_URL?<img src={item.FOTO_PECHO_URL} style={{maxWidth:'46px',maxHeight:'46px',objectFit:'contain',display:'block',margin:'0 auto'}}/>:<span style={{color:'#ccc',fontSize:'8px'}}>—</span>}</td>
                <td style={{border:'1px solid #000',padding:'4px',textAlign:'center',verticalAlign:'middle'}}>{item.COLOR}</td>
                <td style={{border:'1px solid #000',padding:'4px',textAlign:'center',fontWeight:'bold',verticalAlign:'middle'}}>{item.CANTIDAD}</td>
                <td style={{border:'1px solid #000',padding:'4px',textAlign:'center',fontWeight:'bold',verticalAlign:'middle'}}>{item.TALLA}</td>
                {[item.FOTO_PECHO_URL,item.FOTO_ESPALDA_URL,item.FOTO_MANGA_D_URL,item.FOTO_MANGA_I_URL].map((url,i)=>(
                  <td key={i} style={{border:'1px solid #000',padding:'2px',textAlign:'center',width:'50px',height:'50px',verticalAlign:'middle'}}>{url?<img src={url} style={{maxWidth:'46px',maxHeight:'46px',objectFit:'contain',display:'block',margin:'0 auto'}}/>:<span style={{color:'#ccc',fontSize:'8px'}}>—</span>}</td>
                ))}
              </tr>
              {item.DETALLE_PERSONALIZADO&&<tr><td colSpan={9} style={{border:'1px solid #000',padding:'4px',fontSize:'9px'}}><strong>Detalles:</strong> {item.DETALLE_PERSONALIZADO}</td></tr>}
              {item.NOTAS_AREA&&<tr><td colSpan={9} style={{border:'1px solid #000',padding:'4px',fontSize:'9px',backgroundColor:'#fff3cd'}}><strong>📝 Nota área:</strong> {item.NOTAS_AREA}</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{marginTop:'10px',borderTop:'1px solid #ddd',paddingTop:'6px',textAlign:'center',fontSize:'9px',color:'#888'}}>
        Pedido: {pedido?.FECHA_PEDIDO?.split(' ')[0]||'-'} · Entrega: {pedido?.FECHA_ENTREGA_PROMETIDA?new Date(pedido.FECHA_ENTREGA_PROMETIDA).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'}):'-'}
      </div>
    </div>
  )
}
