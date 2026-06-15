'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function parseFecha(str) {
  if (!str) return null
  if (str.match(/^\d{4}-/)) return new Date(str)
  const months = {Ene:0,Feb:1,Mar:2,Abr:3,May:4,Jun:5,Jul:6,Ago:7,Sep:8,Oct:9,Nov:10,Dic:11}
  const m = str.match(/^(\d{2})([A-Za-z]{3})(\d{4})/)
  if (!m) return null
  return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]))
}

function resizeImageBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1200
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.80))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function DespachosPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState(null)
  const [guia, setGuia] = useState({ numero: '', transportista: 'SERVIENTREGA', fotoBase64: null, fotoPreview: null })
  const [saving, setSaving] = useState(false)
  const [savingMsg, setSavingMsg] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [mostrarFecha, setMostrarFecha] = useState(false)
  const [tab, setTab] = useState('PENDIENTE') // PENDIENTE | DESPACHADO

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    loadPedidos()
  }, [])

  async function loadPedidos() {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN')
      const data = await res.json()
      const lista = (data.pedidos || [])
        .filter(p =>
          p.ESTADO_PEDIDO === 'DESPACHO' ||
          (p.ESTADO_PEDIDO === 'EN_FABRICA' &&
           (p.items || []).length > 0 &&
           (p.items || [])
             .filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
             .every(i => i.SUBESTADO === 'LISTO'))
        )
        .sort((a, b) => (parseFecha(b.FECHA_PEDIDO)||new Date(0)) - (parseFecha(a.FECHA_PEDIDO)||new Date(0)))
      setPedidos(lista)
    } finally { setLoading(false) }
  }

  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos.filter(p => {
    // Tab
    if (tab === 'PENDIENTE' && p.ESTADO_PEDIDO === 'DESPACHO') return false
    if (tab === 'DESPACHADO' && p.ESTADO_PEDIDO !== 'DESPACHO') return false
    // Búsqueda
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!p.PEDIDO_ID?.toLowerCase().includes(q) && !p.CLIENTE_ID?.toLowerCase().includes(q)) return false
    }
    if (fechaDesde) { const f = parseFecha(p.FECHA_PEDIDO); if (!f || f < new Date(fechaDesde)) return false }
    if (fechaHasta) { const f = parseFecha(p.FECHA_PEDIDO); const h = new Date(fechaHasta); h.setHours(23,59,59); if (!f || f > h) return false }
    return true
  })

  const pendienteCount = pedidos.filter(p => p.ESTADO_PEDIDO !== 'DESPACHO').length
  const despachadoCount = pedidos.filter(p => p.ESTADO_PEDIDO === 'DESPACHO').length

  async function handleFotoGuia(file) {
    if (!file) return
    try {
      const base64 = await resizeImageBase64(file)
      setGuia(g => ({ ...g, fotoBase64: base64, fotoPreview: base64 }))
    } catch(e) { console.error('Error procesando foto:', e) }
  }

  async function registrarDespacho(pedidoId) {
    if (!guia.numero.trim()) { alert('El número de guía es obligatorio'); return }
    setSaving(true)
    setSavingMsg(guia.fotoBase64 ? '📤 Subiendo foto...' : '💾 Guardando...')
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ESTADO_PEDIDO:     'DESPACHO',
          GUIA_NUMERO:       guia.numero.trim(),
          GUIA_TRANSPORTISTA:guia.transportista,
          GUIA_FOTO_BASE64:  guia.fotoBase64 || null,
          _usuarioId:        user?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Error: ' + (data.error || 'No se pudo guardar')); return }
      setSelectedPedido(null)
      setGuia({ numero: '', transportista: 'SERVIENTREGA', fotoBase64: null, fotoPreview: null })
      setTab('DESPACHADO')
      loadPedidos()
    } finally { setSaving(false); setSavingMsg('') }
  }

  async function marcarEntregado(pedidoId) {
    if (!confirm('¿Confirmar que el pedido ' + pedidoId + ' fue entregado al cliente?')) return
    setSaving(true)
    try {
      await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ESTADO_PEDIDO: 'ENTREGADO', _usuarioId: user?.id }),
      })
      loadPedidos()
    } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Despachos</h1>
            <span className="text-xs text-gray-500">{pedidos.length} pedido(s) activos</span>
          </div>

          {/* Tabs claros — pendiente vs despachado */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab('PENDIENTE')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2
                ${tab === 'PENDIENTE'
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                  : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>
              📦 Por despachar
              {pendienteCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'PENDIENTE' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                  {pendienteCount}
                </span>
              )}
            </button>
            <button onClick={() => setTab('DESPACHADO')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2
                ${tab === 'DESPACHADO'
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                  : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>
              🚚 Despachados
              {despachadoCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'DESPACHADO' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                  {despachadoCount}
                </span>
              )}
            </button>
          </div>

          {/* Búsqueda + fecha */}
          <div className="flex gap-2 mb-2">
            <input className="input flex-1" placeholder="Buscar por ID o cliente..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={() => setMostrarFecha(v => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0
                ${hayFecha ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              📅 {hayFecha ? '✓' : 'Fecha'}
            </button>
          </div>
          {mostrarFecha && (
            <div className="flex gap-2 items-end">
              <div className="flex-1"><label className="text-xs text-gray-500 mb-1 block">Desde</label><input type="date" className="input text-sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} /></div>
              <div className="flex-1"><label className="text-xs text-gray-500 mb-1 block">Hasta</label><input type="date" className="input text-sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} /></div>
              {hayFecha && <button onClick={() => { setFechaDesde(''); setFechaHasta('') }} className="text-xs text-gray-500 hover:text-red-400 pb-2 px-2">✕</button>}
            </div>
          )}
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">{tab === 'PENDIENTE' ? '✅' : '🚚'}</div>
              <div className="text-gray-400 font-medium">
                {tab === 'PENDIENTE' ? '¡Todo despachado!' : 'No hay pedidos despachados aún'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => {
                const esDespachado = p.ESTADO_PEDIDO === 'DESPACHO'
                const montoTotal = parseFloat(p.MONTO_TOTAL || 0)
                const montoPendiente = parseFloat(p.MONTO_PENDIENTE || 0)
                const itemsActivos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')

                return (
                  <div key={p.PEDIDO_ID}
                    className={`card overflow-hidden border-l-4 ${esDespachado ? 'border-l-purple-500' : 'border-l-yellow-500'}`}>

                    {/* ── Cabecera del pedido ── */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          {/* ID + tienda */}
                          <div className="flex items-center gap-2 mb-1">
                            <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`}
                              className="font-mono font-bold text-white hover:text-mandarina-400 transition-colors">
                              {p.PEDIDO_ID}
                            </Link>
                            <span className="text-sm">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                            {esDespachado
                              ? <span className="badge bg-purple-500/20 text-purple-400 text-xs">🚚 Despachado</span>
                              : <span className="badge bg-yellow-500/20 text-yellow-400 text-xs">📦 Listo para despachar</span>}
                          </div>

                          {/* Fecha y cliente */}
                          <div className="text-xs text-gray-500">
                            {p.FECHA_PEDIDO?.split(' ')[0]} · {p.CLIENTE_ID}
                          </div>

                          {/* Monto */}
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-sm font-bold text-white">${montoTotal.toFixed(2)}</span>
                            {montoPendiente > 0.01
                              ? <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">Debe ${montoPendiente.toFixed(2)}</span>
                              : <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">✓ Pagado</span>}
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-col gap-2 items-end flex-shrink-0">
                          {esDespachado ? (
                            <button onClick={() => marcarEntregado(p.PEDIDO_ID)} disabled={saving}
                              className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5">
                              ✅ Marcar entregado
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedPedido(p.PEDIDO_ID === selectedPedido ? null : p.PEDIDO_ID)}
                              className="bg-mandarina-500 hover:bg-mandarina-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all">
                              {selectedPedido === p.PEDIDO_ID ? '✕ Cancelar' : '🚚 Registrar guía'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ítems resumen */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {itemsActivos.map(item => (
                          <div key={item.ITEM_ID}
                            className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-2.5 py-1">
                            {item.FOTO_PECHO_URL && (
                              <img src={item.FOTO_PECHO_URL} className="w-6 h-6 rounded object-cover" />
                            )}
                            <span className="text-xs text-gray-300 font-medium">{item.PRODUCTO_NOMBRE?.slice(0, 20)}</span>
                            <span className="text-xs text-gray-500">{item.TALLA} · {item.COLOR}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.SUBESTADO === 'LISTO' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                              {item.SUBESTADO === 'LISTO' ? '✅' : '⏳'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Guía registrada — bloque prominente */}
                      {p.GUIA_NUMERO && (
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 flex items-center gap-3">
                          <div className="text-2xl">📦</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-purple-400 font-semibold mb-0.5">Guía de despacho</div>
                            <div className="text-white font-mono font-bold"># {p.GUIA_NUMERO}</div>
                            <div className="text-xs text-gray-400">{p.GUIA_TRANSPORTISTA}{p.GUIA_FECHA ? ` · ${p.GUIA_FECHA.split(' ')[0]}` : ''}</div>
                          </div>
                          {p.GUIA_FOTO_URL && (
                            <img
                              src={p.GUIA_FOTO_URL}
                              onClick={() => window.open(p.GUIA_FOTO_URL, '_blank')}
                              className="w-14 h-14 rounded-xl object-cover border border-purple-500/30 cursor-pointer hover:opacity-80 transition-opacity"
                              title="Ver foto de guía"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Formulario registrar guía ── */}
                    {selectedPedido === p.PEDIDO_ID && (
                      <div className="border-t border-gray-800 bg-gray-900/50 p-4 space-y-3">
                        <div className="text-sm font-semibold text-white mb-1">📝 Registrar guía de envío</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="label">Número de guía *</label>
                            <input className="input" placeholder="ej: 7890123456"
                              value={guia.numero}
                              onChange={e => setGuia(g => ({ ...g, numero: e.target.value }))}
                              autoFocus />
                          </div>
                          <div>
                            <label className="label">Transportista</label>
                            <select className="input" value={guia.transportista}
                              onChange={e => setGuia(g => ({ ...g, transportista: e.target.value }))}>
                              {['SERVIENTREGA','TRAMACO','LAAR','RETIRO_TIENDA'].map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Foto guía */}
                        <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all
                          ${guia.fotoPreview ? 'border-mandarina-500 bg-mandarina-500/5' : 'border-gray-700 hover:border-gray-500'}`}>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => handleFotoGuia(e.target.files[0])} />
                          {guia.fotoPreview ? (
                            <div className="flex items-center gap-3 w-full">
                              <img src={guia.fotoPreview} className="w-14 h-14 rounded-xl object-cover border border-gray-700" />
                              <div className="flex-1">
                                <div className="text-mandarina-400 text-sm font-medium">✓ Foto cargada</div>
                                <div className="text-gray-500 text-xs">Toca para cambiarla</div>
                              </div>
                              <button type="button"
                                onClick={e => { e.preventDefault(); setGuia(g => ({...g, fotoBase64: null, fotoPreview: null})) }}
                                className="text-red-400 text-xs hover:text-red-300 p-1">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">📷</span>
                              <div>
                                <div className="text-gray-300 text-sm">Foto de la guía Servientrega</div>
                                <div className="text-gray-600 text-xs">Opcional · se sube a Cloudinary</div>
                              </div>
                            </div>
                          )}
                        </label>

                        <button
                          onClick={() => registrarDespacho(p.PEDIDO_ID)}
                          disabled={saving || !guia.numero.trim()}
                          className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                          {saving
                            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{savingMsg || 'Guardando...'}</>
                            : '🚚 Confirmar despacho'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
