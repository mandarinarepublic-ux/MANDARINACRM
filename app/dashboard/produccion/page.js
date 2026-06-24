'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha } from '@/lib/parseFecha'
import { PdfConfeccion } from '@/components/pedido/PdfPedido'

const SUBESTADO_CONFIG = {
  SOLICITADO:         { label: '⏳ Solicitado',          color: 'bg-yellow-500' },
  EN_PROCESO:         { label: '🔧 En proceso',          color: 'bg-blue-500' },
  ENVIADO_APROBACION: { label: '📤 Enviado aprobación',  color: 'bg-purple-500' },
  LISTO:              { label: '✅ Listo',               color: 'bg-green-500' },
  ENTREGADO_TIENDA:   { label: '🏪 Entregado en tienda', color: 'bg-gray-500' },
}
const SUBESTADOS_ORDEN = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO']

function itemEsDeUsuario(itemArea, u) {
  if (!itemArea) return false
  if (u.rol === 'ADMIN') return true
  if (u.rol === 'CORTE') return true
  const areas = u.areas || []
  if (areas.length > 0 && !(areas.length === 1 && areas[0] === 'TODAS')) {
    return areas.some(a => itemArea.includes(a))
  }
  if (u.rol === 'ESTAMPADO')   return itemArea.includes('ESTAMPADO')
  if (u.rol === 'SUBLIMACION') return itemArea.includes('SUBLIMACION')
  if (u.rol === 'BORDADO')     return itemArea.includes('BORDADO')
  return true
}

const AREAS_BASE_P = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']
const ORDEN_P = ['SOLICITADO','EN_PROCESO','ENVIADO_APROBACION','LISTO','ENTREGADO_TIENDA','ELIMINADO']

function parseSubestadoP(str, areaStr) {
  if (!str) return null
  const areas = (areaStr||'').split(/\s*\+\s*|\s*,\s*/).map(a=>a.trim().toUpperCase()).filter(a=>AREAS_BASE_P.includes(a))
  if (str.includes(':')) {
    const r={}; str.split('|').forEach(p=>{const[a,e]=p.split(':');if(a&&e)r[a.trim()]=e.trim()})
    return {tipo:'multi', estados:r, areas}
  }
  if (areas.length>1) { const r={}; areas.forEach(a=>r[a]=str); return {tipo:'multi',estados:r,areas} }
  return {tipo:'simple', estado:str, areas}
}
function globalP(estados) {
  const vals=Object.values(estados); let mi=ORDEN_P.length
  vals.forEach(v=>{const i=ORDEN_P.indexOf(v);if(i>=0&&i<mi)mi=i})
  return ORDEN_P[mi]||'SOLICITADO'
}
function areaUsuarioP(u, item) {
  if (u?.rol==='ADMIN') return null
  const areas=(u?.areas||[]).filter(a=>AREAS_BASE_P.includes(a))
  if (areas.length>0&&areas[0]!=='TODAS') return areas.find(a=>(item.AREA||'').toUpperCase().includes(a))||null
  if (u?.rol==='ESTAMPADO')   return (item.AREA||'').includes('ESTAMPADO')   ? 'ESTAMPADO'   : null
  if (u?.rol==='SUBLIMACION') return (item.AREA||'').includes('SUBLIMACION') ? 'SUBLIMACION' : null
  if (u?.rol==='BORDADO')     return (item.AREA||'').includes('BORDADO')     ? 'BORDADO'     : null
  return null
}
const AREA_COLORS = { ESTAMPADO: 'text-orange-400', SUBLIMACION: 'text-blue-400', BORDADO: 'text-purple-400' }
const TIENDA_COLORS = { MANDARINA: '#FF6B00', INDSTORE: '#E91E8C', YAW: '#6C3FC5' }

