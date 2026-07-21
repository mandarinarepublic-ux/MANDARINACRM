'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha } from '@/lib/parseFecha'

// Un pedido está CERRADO para despacho cuando alguien lo dio por salido:
// COMPLETADO (guía registrada o cerrado a mano), ENTREGADO o CANCELADO.
//
// DESPACHO NO cierra: ese estado lo pone solo el sistema cuando producción marca
// el último ítem como LISTO, y significa "la fábrica terminó", no "ya salió".
// Contarlo como cerrado hacía que el pedido desapareciera de la lista sin que
// nadie lo despachara: había 225 pedidos así, ninguno con guía.
const ESTADOS_CERRADOS = ['COMPLETADO', 'ENTREGADO', 'CANCELADO']
const esCerrado = (p) => ESTADOS_CERRADOS.includes(p?.ESTADO_PEDIDO)

const ESTADO_ETIQUETA = {
  PENDIENTE_FABRICA: { txt: '⏳ Pend. fábrica', cls: 'bg-gray-500/20 text-gray-400' },
  EN_FABRICA:        { txt: '🏭 En producción', cls: 'bg-blue-500/20 text-blue-400' },
  DESPACHO:          { txt: '📦 Listo para despachar', cls: 'bg-yellow-500/20 text-yellow-400' },
  COMPLETADO:        { txt: '✅ Despachado', cls: 'bg-green-500/20 text-green-400' },
  ENTREGADO:         { txt: '🏠 Entregado', cls: 'bg-green-500/20 text-green-400' },
  CANCELADO:         { txt: '✕ Cancelado', cls: 'bg-red-500/20 text-red-400' },
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
  const [tab, setTab] = useState('PENDIENTE')
  const [expandedPedidos, setExpandedPedidos] = useState(new Set())
  const [visibles, setVisibles] = useState(20)
  const PAGE_SIZE_D = 20

  function handleTab(t) { setTab(t); setExpandedPedidos(new Set()); setVisibles(20) }

  useEffect(() => { setVisibles(20) }, [busqueda, fechaDesde, fechaHasta])

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
    loadPedidos()
  }, [])

  async function loadPedidos(intentos = 0) {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN&_t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      // Si llega vacío y tenemos reintentos disponibles, volvemos a intentar
      if (!data.pedidos?.length && intentos < 3) {
        setTimeout(() => loadPedidos(intentos + 1), 1500)
        return
      }
      // Entra TODO el pedido vivo, sin exigir que sus ítems estén en LISTO.
      // Antes solo aparecían los EN_FABRICA con todos los ítems marcados LISTO, y
      // como no todos los diseñadores los marcan, había pedidos ya terminados que
      // nunca llegaban a esta pantalla. Un pedido se cierra por decisión de
      // despacho, no por el estado de los botones de producción.
      // Se traen TODOS: las pestañas separan pendientes de cerrados.
      const lista = (data.pedidos || [])
        .sort((a, b) => {
          const diff = (parseFecha(b.FECHA_PEDIDO)||new Date(0)) - (parseFecha(a.FECHA_PEDIDO)||new Date(0))
          if (diff !== 0) return diff
          return (b.PEDIDO_ID || '').localeCompare(a.PEDIDO_ID || '')
        })
      setPedidos(lista)
    } finally { setLoading(false) }
  }

  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos.filter(p => {
    if (tab === 'PENDIENTE' && esCerrado(p)) return false
    if (tab === 'COMPLETADO' && !esCerrado(p)) return false
    if (busqueda && !coincideBusqueda(p, busqueda)) return false
    if (fechaDesde) { const f = parseFecha(p.FECHA_PEDIDO); if (!f || f < new Date(fechaDesde)) return false }
    if (fechaHasta) { const f = parseFecha(p.FECHA_PEDIDO); const h = new Date(fechaHasta); h.setHours(23,59,59); if (!f || f > h) return false }
    return true
  })

  const paginados = filtered.slice(0, visibles)
  const hayMas = filtered.length > visibles

  function expandirTodos() { setExpandedPedidos(new Set(paginados.map(p => p.PEDIDO_ID))) }
  function contraerTodos()  { setExpandedPedidos(new Set()) }

  const pendienteCount = pedidos.filter(p => !esCerrado(p)).length
  const completadoCount = pedidos.filter(p => esCerrado(p)).length

  async function handleFotoGuia(file) {
    if (!file) return
    try {
      const base64 = await resizeImageBase64(file)
      setGuia(g => ({ ...g, fotoBase64: base64, fotoPreview: base64 }))
    } catch(e) { console.error('Error foto:', e) }
  }

  /**
   * Cierra el pedido sin número de guía (taxi, retiro en tienda, entrega en mano).
   * Deja constancia en la bitácora de que se cerró sin guía y de quién lo hizo,
   * para que después se pueda distinguir de un despacho con transportista.
   */
  async function completarSinGuia(p) {
    const pendiente = parseFloat(p.MONTO_PENDIENTE || 0)
    const aviso = pendiente > 0.01
      ? `\n\n⚠️ OJO: este pedido debe $${pendiente.toFixed(2)}. Cobra antes de entregarlo.`
      : ''
    if (!window.confirm(
      `¿Marcar ${p.PEDIDO_ID} como entregado SIN guía?\n\n` +
      `Úsalo para envíos en taxi, entregas en mano o retiros en tienda.${aviso}`
    )) return

    setSaving(true)
    setSavingMsg('Cerrando pedido...')
    try {
      const res = await fetch(`/api/pedidos/${p.PEDIDO_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ESTADO_PEDIDO: 'COMPLETADO',
          NOTA: `Entregado sin guía (taxi / retiro en tienda) por ${user?.nombre || 'despacho'}`,
          _usuarioId: user?.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert('Error: ' + (data.error || 'No se pudo cerrar el pedido')); return }
      await loadPedidos()
    } catch (e) {
      alert('Error de conexión: ' + (e?.message || e))
    } finally { setSaving(false); setSavingMsg('') }
  }

  async function registrarDespacho(pedidoId) {
    if (!guia.numero.trim()) { alert('El número de guía es obligatorio'); return }
    setSaving(true)
    setSavingMsg(guia.fotoBase64 ? 'Subiendo foto...' : 'Guardando...')
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ESTADO_PEDIDO:     'COMPLETADO',
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
      handleTab('COMPLETADO')
      loadPedidos()
    } finally { setSaving(false); setSavingMsg('') }
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-display font-bold text-white">Despachos</h1>
            <span className="text-xs text-gray-500">{pedidos.length} pedido(s)</span>
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={() => handleTab('PENDIENTE')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2
                ${tab === 'PENDIENTE' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>
              📦 Por despachar
              {pendienteCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'PENDIENTE' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                  {pendienteCount}
                </span>
              )}
            </button>
            <button onClick={() => handleTab('COMPLETADO')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2
                ${tab === 'COMPLETADO' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}>
              ✅ Completados
              {completadoCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'COMPLETADO' ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                  {completadoCount}
                </span>
              )}
            </button>
          </div>

          <div className="mb-2">
            <input className="input w-full" placeholder="Buscar por pedido, nombre, cédula o celular..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider px-1">Fecha desde</span>
              <input type="date" className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                ${fechaDesde ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}
                value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider px-1">Fecha hasta</span>
              <input type="date" className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                ${fechaHasta ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}
                value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">{tab === 'PENDIENTE' ? '✅' : '📦'}</div>
              <div className="text-gray-400 font-medium">
                {tab === 'PENDIENTE' ? '¡Todo despachado!' : 'No hay pedidos completados aún'}
              </div>
            </div>
          ) : (
            <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-600">
                {hayMas ? `Mostrando ${paginados.length} de ${filtered.length} pedido(s)` : `${filtered.length} pedido(s)`}
              </div>
              <div className="flex gap-2">
                <button onClick={expandirTodos}
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-all">⊞ Expandir</button>
                <button onClick={contraerTodos}
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-all">⊟ Contraer</button>
              </div>
            </div>
            <div className="space-y-2">
              {paginados.map(p => {
                const esCompletado = esCerrado(p)
                const etiqueta = ESTADO_ETIQUETA[p.ESTADO_PEDIDO] ||
                  { txt: p.ESTADO_PEDIDO, cls: 'bg-gray-500/20 text-gray-400' }
                const montoTotal = parseFloat(p.MONTO_TOTAL || 0)
                const montoPendiente = parseFloat(p.MONTO_PENDIENTE || 0)
                const itemsActivos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
                const isExpanded = expandedPedidos.has(p.PEDIDO_ID)

                return (
                  <div key={p.PEDIDO_ID}
                    className={`card overflow-hidden border-l-4 ${esCompletado ? 'border-l-green-500' : 'border-l-yellow-500'}`}>

                    {/* Cabecera — siempre visible, clic para expandir */}
                    <button
                      onClick={() => setExpandedPedidos(prev => {
                        const n = new Set(prev)
                        n.has(p.PEDIDO_ID) ? n.delete(p.PEDIDO_ID) : n.add(p.PEDIDO_ID)
                        return n
                      })}
                      className="w-full p-4 flex items-center gap-3 hover:bg-gray-800/30 transition-all text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono font-bold text-white">{p.PEDIDO_ID}</span>
                          <span className="text-sm">{p.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                          {/* El estado REAL, no "listo/completado": el chico de
                              despacho necesita distinguir lo que sigue en la
                              fábrica de lo que ya está para salir. */}
                          <span className={`badge text-xs ${etiqueta.cls}`}>{etiqueta.txt}</span>
                          {montoPendiente > 0.01
                            ? <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">Debe ${montoPendiente.toFixed(2)}</span>
                            : <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">✓ Pagado</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.FECHA_PEDIDO?.split(' ')[0]} · {itemsActivos.length} prenda(s) · ${montoTotal.toFixed(2)}
                          {p.GUIA_NUMERO && <span className="text-green-400 ml-2">· Guía #{p.GUIA_NUMERO}</span>}
                        </div>
                      </div>
                      <span className="text-gray-600 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Acciones SIEMPRE visibles: con ~150 pedidos pendientes,
                        obligar a expandir cada uno para cerrarlo es inviable.
                        Van fuera del <button> de arriba porque no se pueden anidar
                        botones dentro de un botón. */}
                    {!esCompletado && (
                      <div className="px-4 pb-3 -mt-1 flex gap-2">
                        <button
                          onClick={() => completarSinGuia(p)}
                          disabled={saving}
                          className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all disabled:opacity-50">
                          ✅ Entregado sin guía
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPedido(p.PEDIDO_ID === selectedPedido ? null : p.PEDIDO_ID)
                            setExpandedPedidos(prev => new Set(prev).add(p.PEDIDO_ID))
                          }}
                          className="flex-1 bg-mandarina-500 hover:bg-mandarina-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all">
                          🚚 Registrar guía
                        </button>
                      </div>
                    )}

                    {/* Contenido expandido */}
                    {isExpanded && (
                      <div className="border-t border-gray-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-mandarina-400 hover:underline">
                            Ver pedido completo →
                          </Link>
                          {/* Las acciones viven arriba, siempre visibles. */}
                        </div>

                        <div className="space-y-2">
                          {itemsActivos.map(item => (
                            <div key={item.ITEM_ID} className="flex items-center gap-3 bg-gray-800/40 rounded-xl px-3 py-2">
                              {item.FOTO_PECHO_URL
                                ? <img src={item.FOTO_PECHO_URL} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-700" />
                                : <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0"><span className="text-gray-600 text-lg">👕</span></div>}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white font-medium truncate">{item.PRODUCTO_NOMBRE}</div>
                                <div className="text-xs text-gray-500">{item.TALLA} · {item.COLOR} · {item.AREA}</div>
                              </div>
                              <span className={"text-xs px-2 py-0.5 rounded-full flex-shrink-0 " + (item.SUBESTADO === 'LISTO' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400')}>
                                {item.SUBESTADO === 'LISTO' ? '✅' : '⏳'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {p.GUIA_NUMERO && (
                          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-3">
                            <div className="text-xl">📦</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-green-400 font-semibold mb-0.5">Guía de despacho</div>
                              <div className="text-white font-mono font-bold"># {p.GUIA_NUMERO}</div>
                              <div className="text-xs text-gray-400">{p.GUIA_TRANSPORTISTA}{p.GUIA_FECHA ? ` · ${p.GUIA_FECHA.split(' ')[0]}` : ''}</div>
                            </div>
                            {p.GUIA_FOTO_URL && (
                              <img src={p.GUIA_FOTO_URL} onClick={() => window.open(p.GUIA_FOTO_URL, '_blank')}
                                className="w-14 h-14 rounded-xl object-cover border border-green-500/30 cursor-pointer hover:opacity-80 transition-opacity" />
                            )}
                          </div>
                        )}

                        {selectedPedido === p.PEDIDO_ID && (
                          <div className="border border-gray-700 rounded-xl bg-gray-900/50 p-4 space-y-3">
                            <div className="text-sm font-semibold text-white">📝 Registrar guía de envío</div>
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

                            <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all
                              ${guia.fotoPreview ? 'border-green-500 bg-green-500/5' : 'border-gray-700 hover:border-gray-500'}`}>
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => handleFotoGuia(e.target.files[0])} />
                              {guia.fotoPreview ? (
                                <div className="flex items-center gap-3 w-full">
                                  <img src={guia.fotoPreview} className="w-14 h-14 rounded-xl object-cover" />
                                  <div className="flex-1">
                                    <div className="text-green-400 text-sm font-medium">✓ Foto cargada</div>
                                    <div className="text-gray-500 text-xs">Toca para cambiar</div>
                                  </div>
                                  <button type="button"
                                    onClick={e => { e.preventDefault(); setGuia(g => ({...g, fotoBase64: null, fotoPreview: null})) }}
                                    className="text-red-400 text-xs p-1">✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">📷</span>
                                  <div>
                                    <div className="text-gray-300 text-sm">Foto de la guía Servientrega</div>
                                    <div className="text-gray-600 text-xs">Opcional · sube a Cloudinary</div>
                                  </div>
                                </div>
                              )}
                            </label>

                            <button
                              onClick={() => registrarDespacho(p.PEDIDO_ID)}
                              disabled={saving || !guia.numero.trim()}
                              className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all
                                bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                              {saving
                                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{savingMsg}</>
                                : '✅ Confirmar despacho → Completado'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {hayMas && (
              <button
                onClick={() => setVisibles(v => v + PAGE_SIZE_D)}
                className="w-full mt-3 py-3 rounded-xl border border-gray-700 text-gray-400 text-sm font-medium hover:bg-gray-800 hover:text-white transition-all">
                Cargar más ({filtered.length - visibles} restantes)
              </button>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
