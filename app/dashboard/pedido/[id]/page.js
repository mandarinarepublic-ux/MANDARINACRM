'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ItemDetalle from '@/components/pedido/ItemDetalle'
import { ESTADO_LABELS, ESTADO_LABELS_LARGO } from '@/lib/labels'
import { parseFecha, formatFechaHumana } from '@/lib/parseFecha'
import { PdfGracias, PdfGraciasPagina, PdfConfeccion, PdfConfeccionPagina, paginarItems, paginarItemsCliente } from '@/components/pedido/PdfPedido'
import PdfScaler from '@/components/pedido/PdfScaler'
import ConversacionPanel from '@/components/pedido/ConversacionPanel'

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
  const [fotoComprobanteAbierta, setFotoComprobanteAbierta] = useState(null)
  const [showConversacion, setShowConversacion] = useState(false)
  const [showModalAbono, setShowModalAbono] = useState(false)
  const [abonoTipo, setAbonoTipo] = useState('EFECTIVO')
  const [abonoMonto, setAbonoMonto] = useState('')
  const [abonoNotas, setAbonoNotas] = useState('')
  const [abonoFoto, setAbonoFoto] = useState(null)
  const [abonoFotoPreview, setAbonoFotoPreview] = useState(null)
  const [guardandoAbono, setGuardandoAbono] = useState(false)

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
      const lista = Array.isArray(data.pedidos) ? data.pedidos : []
      const p = lista.find(x => x.PEDIDO_ID === params.id)
      if (!p) return
      setPedido({ ...p, pagos: Array.isArray(p.pagos) ? p.pagos : [], items: Array.isArray(p.items) ? p.items : [] })
      setItems(Array.isArray(p.items) ? p.items : [])
      const cr = await fetch(`/api/clientes?id=${encodeURIComponent(p.CLIENTE_ID || '')}`)
      const cd = await cr.json()
      setCliente(cd.clientes?.[0] || null)
      const lr = await fetch(`/api/pedidos/logs?pedidoId=${params.id}`)
      const ld = await lr.json()
      setLogs(ld.logs || [])
    } finally { setLoading(false) }
  }

  const H2C ={ scale:2, useCORS:true, allowTaint:true, backgroundColor:'#ffffff', width:794, windowWidth:794, scrollX:0, scrollY:0, logging:false }

  async function generatePDF() {
    setGeneratingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default
      const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' })
      let primera = true

      let omitidas = 0
      async function capturar(id) {
        const el = document.getElementById(id)
        // Antes salía en silencio: el PDF perdía hojas y nadie se enteraba.
        if (!el) { omitidas++; return }
        await new Promise(r => setTimeout(r, 40))
        const canvas = await html2canvas(el, H2C)
        const img = canvas.toDataURL('image/jpeg', 0.92)
        if (!primera) pdf.addPage()
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297)
        primera = false
        canvas.width = 1; canvas.height = 1
      }

      const nPagsCliente = paginarItemsCliente(items).length
      for (let i = 0; i < nPagsCliente; i++) await capturar(`pdf-gracias-${i}`)
      const nPags = paginarItems(items).length
      for (let i = 0; i < nPags; i++) await capturar(`pdf-conf-${i}`)

      if (primera) { alert('No se pudo generar ninguna hoja del PDF.'); return }
      if (omitidas > 0) alert(`Atención: ${omitidas} hoja(s) no se pudieron generar.`)
      pdf.save(`${pedido.PEDIDO_ID}.pdf`)
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

  const [enviandoFactura, setEnviandoFactura] = useState(false)
  const [facturaEnviada, setFacturaEnviada]   = useState(false)
  const [facturaError,   setFacturaError]     = useState('')

  async function emitirFactura() {
    if (!cliente) return alert('No hay datos del cliente')
    if (!cliente.EMAIL) return alert('El cliente no tiene email — necesario para la factura')
    if (!cliente.CEDULA) return alert('El cliente no tiene cédula')

    setEnviandoFactura(true); setFacturaError('')
    try {
      const total   = parseFloat(pedido.MONTO_TOTAL || 0)
      const sinImp  = parseFloat((total / 1.15).toFixed(2))
      const impuesto = parseFloat((total - sinImp).toFixed(2))

      const payload = {
        pedido_id:   pedido.PEDIDO_ID,
        numero:      (cliente.CELULAR || '').replace(/\D/g, ''),
        CI:          String(cliente.CEDULA),
        tipo_id:     '05',           // persona natural sin RUC
        cliente:     cliente.NOMBRE,
        email:       cliente.EMAIL,
        total:       total.toFixed(2),
        PrecioSinImp: sinImp.toFixed(2),
        ValorImp:    impuesto.toFixed(2),
      }

      const res = await fetch('https://hook.us2.make.com/mjvj01tevojz6ayp7rrtt7wc6oa7v11n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Error ${res.status}`)
      setFacturaEnviada(true)
      // Log en bitácora
      await fetch(`/api/pedidos/${pedido.PEDIDO_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _log: `Factura emitida a ${cliente.EMAIL} · ${total.toFixed(2)}`, _usuarioId: user?.id }),
      }).catch(() => {})
    } catch(e) {
      setFacturaError(e.message || 'Error al enviar')
    } finally {
      setEnviandoFactura(false)
    }
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

  async function guardarAbono() {
    if (!abonoMonto || parseFloat(abonoMonto) <= 0) return alert('Ingresa un monto válido')
    if ((abonoTipo === 'TRANSFERENCIA') && !abonoFoto) return alert('Sube el comprobante de transferencia')
    setGuardandoAbono(true)
    try {
      const body = {
        pedidoId: pedido.PEDIDO_ID,
        tipo: abonoTipo,
        monto: abonoMonto,
        notas: abonoNotas,
        vendedorId: user?.id || user?.USUARIO_ID || '',
        vendedorNombre: user?.nombre || user?.NOMBRE || user?.username || '',
        fotoComprobante: abonoFotoPreview || '',
      }
      const res = await fetch('/api/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setShowModalAbono(false)
      setAbonoMonto('')
      setAbonoNotas('')
      setAbonoFoto(null)
      setAbonoFotoPreview(null)
      setAbonoTipo('EFECTIVO')
      await loadPedido()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setGuardandoAbono(false)
    }
  }

  function handleAbonoFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAbonoFoto(file)
    const reader = new FileReader()
    reader.onload = ev => setAbonoFotoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const canAddAbono = ['ADMIN', 'VENDEDOR', 'VENDEDOR_YAW'].includes(user?.rol)

  const tiendaColor = pedido.TIENDA_ID === 'MANDARINA' ? '#FF6B00' : '#E91E8C'
  const canEditItems = user?.rol === 'ADMIN' || ['DISEÑO','ESTAMPADO','SUBLIMACION','BORDADO'].includes(user?.rol)
  const montoTotal = parseFloat(pedido.MONTO_TOTAL || 0)
  const montoAbonado = parseFloat(pedido.MONTO_ABONADO || 0)
  const montoPendiente = montoTotal - montoAbonado
  const tieneGuia = !!(pedido.GUIA_NUMERO)

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
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-white p-1 text-lg">←</button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-display font-bold text-white">{pedido.PEDIDO_ID}</h1>
                <span>{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
              </div>
              <div className="text-gray-500 text-sm">{pedido.TIENDA_ID === 'MANDARINA' ? 'Mandarina Republic' : 'Indstore'}</div>
            </div>
            {isNew && <span className="badge bg-green-500/20 text-green-400 text-xs">✅ Creado</span>}
            <div className="text-right flex-shrink-0">
              <div className="text-base font-bold text-white">${montoTotal.toFixed(2)}</div>
              <div className={`text-sm font-medium ${montoPendiente > 0.01 ? 'text-yellow-400' : 'text-green-400'}`}>
                {montoPendiente > 0.01 ? `Debe $${montoPendiente.toFixed(2)}` : '✓ Pagado'}
              </div>
            </div>
          </div>
          {user?.rol === 'ADMIN' && !fromHistorial ? (
            <select className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2.5"
              value={pedido.ESTADO_PEDIDO} onChange={e => updateEstado(e.target.value)}>
              {Object.entries(ESTADO_LABELS_LARGO).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          ) : (
            <div className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 ${banner.bg}`}>
              <span className="text-2xl">{banner.icon}</span>
              <span className={`font-bold text-base ${banner.color}`}>{banner.label}</span>
              {tieneGuia && <span className="ml-auto text-xs text-gray-400 font-mono">Guía #{pedido.GUIA_NUMERO}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 md:pb-24">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

          {isNew && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
              <div className="font-semibold text-green-400 mb-3">🎉 Pedido creado exitosamente</div>
              <Link href="/dashboard/nuevo-pedido" className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-mandarina-500 text-white font-medium hover:bg-mandarina-600 transition-all">
                ➕ Nueva Venta
              </Link>
            </div>
          )}

          {tieneGuia && (
            <div className="bg-green-500/10 border-2 border-green-500/40 rounded-2xl p-4">
              <div className="flex items-start gap-4">
                <div className="text-4xl">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-green-400 font-bold uppercase tracking-wide mb-1">Pedido completado · Guía registrada</div>
                  <div className="text-white font-mono font-bold text-xl mb-0.5"># {pedido.GUIA_NUMERO}</div>
                  <div className="text-gray-400 text-sm">
                    {pedido.GUIA_TRANSPORTISTA}
                    {pedido.GUIA_FECHA && <span> · Despachado el {pedido.GUIA_FECHA.split(' ')[0]}</span>}
                  </div>
                </div>
                {pedido.GUIA_FOTO_URL && (
                  <img src={pedido.GUIA_FOTO_URL} onClick={() => window.open(pedido.GUIA_FOTO_URL, '_blank')}
                    className="w-20 h-20 rounded-xl object-cover border-2 border-green-500/40 cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" />
                )}
              </div>
            </div>
          )}

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
                    <span className="text-white text-right text-sm">{pedido.DIRECCION_TEXTO||pedido.DIRECCION_PEDIDO}</span>
                  </div>
                )}
                {pedido.LATITUD && <a href={`https://maps.google.com/?q=${pedido.LATITUD},${pedido.LONGITUD}`} target="_blank" className="text-mandarina-400 text-xs hover:underline">📍 Ver en Google Maps</a>}
              </div>
            </div>
          )}

          <div className="card">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-base font-semibold text-white">👕 Productos ({items.length})</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {items.map(item => (
                <ItemDetalle key={item.ITEM_ID} item={item} readOnly={!canEditItems} canChangeSubestado={canEditItems && !fromHistorial} tiendaColor={tiendaColor} user={user} loadPedido={loadPedido} />
              ))}
            </div>
          </div>

          {/* Factura — feedback de éxito o error */}
          {facturaEnviada && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">🧾</span>
              <div>
                <div className="text-green-400 font-semibold text-sm">Factura emitida correctamente</div>
                <div className="text-gray-500 text-xs mt-0.5">Enviada a {cliente?.EMAIL}</div>
              </div>
            </div>
          )}
          {facturaError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-red-400 font-semibold text-sm">Error al emitir factura</div>
                <div className="text-gray-500 text-xs mt-0.5">{facturaError}</div>
              </div>
            </div>
          )}

          {/* Factura — si ya fue procesada por Make/Dátil */}
          {(pedido.FACTURA_ID || pedido.FACTURA_PDF_URL) && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">🧾</span>
              <div className="flex-1">
                <div className="text-blue-400 font-semibold text-sm">Factura electrónica emitida</div>
                {pedido.FACTURA_ID && <div className="text-gray-500 text-xs mt-0.5">Dátil ID: {pedido.FACTURA_ID}</div>}
              </div>
              <a href={pedido.FACTURA_ID ? `/api/factura/${pedido.FACTURA_ID}/ride` : pedido.FACTURA_PDF_URL}
                target="_blank" rel="noopener noreferrer"
                className="btn-primary text-xs px-4 py-2" style={{backgroundColor:'#3b82f6'}}>
                📄 Ver RIDE
              </a>
            </div>
          )}

          {/* Factura pendiente — si emitir_factura=TRUE pero aún no llega el callback */}
          {pedido.EMITIR_FACTURA === 'TRUE' && !pedido.FACTURA_PDF_URL && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-xl">⏳</span>
              <div className="text-gray-400 text-sm">Factura en proceso… (llega en 5–30 seg)</div>
            </div>
          )}

          {/* Sección de Pagos */}
          {pedido.pagos?.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">💳 Pagos</h3>
                {canAddAbono && pedido.ESTADO_PEDIDO !== 'CANCELADO' && (
                  <button onClick={() => setShowModalAbono(true)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all">
                    + Abono
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {pedido.pagos.map((pago, i) => {
                  const TIPO_CONFIG = {
                    EFECTIVO:     { icon: '💵', label: 'Efectivo',      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
                    TRANSFERENCIA:{ icon: '🏦', label: 'Transferencia', color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
                    LINK_PAGO:    { icon: '🔗', label: 'Link de pago',  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                  }
                  const cfg = TIPO_CONFIG[pago.TIPO_PAGO] || { icon: '💰', label: pago.TIPO_PAGO || 'Pago', color: 'text-gray-400', bg: 'bg-gray-800/50 border-gray-700' }
                  return (
                    <div key={i} className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${cfg.bg}`}>
                      <span className="text-xl flex-shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</div>
                        {pago.FECHA_PAGO && <div className="text-xs text-gray-500">{pago.FECHA_PAGO.split(' ')[0]}</div>}
                        {pago.NOTAS && <div className="text-xs text-gray-400 mt-0.5">{pago.NOTAS}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-white font-bold">${parseFloat(pago.MONTO||0).toFixed(2)}</div>
                        {pago.FOTO_COMPROBANTE_URL && (
                          <button onClick={() => setFotoComprobanteAbierta(pago.FOTO_COMPROBANTE_URL)}
                            className="text-xs text-blue-400 hover:text-blue-300 mt-0.5 underline block">
                            🖼️ Ver foto
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Botón abono cuando no hay pagos todavía */}
          {canAddAbono && (!pedido.pagos || pedido.pagos.length === 0) && pedido.ESTADO_PEDIDO !== 'CANCELADO' && montoPendiente > 0 && (
            <div className="card p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">💳 Pagos</div>
                <div className="text-xs text-gray-500">Sin pagos registrados</div>
              </div>
              <button onClick={() => setShowModalAbono(true)}
                className="text-sm px-4 py-2 rounded-xl font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all">
                + Agregar pago
              </button>
            </div>
          )}

          {/* Modal de nuevo abono */}
          {showModalAbono && (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-end justify-center p-4" onClick={e => e.target === e.currentTarget && setShowModalAbono(false)}>
              <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-base">💰 Registrar pago</h3>
                  <button onClick={() => setShowModalAbono(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
                </div>

                {/* Tipo */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">Tipo de pago</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[['EFECTIVO','💵','Efectivo'],['TRANSFERENCIA','🏦','Transferencia'],['LINK_PAGO','🔗','Link']].map(([val,icon,label]) => (
                      <button key={val} onClick={() => setAbonoTipo(val)}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                          abonoTipo === val ? 'border-mandarina-500 bg-mandarina-500/20 text-mandarina-400' : 'border-gray-700 bg-gray-800/50 text-gray-400'
                        }`}>
                        <span className="text-xl">{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monto */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">Monto ($)</div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={abonoMonto} onChange={e => setAbonoMonto(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-7 pr-4 py-3 text-sm focus:border-mandarina-500 focus:outline-none" />
                  </div>
                  {montoPendiente > 0.01 && (
                    <div className="text-xs text-yellow-400 mt-1">Saldo pendiente: ${montoPendiente.toFixed(2)}
                      <button onClick={() => setAbonoMonto(montoPendiente.toFixed(2))} className="ml-2 underline">Completar</button>
                    </div>
                  )}
                </div>

                {/* Foto comprobante (transferencia) */}
                {abonoTipo === 'TRANSFERENCIA' && (
                  <div>
                    <div className="text-xs text-gray-500 mb-2">Foto comprobante <span className="text-red-400">*</span></div>
                    {abonoFotoPreview ? (
                      <div className="relative">
                        <img src={abonoFotoPreview} className="w-full h-32 object-cover rounded-xl border border-gray-700" />
                        <button onClick={() => { setAbonoFoto(null); setAbonoFotoPreview(null) }}
                          className="absolute top-2 right-2 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">✕</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-mandarina-500 transition-colors">
                        <span className="text-2xl">📸</span>
                        <span className="text-xs text-gray-500 mt-1">Toca para subir foto</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleAbonoFoto} />
                      </label>
                    )}
                  </div>
                )}

                {/* Notas */}
                <div>
                  <div className="text-xs text-gray-500 mb-2">Notas (opcional)</div>
                  <input type="text" placeholder="Ej: Saldo pendiente, abono parcial..." value={abonoNotas} onChange={e => setAbonoNotas(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-2.5 text-sm focus:border-mandarina-500 focus:outline-none" />
                </div>

                <button onClick={guardarAbono} disabled={guardandoAbono}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#22c55e' }}>
                  {guardandoAbono ? '⏳ Guardando...' : '✅ Registrar pago'}
                </button>
              </div>
            </div>
          )}

          {/* Modal foto comprobante de pago */}
          {fotoComprobanteAbierta && (
            <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
              onClick={() => setFotoComprobanteAbierta(null)}>
              <img src={fotoComprobanteAbierta} className="max-w-full max-h-full object-contain rounded-xl" alt="Comprobante" />
              <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
            </div>
          )}

          {pedido.NOTAS_VENDEDOR && (
            <div className="card p-4">
              <h3 className="text-base font-semibold text-white mb-2">📝 Notas internas</h3>
              <div className="text-base text-gray-300 bg-gray-800/50 rounded-xl px-4 py-3">{pedido.NOTAS_VENDEDOR}</div>
            </div>
          )}

          <div className="card p-4">
            <h3 className="text-base font-semibold text-white mb-2">📦 Entrega</h3>
            <div className="text-base text-gray-400">
              Fecha creación de pedido:
              <span className="text-white ml-2">
                {(() => {
                  const f = parseFecha(pedido.FECHA_PEDIDO)
                  return f
                    ? f.toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})
                    : '-'
                })()}
              </span>
            </div>
            <div className="text-base text-gray-400 mt-1">
              Fecha comprometida:
              <span className="text-white ml-2">
                {parseFecha(pedido.FECHA_ENTREGA_PROMETIDA)
                  ?.toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})
                  || '-'}
              </span>
            </div>
          </div>

          {!['DISEÑO','ESTAMPADO','SUBLIMACION','BORDADO','DESPACHO'].includes(user?.rol) && (
            <div className="card overflow-hidden">
              <button onClick={()=>setShowConversacion(true)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-all">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">💬 Conversación de WhatsApp</span>
                </div>
                <span className="text-gray-500">›</span>
              </button>
            </div>
          )}

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
                                if(c==='IMPRESION_PRODUCCION') {
                                  // El valor guardado es la fecha cruda del backend (ISO en Supabase).
                                  // El campo del pedido se SOBRESCRIBE en cada impresión, así que este
                                  // es el único rastro de las anteriores: hay que poder leerlo.
                                  const esReimpresion = log.antes && log.antes !== '(nunca impreso)'
                                  return esReimpresion
                                    ? `🖨️ REIMPRESO (anterior: ${formatFechaHumana(log.antes) || log.antes})`
                                    : `🖨️ Impreso para producción`
                                }
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
              <PdfScaler>
                <PdfGracias pedido={pedido} items={items} cliente={cliente} tiendaColor={tiendaColor} />
                <PdfConfeccion pedido={pedido} items={items} tiendaColor={tiendaColor} />
              </PdfScaler>
            </div>
          </div>
        </div>
      )}

      <div style={{position:'fixed',top:'-9999px',left:'-9999px',width:'794px',backgroundColor:'white',fontFamily:"'Helvetica Neue',Arial,sans-serif"}}>
        {paginarItemsCliente(items).map((pag, gIdx, todas) => (
          <div key={gIdx} id={`pdf-gracias-${gIdx}`} style={{width:'794px'}}>
            <PdfGraciasPagina pedido={pedido} items={pag.items} filas={pag.filas} cliente={cliente}
              tiendaColor={tiendaColor} offsetIdx={pag.offset}
              esPrimera={gIdx === 0} esUltima={gIdx === todas.length - 1}
              paginaActual={gIdx + 1} totalPaginas={todas.length} />
          </div>
        ))}
        {paginarItems(items).map((pag, pIdx, todas) => (
          <div key={pIdx} id={`pdf-conf-${pIdx}`} style={{width:'794px'}}>
            <PdfConfeccionPagina pedido={pedido} items={pag.items} tiendaColor={tiendaColor}
              paginaActual={pIdx+1} totalPaginas={todas.length} offsetIdx={pag.offset} />
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-gray-950/95 backdrop-blur border-t border-gray-800 p-3">
        {/* Fila 1: acciones principales */}
        <div className="flex gap-2 mb-2">
          {!['DISEÑO','ESTAMPADO','SUBLIMACION','BORDADO','DESPACHO'].includes(user?.rol) && (
            <button onClick={sendWhatsApp} className="btn-secondary flex-1 text-sm">📱 WA</button>
          )}
          <button onClick={()=>setShowPdfPreview(true)} className="btn-secondary flex-1 text-sm">👁️ PDF</button>
          {user?.rol==='DESPACHO'&&pedido?.ESTADO_PEDIDO!=='COMPLETADO'&&(
            <Link href="/dashboard/despacho" className="btn-primary flex-1 text-sm flex items-center justify-center gap-1" style={{backgroundColor:'#7C3AED'}}>🚚 Despacho</Link>
          )}
          {(user?.rol==='ADMIN'||user?.rol==='VENDEDOR')&&(
            <button onClick={generatePDF} disabled={generatingPdf} className="btn-primary flex-1 text-sm" style={{backgroundColor:tiendaColor}}>
              {generatingPdf?'⏳...':'⬇️ PDF'}
            </button>
          )}
        </div>
        {/* Fila 2: factura (solo si aplica) */}
        {(user?.rol==='ADMIN'||user?.rol==='VENDEDOR') && pedido.EMITIR_FACTURA === 'TRUE' && (
          <div className="flex gap-2">
            {!facturaEnviada ? (
              <button onClick={emitirFactura} disabled={enviandoFactura}
                className="w-full py-2 rounded-xl text-sm font-medium border border-yellow-500/40 text-yellow-400 bg-yellow-500/10">
                {enviandoFactura ? '⏳ Enviando factura...' : '🧾 Emitir factura'}
              </button>
            ) : (
              <div className="w-full text-center text-sm text-green-400 font-medium py-2">✅ Factura emitida</div>
            )}
          </div>
        )}
      </div>

      {showConversacion && (
        <ConversacionPanel
          celular={cliente?.CELULAR}
          nombreCliente={cliente?.NOMBRE}
          onClose={()=>setShowConversacion(false)}
        />
      )}
    </div>
  )
}