// ─── ItemCard ─────────────────────────────────────────────────────────────────
function ItemCard({ item, userId, user, onSubestadoChange }) {
  const parsed = parseSubestadoP(item.SUBESTADO, item.AREA)
  const esMulti = parsed?.tipo === 'multi'
  const miArea = areaUsuarioP(user, item)

  const [estadosLocales, setEstadosLocales] = useState(
    esMulti ? {...parsed.estados} : {_s: parsed?.estado||'SOLICITADO'}
  )
  const subestadoActual = esMulti ? globalP(estadosLocales) : (estadosLocales._s||'SOLICITADO')

  const [subestadoCorte, setSubestadoCorte] = useState(item.SUBESTADO_CORTE || 'PENDIENTE')
  const CORTE_CONFIG = [
    { key: 'PENDIENTE',  label: '✂️ Pendiente',  cls: 'bg-gray-600' },
    { key: 'SOLICITADO', label: '🛒 Solicitado', cls: 'bg-yellow-500' },
    { key: 'CORTADO',    label: '✅ Cortado',    cls: 'bg-green-500' },
  ]

  async function handleCorte(s) {
    const prev = subestadoCorte; setSubestadoCorte(s)
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ SUBESTADO_CORTE: s, _usuarioId: userId }),
      })
      if (!res.ok) setSubestadoCorte(prev)
    } catch { setSubestadoCorte(prev) }
  }

  const fotos = [
    { key: 'FOTO_PECHO_URL', label: 'Pecho' },
    { key: 'FOTO_ESPALDA_URL', label: 'Espalda' },
    { key: 'FOTO_MANGA_D_URL', label: 'M.Der' },
    { key: 'FOTO_MANGA_I_URL', label: 'M.Izq' },
  ].filter(f => item[f.key])

  const [fotoActiva, setFotoActiva] = useState(fotos[0]?.key || null)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)
  const [editingNota, setEditingNota] = useState(false)
  const [notaText, setNotaText] = useState(item.NOTAS_AREA || '')
  const [notaGuardada, setNotaGuardada] = useState(item.NOTAS_AREA || '')
  const [savingNota, setSavingNota] = useState(false)
  const [notaError, setNotaError] = useState('')

  async function handleSubestado(s, areaRol) {
    const body = { SUBESTADO: s, _usuarioId: userId }
    if (areaRol) body.AREA_ROL = areaRol
    if (areaRol) {
      setEstadosLocales(prev => ({...prev, [areaRol]: s}))
    } else {
      setEstadosLocales({_s: s})
    }
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setEstadosLocales(esMulti ? {...parsed.estados} : {_s: parsed?.estado||'SOLICITADO'})
      } else {
        const nuevoGlobal = areaRol ? globalP({...estadosLocales, [areaRol]: s}) : s
        onSubestadoChange?.(item.ITEM_ID, nuevoGlobal)
      }
    } catch {
      setEstadosLocales(esMulti ? {...parsed.estados} : {_s: parsed?.estado||'SOLICITADO'})
    }
  }

  async function handleGuardarNota() {
    setSavingNota(true); setNotaError('')
    try {
      const res = await fetch(`/api/pedidos/item/${item.ITEM_ID}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ NOTAS_AREA: notaText, _usuarioId: userId }),
      })
      const data = await res.json()
      if (res.ok && data.ok) { setNotaGuardada(notaText); setEditingNota(false) }
      else setNotaError(data.error || 'Error al guardar')
    } catch { setNotaError('Error de conexión') }
    finally { setSavingNota(false) }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-white">{item.PRODUCTO_NOMBRE}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.COLOR} · {item.TALLA} · {item.CANTIDAD} uni</div>
        </div>
        <span className={`badge text-xs text-white ${SUBESTADO_CONFIG[subestadoActual]?.color || 'bg-gray-700'}`}>
          {SUBESTADO_CONFIG[subestadoActual]?.label || subestadoActual}
        </span>
      </div>

      <div className="flex gap-4">
        <div className="w-40 flex-shrink-0">
          {fotos.length > 0 ? (
            <>
              <div className="w-40 h-40 rounded-xl overflow-hidden border border-gray-700 bg-gray-800 mb-2 cursor-pointer"
                onDoubleClick={() => setFotoFullscreen(item[fotoActiva || fotos[0].key])}>
                <img src={item[fotoActiva || fotos[0].key]} className="w-full h-full object-contain" alt="foto" />
              </div>
              {fotos.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {fotos.map(f => (
                    <button key={f.key} onClick={() => setFotoActiva(f.key)}
                      className={`flex flex-col items-center gap-0.5 p-0.5 rounded-lg border transition-all
                        ${(fotoActiva || fotos[0].key) === f.key ? 'border-mandarina-500' : 'border-gray-700'}`}>
                      <img src={item[f.key]} className="w-10 h-10 rounded object-cover" alt={f.label} />
                      <span className="text-xs text-gray-500">{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-600 mt-1 text-center">2× clic = pantalla completa</div>
            </>
          ) : (
            <div className="w-40 h-40 rounded-xl border border-gray-800 bg-gray-800/50 flex items-center justify-center">
              <span className="text-gray-600 text-xs text-center px-2">Sin fotos de diseño</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="bg-gray-800/50 rounded-xl px-3 py-2 space-y-1.5">
            <div className="text-xs"><span className="text-gray-500">Área:</span>{' '}<span className="text-mandarina-400 font-medium">{item.AREA}</span></div>
            {item.DETALLE_PERSONALIZADO && (
              <div className="text-xs"><span className="text-gray-500">Detalle:</span>{' '}<span className="text-gray-300">{item.DETALLE_PERSONALIZADO}</span></div>
            )}
          </div>

          {editingNota ? (
            <div>
              <textarea className="input resize-none text-sm mb-2 w-full" rows={2} placeholder="Nota para este producto..."
                value={notaText} onChange={e => setNotaText(e.target.value)} autoFocus />
              {notaError && <div className="text-xs text-red-400 mb-2">⚠️ {notaError}</div>}
              <div className="flex gap-2">
                <button onClick={handleGuardarNota} disabled={savingNota} className="btn-primary text-xs px-3 py-1.5">
                  {savingNota ? '⏳ Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => {setNotaText(notaGuardada);setEditingNota(false);setNotaError('')}} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
              </div>
            </div>
          ) : (
            <div>
              {notaGuardada && <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-1">📝 {notaGuardada}</div>}
              <button onClick={() => {setNotaText(notaGuardada);setEditingNota(true)}} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                {notaGuardada ? '✏️ Editar nota' : '+ Agregar nota'}
              </button>
            </div>
          )}

          {(user?.rol === 'CORTE' || user?.rol === 'ADMIN') ? (
            <div className="rounded-xl border border-gray-700 p-2">
              <div className="text-xs font-bold text-gray-400 mb-1.5">✂️ CORTE DE TELA</div>
              <div className="flex gap-1">
                {CORTE_CONFIG.map(s => (
                  <button key={s.key} onClick={() => handleCorte(s.key)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                      ${subestadoCorte===s.key ? `${s.cls} text-white` : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2">
              <span className="text-xs text-gray-500">✂️ Corte:</span>
              <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${
                subestadoCorte==='CORTADO' ? 'bg-green-600' : subestadoCorte==='SOLICITADO' ? 'bg-yellow-600' : 'bg-gray-600'
              }`}>
                {CORTE_CONFIG.find(s=>s.key===subestadoCorte)?.label || subestadoCorte}
              </span>
            </div>
          )}

          {user?.rol !== 'CORTE' && (esMulti ? (
            <div className="space-y-2">
              {parsed.areas.map(area => {
                const estadoArea = estadosLocales[area] || 'SOLICITADO'
                const esMiArea = user?.rol === 'ADMIN' || miArea === area
                return (
                  <div key={area} className={`rounded-xl border p-2 ${esMiArea ? 'border-gray-700' : 'border-gray-800 opacity-50'}`}>
                    <div className={`text-xs font-bold mb-1.5 ${AREA_COLORS[area]||'text-gray-400'}`}>{area}</div>
                    {esMiArea ? (
                      <div className="grid grid-cols-2 gap-1">
                        {SUBESTADOS_ORDEN.map(s => (
                          <button key={s} onClick={() => handleSubestado(s, area)}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-all
                              ${estadoArea===s ? `${SUBESTADO_CONFIG[s]?.color} text-white` : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                            {SUBESTADO_CONFIG[s]?.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`badge text-xs text-white ${SUBESTADO_CONFIG[estadoArea]?.color||'bg-gray-700'}`}>
                        {SUBESTADO_CONFIG[estadoArea]?.label||estadoArea}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 mt-auto">
              {SUBESTADOS_ORDEN.map(s => (
                <button key={s} onClick={() => handleSubestado(s, null)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all
                    ${subestadoActual===s ? `${SUBESTADO_CONFIG[s]?.color} text-white` : 'bg-gray-800 text-gray-500 hover:text-white'}`}>
                  {SUBESTADO_CONFIG[s]?.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {fotoFullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setFotoFullscreen(null)}>
          <img src={fotoFullscreen} className="max-w-full max-h-full object-contain rounded-xl" alt="fullscreen" />
          <button className="absolute top-4 right-4 text-white text-2xl bg-black/50 rounded-full w-10 h-10 flex items-center justify-center">✕</button>
        </div>
      )}
    </div>
  )
}

export default function ProduccionPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroSubestado, setFiltroSubestado] = useState('TODOS')
  const [expandedPedidos, setExpandedPedidos] = useState(new Set())
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [mostrarFecha, setMostrarFecha] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadItems(u)
  }, [])

  const loadItems = useCallback(async (u, intentos = 0) => {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN&_t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      if (!data.pedidos?.length && intentos < 3) {
        setTimeout(() => loadItems(u, intentos + 1), 1500)
        return
      }
      const pedidosConItems = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .sort((a, b) => {
          const fa = parseFecha(a.FECHA_PEDIDO) || new Date(0)
          const fb = parseFecha(b.FECHA_PEDIDO) || new Date(0)
          if (fb - fa !== 0) return fb - fa
          return (b.PEDIDO_ID || '').localeCompare(a.PEDIDO_ID || '')
        })
        .map(p => ({
          ...p,
          itemsFiltrados: (p.items || []).filter(item => {
            if (item.SUBESTADO === 'ELIMINADO' || item.SUBESTADO === 'ENTREGADO_TIENDA') return false
            if (u.rol !== 'ADMIN') return itemEsDeUsuario(item.AREA, u)
            return true
          })
        }))
        .filter(p => p.itemsFiltrados.length > 0)
      setPedidos(pedidosConItems)
    } finally { setLoading(false) }
  }, [])

  function handleSubestadoChange(itemId, nuevoSubestado) {
    setPedidos(prev => prev.map(p => ({
      ...p,
      itemsFiltrados: p.itemsFiltrados.map(item =>
        item.ITEM_ID === itemId ? { ...item, SUBESTADO: nuevoSubestado } : item
      )
    })))
  }

  const hayFecha = fechaDesde || fechaHasta

  const filtered = pedidos
    .map(p => ({
      ...p,
      itemsFiltrados: p.itemsFiltrados.filter(item => {
        const estadoGlobal = (() => {
          if (!item.SUBESTADO) return 'SOLICITADO'
          if (item.SUBESTADO.includes(':')) {
            const estados = {}
            item.SUBESTADO.split('|').forEach(part => {
              const [a,e] = part.split(':'); if(a&&e) estados[a.trim()]=e.trim()
            })
            const vals = Object.values(estados)
            const idx = Math.min(...vals.map(v => ORDEN_P.indexOf(v)).filter(i => i>=0))
            return ORDEN_P[idx] || 'SOLICITADO'
          }
          return item.SUBESTADO
        })()
        if (filtroSubestado === 'TODOS') return estadoGlobal !== 'LISTO'
        return estadoGlobal === filtroSubestado
      })
    }))
    .filter(p => {
      if (p.itemsFiltrados.length === 0) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const matchPedidoOCliente = coincideBusqueda(p, busqueda)
        const matchProducto = p.itemsFiltrados.some(i => i.PRODUCTO_NOMBRE?.toLowerCase().includes(q))
        if (!matchPedidoOCliente && !matchProducto) return false
      }
      if (fechaDesde) { const f = parseFecha(p.FECHA_PEDIDO); if (!f || f < new Date(fechaDesde)) return false }
      if (fechaHasta) {
        const f = parseFecha(p.FECHA_PEDIDO)
        const h = new Date(fechaHasta); h.setHours(23,59,59)
        if (!f || f > h) return false
      }
      return true
    })

  const totalPendientes = filtered.reduce((s, p) => s + p.itemsFiltrados.length, 0)
  const urgentes = filtered.filter(p => p.FECHA_ENTREGA_PROMETIDA &&
    Math.ceil((new Date(p.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000) <= 2).length

  const areaLabel = user?.rol === 'ADMIN' ? '' :
    (user?.areas?.length > 0 && user.areas[0] !== 'TODAS') ? ` · ${user.areas.join(', ')}` : ` · ${user?.rol}`

  function expandirTodos() { setExpandedPedidos(new Set(filtered.map(p => p.PEDIDO_ID))) }
  function contraerTodos()  { setExpandedPedidos(new Set()) }

  async function handleVerPdf(e, pedido) {
    e.stopPropagation()
    setGenerandoPdf(pedido.PEDIDO_ID)
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default
      const el = document.getElementById(`pdf-prod-${pedido.PEDIDO_ID}`)
      if (!el) { alert('Error: elemento PDF no encontrado'); return }
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' })
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
      canvas.width = 1; canvas.height = 1
      const url = pdf.output('bloburl')
      window.open(url, '_blank')
    } catch(err) {
      alert('Error generando PDF: ' + err.message)
    } finally {
      setGenerandoPdf(null)
    }
  }

  return (
    <div className="flex flex-col h-screen md:h-auto">
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">Producción</h1>
                <p className="text-xs text-gray-500">{totalPendientes} ítem(s) pendientes{areaLabel}</p>
              </div>
            </div>
            <Link href="/dashboard/impresion" className="btn-secondary text-xs px-3 py-2">🖨️ Imprimir</Link>
          </div>

          <div className="flex gap-2 mb-3">
            <input className="input flex-1" placeholder="Buscar por pedido, producto, nombre, cédula o celular..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <button onClick={() => setMostrarFecha(v => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all flex-shrink-0
                ${hayFecha ? 'border-mandarina-500 text-mandarina-400 bg-mandarina-500/10' : 'border-gray-700 text-gray-500'}`}>
              📅 {hayFecha ? 'Fecha ✓' : 'Fecha'}
            </button>
          </div>

          {mostrarFecha && (
            <div className="flex gap-2 mb-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                <input type="date" className="input text-sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                <input type="date" className="input text-sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              </div>
              {hayFecha && <button onClick={() => {setFechaDesde('');setFechaHasta('')}} className="text-xs text-gray-500 hover:text-red-400 pb-2 px-2">✕</button>}
            </div>
          )}

          <div className="flex gap-2 mt-2 mb-2">
            <button onClick={expandirTodos}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all flex-shrink-0">
              ⊞ Expandir todos
            </button>
            <button onClick={contraerTodos}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all flex-shrink-0">
              ⊟ Contraer todos
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
            {[
              { key: 'TODOS', label: 'Todos' },
              { key: 'SOLICITADO', label: '⏳ Solicitado' },
              { key: 'EN_PROCESO', label: '🔧 En proceso' },
              { key: 'ENVIADO_APROBACION', label: '📤 Enviado aprobación' },
              { key: 'LISTO', label: '✅ Listo' },
            ].map(f => (
              <button key={f.key} onClick={() => setFiltroSubestado(f.key)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex-shrink-0
                  ${filtroSubestado === f.key ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {urgentes > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <div className="text-red-400 font-semibold text-sm">🚨 {urgentes} pedido(s) urgente(s) — entrega en ≤2 días</div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="font-medium text-white">¡Todo al día!</div>
              <div className="text-sm text-gray-500 mt-1">No hay ítems pendientes en tu área</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(pedido => {
                const diasR = pedido.FECHA_ENTREGA_PROMETIDA
                  ? Math.ceil((new Date(pedido.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000) : null
                const urgente = diasR !== null && diasR <= 2
                const isExpanded = expandedPedidos.has(pedido.PEDIDO_ID)
                const generando = generandoPdf === pedido.PEDIDO_ID
                const tiendaColor = TIENDA_COLORS[pedido.TIENDA_ID] || '#FF6B00'

                return (
                  <div key={pedido.PEDIDO_ID} className={`card overflow-hidden ${urgente ? 'border-red-500/40' : ''}`}>
                    <button
                      onClick={() => setExpandedPedidos(prev => { const n = new Set(prev); n.has(pedido.PEDIDO_ID) ? n.delete(pedido.PEDIDO_ID) : n.add(pedido.PEDIDO_ID); return n })}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-800/30 transition-all text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <Link href={`/dashboard/pedido/${pedido.PEDIDO_ID}`}
                            onClick={e => e.stopPropagation()}
                            className="font-mono text-sm font-medium text-mandarina-400 hover:underline">
                            {pedido.PEDIDO_ID}
                          </Link>
                          {urgente && <span className="badge bg-red-500/20 text-red-400 text-xs">🚨 Urgente</span>}
                          <span className="text-xs text-gray-600">{pedido.TIENDA_ID === 'MANDARINA' ? '🍊' : '🏪'}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {pedido.itemsFiltrados.length} ítem(s){diasR !== null && ` · ${diasR}d restantes`} · {pedido.FECHA_PEDIDO?.split(' ')[0] || ''}
                        </div>
                      </div>

                      {/* Botón PDF — no propaga el clic al expand */}
                      <button
                        onClick={e => handleVerPdf(e, pedido)}
                        disabled={generando}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex-shrink-0
                          ${generando
                            ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                            : 'border-gray-600 text-gray-300 hover:border-white hover:text-white hover:bg-gray-800'}`}
                        title="Descargar hoja de confección PDF">
                        {generando
                          ? <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                          : '📄'}
                        <span className="hidden sm:inline">{generando ? 'PDF...' : 'PDF'}</span>
                      </button>

                      <span className="text-gray-600 text-sm flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800">
                        {pedido.itemsFiltrados.map(item => (
                          <ItemCard
                            key={item.ITEM_ID}
                            item={item}
                            userId={user?.id}
                            user={user}
                            onSubestadoChange={handleSubestadoChange}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* PDFs off-screen para captura con html2canvas — uno por pedido visible */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '794px', backgroundColor: 'white', zIndex: -1 }}>
        {pedidos.map(pedido => (
          <div key={pedido.PEDIDO_ID} id={`pdf-prod-${pedido.PEDIDO_ID}`}>
            <PdfConfeccion
              pedido={pedido}
              items={pedido.items || []}
              tiendaColor={TIENDA_COLORS[pedido.TIENDA_ID] || '#FF6B00'}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
