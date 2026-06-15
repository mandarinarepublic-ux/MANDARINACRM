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

// Redimensiona imagen antes de subir (igual que el resto del sistema)
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
      const listos = (data.pedidos || [])
        .filter(p =>
          p.ESTADO_PEDIDO === 'DESPACHO' ||
          (p.ESTADO_PEDIDO === 'EN_FABRICA' &&
           (p.items || []).length > 0 &&
           (p.items || [])
             .filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
             .every(i => i.SUBESTADO === 'LISTO'))
        )
        .sort((a, b) => {
          const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
          const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
          return fb - fa
        })
      setPedidos(listos)
    } finally { setLoading(false) }
  }

  const hayFecha = fechaDesde || fechaHasta
  const filtered = pedidos.filter(p => {
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!p.PEDIDO_ID?.toLowerCase().includes(q) && !p.CLIENTE_ID?.toLowerCase().includes(q)) return false
    }
    if (fechaDesde) { const f = parseFecha(p.FECHA_PEDIDO); if (!f || f < new Date(fechaDesde)) return false }
    if (fechaHasta) { const f = parseFecha(p.FECHA_PEDIDO); const h = new Date(fechaHasta); h.setHours(23,59,59); if (!f || f > h) return false }
    return true
  })

  async function handleFotoGuia(file) {
    if (!file) return
    try {
      const base64 = await resizeImageBase64(file)
      setGuia(g => ({ ...g, fotoBase64: base64, fotoPreview: base64 }))
    } catch (e) {
      console.error('Error procesando foto:', e)
    }
  }

  async function registrarDespacho(pedidoId) {
    if (!guia.numero.trim()) { alert('El número de guía es obligatorio'); return }
    setSaving(true)
    try {
      // La foto base64 se envía al servidor y Cloudinary la sube allá
      // igual que las fotos de diseño de los ítems
      setSavingMsg(guia.fotoBase64 ? '📤 Subiendo foto a Cloudinary...' : '💾 Guardando...')

      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ESTADO_PEDIDO:    'DESPACHO',
          GUIA_NUMERO:      guia.numero.trim(),
          GUIA_TRANSPORTISTA: guia.transportista,
          GUIA_FOTO_BASE64: guia.fotoBase64 || null, // el API lo sube a Cloudinary
          _usuarioId:       user?.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) { alert('Error: ' + (data.error || 'No se pudo guardar')); return }

      setSavingMsg('✅ Despachado')
      setTimeout(() => setSavingMsg(''), 1500)
      setSelectedPedido(null)
      setGuia({ numero: '', transportista: 'SERVIENTREGA', fotoBase64: null, fotoPreview: null })
      loadPedidos()
    } finally { setSaving(false) }
  }

  async function marcarEntregado(pedidoId) {
    if (!confirm('¿Confirmar entrega del pedido ' + pedidoId + '?')) return
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
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Despachos</h1>
            <span className="text-gray-500 text-sm">{filtered.length} pedido(s)</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="Buscar por pedido o cliente..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={() => setMostrarFecha(v => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0
                ${hayFecha ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              📅 {hayFecha ? 'Fecha ✓' : 'Fecha'}
            </button>
          </div>
          {mostrarFecha && (
            <div className="flex gap-2 mb-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                <input type="date" className="input text-sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                <input type="date" className="input text-sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              </div>
              {hayFecha && <button onClick={() => { setFechaDesde(''); setFechaHasta('') }} className="text-xs text-gray-500 hover:text-red-400 pb-2 px-2">✕</button>}
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-600">
              <div className="text-3xl mb-3">🚚</div>No hay pedidos para despachar
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(p => (
                <div key={p.PEDIDO_ID} className="card p-4">
                  {/* Header de la card */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`}
                        className="font-mono text-sm font-medium text-mandarina-400 hover:underline">
                        {p.PEDIDO_ID}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {p.items?.length || 0} prendas · {p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'} · {p.FECHA_PEDIDO?.split(' ')[0] || ''}
                      </div>
                      {/* Mostrar guía si ya tiene */}
                      {p.GUIA_NUMERO && (
                        <div className="text-xs text-purple-400 mt-0.5">
                          📦 Guía: {p.GUIA_TRANSPORTISTA} #{p.GUIA_NUMERO}
                        </div>
                      )}
                    </div>

                    {/* Acciones según estado */}
                    <div className="flex flex-col gap-1.5 items-end">
                      {p.ESTADO_PEDIDO === 'DESPACHO' ? (
                        <>
                          <span className="badge text-purple-400 bg-purple-500/10 text-xs">Despachado ✓</span>
                          {/* FIX I4: botón Marcar Entregado */}
                          <button
                            onClick={() => marcarEntregado(p.PEDIDO_ID)}
                            disabled={saving}
                            className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 hover:bg-green-500/10 px-2 py-1 rounded-lg transition-all">
                            ✅ Marcar entregado
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSelectedPedido(p.PEDIDO_ID === selectedPedido ? null : p.PEDIDO_ID)}
                          className="btn-primary text-xs py-1.5 px-3">
                          {selectedPedido === p.PEDIDO_ID ? '✕ Cancelar' : '🚚 Registrar guía'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chips de ítems */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO').map(item => (
                      <span key={item.ITEM_ID}
                        className={`text-xs px-2 py-0.5 rounded-full ${item.SUBESTADO === 'LISTO' ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                        {item.TALLA} · {item.AREA?.slice(0, 3)}
                      </span>
                    ))}
                  </div>

                  {/* Formulario de guía */}
                  {selectedPedido === p.PEDIDO_ID && (
                    <div className="border-t border-gray-800 pt-4 mt-2 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Número de guía *</label>
                          <input className="input" placeholder="123456789"
                            value={guia.numero}
                            onChange={e => setGuia(g => ({ ...g, numero: e.target.value }))} />
                        </div>
                        <div>
                          <label className="label">Transportista</label>
                          <select className="input" value={guia.transportista}
                            onChange={e => setGuia(g => ({ ...g, transportista: e.target.value }))}>
                            {['SERVIENTREGA','TRAMACO','LAAR','RETIRO_TIENDA'].map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Foto de guía — sube a Cloudinary igual que las fotos de diseño */}
                      <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all
                        ${guia.fotoPreview ? 'border-mandarina-500 bg-mandarina-500/5' : 'border-gray-700 hover:border-gray-500'}`}>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => handleFotoGuia(e.target.files[0])} />
                        {guia.fotoPreview ? (
                          <div className="flex items-center gap-3 w-full">
                            <img src={guia.fotoPreview} className="w-16 h-16 rounded-xl object-cover border border-gray-700" />
                            <div>
                              <div className="text-mandarina-400 text-sm font-medium">✓ Foto lista</div>
                              <div className="text-gray-500 text-xs">Se subirá a Cloudinary al confirmar</div>
                              <button type="button" onClick={e => { e.preventDefault(); setGuia(g => ({...g, fotoBase64: null, fotoPreview: null})) }}
                                className="text-red-400 text-xs mt-1 hover:underline">✕ Quitar foto</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">📷</span>
                            <div>
                              <div className="text-gray-400 text-sm">Foto de la guía Servientrega</div>
                              <div className="text-gray-600 text-xs">Opcional — se sube a Cloudinary</div>
                            </div>
                          </div>
                        )}
                      </label>

                      <button
                        onClick={() => registrarDespacho(p.PEDIDO_ID)}
                        disabled={saving || !guia.numero}
                        className="btn-primary w-full flex items-center justify-center gap-2">
                        {saving
                          ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{savingMsg || 'Guardando...'}</>
                          : '🚚 Confirmar despacho'}
                      </button>
                    </div>
                  )}

                  {/* Foto de guía ya subida */}
                  {p.GUIA_FOTO_URL && p.ESTADO_PEDIDO === 'DESPACHO' && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <div className="text-xs text-gray-500 mb-2">📷 Comprobante de envío</div>
                      <img src={p.GUIA_FOTO_URL} className="w-24 h-24 rounded-xl object-cover border border-gray-700 cursor-pointer"
                        onClick={() => window.open(p.GUIA_FOTO_URL, '_blank')} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
