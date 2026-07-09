'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { coincideBusqueda } from '@/lib/buscarPedido'
import { parseFecha } from '@/lib/parseFecha'

// ─── Constantes de etapa ───────────────────────────────────────────────────────
// El flujo físico de una prenda: ✂️ CORTE → 🏭 PRODUCCIÓN → 🚚 DESPACHO
const ORDEN_SUB = ['SOLICITADO', 'EN_PROCESO', 'ENVIADO_APROBACION', 'LISTO', 'ENTREGADO_TIENDA', 'ELIMINADO']

const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']
const AREA_META = {
  ESTAMPADO:   { label: 'Estampado',   icon: '🎨', text: 'text-orange-400', dot: 'bg-orange-500' },
  SUBLIMACION: { label: 'Sublimación', icon: '💙', text: 'text-blue-400',   dot: 'bg-blue-500' },
  BORDADO:     { label: 'Bordado',     icon: '🧵', text: 'text-purple-400', dot: 'bg-purple-500' },
}

const ETAPAS = {
  CORTE: {
    key: 'CORTE', label: 'Corte', icon: '✂️',
    desc: 'Prendas por cortar',
    color: '#FF6B00', text: 'text-mandarina-400', bg: 'bg-mandarina-500', ring: 'ring-mandarina-500/40', soft: 'bg-mandarina-500/10 border-mandarina-500/30',
  },
  PRODUCCION: {
    key: 'PRODUCCION', label: 'Producción', icon: '🏭',
    desc: 'En confección / estampado',
    color: '#3B82F6', text: 'text-blue-400', bg: 'bg-blue-500', ring: 'ring-blue-500/40', soft: 'bg-blue-500/10 border-blue-500/30',
  },
  DESPACHO: {
    key: 'DESPACHO', label: 'Despacho', icon: '🚚',
    desc: 'Listos y despachados',
    color: '#A855F7', text: 'text-purple-400', bg: 'bg-purple-500', ring: 'ring-purple-500/40', soft: 'bg-purple-500/10 border-purple-500/30',
  },
}
const ETAPA_ORDEN = ['CORTE', 'PRODUCCION', 'DESPACHO']

const TIENDA_META = {
  MANDARINA: { emoji: '🍊', label: 'Mandarina', color: '#FF6B00' },
  INDSTORE:  { emoji: '🏪', label: 'Indstore',  color: '#E91E8C' },
  YAW:       { emoji: '🟣', label: 'YAW',        color: '#6C3FC5' },
}

// ─── Helpers de estado ─────────────────────────────────────────────────────────
function estadoGlobalItem(item) {
  const s = item.SUBESTADO
  if (!s) return 'SOLICITADO'
  if (s.includes(':')) {
    const estados = {}
    s.split('|').forEach(part => { const [a, e] = part.split(':'); if (a && e) estados[a.trim()] = e.trim() })
    const vals = Object.values(estados)
    let mi = ORDEN_SUB.length
    vals.forEach(v => { const i = ORDEN_SUB.indexOf(v); if (i >= 0 && i < mi) mi = i })
    return ORDEN_SUB[mi] || 'SOLICITADO'
  }
  return s
}

// Etapa física de UNA prenda (item) — determina en qué columna cuentan sus unidades
function etapaItem(item) {
  const glob = estadoGlobalItem(item)
  if (glob === 'LISTO' || glob === 'ENTREGADO_TIENDA') return 'DESPACHO'
  const corte = item.SUBESTADO_CORTE || 'PENDIENTE'
  if (corte !== 'CORTADO') return 'CORTE'
  return 'PRODUCCION'
}

// ¿Cuántas unidades tiene una prenda?
const uds = (item) => parseInt(item.CANTIDAD || 1) || 1

// Áreas base que tiene una prenda ("ESTAMPADO + BORDADO" → ['ESTAMPADO','BORDADO'])
function areasItem(areaStr) {
  return (areaStr || '').split(/\s*\+\s*|\s*,\s*/).map(a => a.trim().toUpperCase()).filter(a => AREAS_BASE.includes(a))
}

// Estado de cada área de una prenda → { ESTAMPADO: 'EN_PROCESO', BORDADO: 'SOLICITADO' }
function estadosPorArea(item) {
  const s = item.SUBESTADO || ''
  const areas = areasItem(item.AREA)
  const r = {}
  if (s.includes(':')) {
    s.split('|').forEach(p => { const [a, e] = p.split(':'); if (a && e) r[a.trim().toUpperCase()] = e.trim() })
    areas.forEach(a => { if (!r[a]) r[a] = 'SOLICITADO' })
    return r
  }
  areas.forEach(a => { r[a] = s || 'SOLICITADO' })
  return r
}

// Etapa "principal" del PEDIDO — el cuello de botella: la etapa más atrasada
// de sus prendas activas. Con eso ubicamos el pedido en una sola columna.
function clasificarPedido(p) {
  const estado = p.ESTADO_PEDIDO
  const activos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')

  // Pedidos ya despachados / completados
  if (estado === 'COMPLETADO' || estado === 'DESPACHO' || estado === 'ENTREGADO') {
    return { etapa: 'DESPACHO', sub: 'DESPACHADO' }
  }
  if (activos.length === 0) return null

  const etapasItems = activos.map(etapaItem)
  if (etapasItems.some(e => e === 'CORTE')) return { etapa: 'CORTE', sub: 'EN_CORTE' }
  if (etapasItems.some(e => e === 'PRODUCCION')) return { etapa: 'PRODUCCION', sub: 'EN_PRODUCCION' }
  // Todas las prendas están LISTO → pedido listo para despacho
  return { etapa: 'DESPACHO', sub: 'LISTO' }
}

function diasRestantes(p) {
  if (!p.FECHA_ENTREGA_PROMETIDA) return null
  return Math.ceil((new Date(p.FECHA_ENTREGA_PROMETIDA) - new Date()) / 86400000)
}

// Dot de color por etapa de la prenda (para el mini-progreso del pedido)
function dotClase(item) {
  const e = etapaItem(item)
  if (e === 'DESPACHO') return 'bg-green-500'      // prenda terminada
  if (e === 'PRODUCCION') return 'bg-blue-500'
  return 'bg-mandarina-500'                          // en corte
}

// ─── Tarjeta de pedido dentro de una columna ───────────────────────────────────
function PedidoCard({ p, clasif }) {
  const activos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
  const totalUds = activos.reduce((s, i) => s + uds(i), 0)
  const listas = activos.filter(i => estadoGlobalItem(i) === 'LISTO').length
  const dias = diasRestantes(p)
  const urgente = dias !== null && dias <= 2 && clasif.sub !== 'DESPACHADO'
  const tienda = TIENDA_META[p.TIENDA_ID] || TIENDA_META.MANDARINA
  const pend = parseFloat(p.MONTO_PENDIENTE || 0)
  const et = ETAPAS[clasif.etapa]

  return (
    <Link
      href={`/dashboard/pedido/${p.PEDIDO_ID}`}
      className={`block card p-3 border-l-4 hover:bg-gray-800/40 transition-all ${urgente ? 'border-red-500/50' : ''}`}
      style={!urgente ? { borderLeftColor: et.color } : undefined}>

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-sm font-bold text-white truncate">{p.PEDIDO_ID}</span>
            <span className="text-xs">{tienda.emoji}</span>
            {urgente && <span className="badge bg-red-500/20 text-red-400 text-[10px] px-1.5">🚨</span>}
          </div>
          {p.CLIENTE_NOMBRE && <div className="text-xs text-gray-500 truncate mt-0.5">{p.CLIENTE_NOMBRE}</div>}
        </div>
        {clasif.sub === 'DESPACHADO'
          ? <span className="badge bg-green-500/20 text-green-400 text-[10px] flex-shrink-0">✅ Enviado</span>
          : clasif.sub === 'LISTO'
          ? <span className="badge bg-green-500/20 text-green-400 text-[10px] flex-shrink-0">📦 Listo</span>
          : dias !== null && <span className={`text-[10px] flex-shrink-0 font-medium ${urgente ? 'text-red-400' : 'text-gray-500'}`}>{dias}d</span>}
      </div>

      {/* Resumen cantidad + unidades */}
      <div className="flex items-center gap-3 text-xs mb-2">
        <span className="text-gray-300"><span className="font-bold text-white">{activos.length}</span> prenda{activos.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-600">·</span>
        <span className="text-gray-300"><span className="font-bold text-white">{totalUds}</span> und</span>
        {clasif.etapa !== 'DESPACHO' && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-green-400">{listas}/{activos.length} ✅</span>
          </>
        )}
      </div>

      {/* Mini-progreso: un dot por prenda, color según su etapa */}
      <div className="flex gap-1 flex-wrap">
        {activos.slice(0, 24).map(i => (
          <span key={i.ITEM_ID} className={`w-2 h-2 rounded-full ${dotClase(i)}`} title={`${i.PRODUCTO_NOMBRE} · ${estadoGlobalItem(i)}`} />
        ))}
        {activos.length > 24 && <span className="text-[10px] text-gray-600">+{activos.length - 24}</span>}
      </div>

      {pend > 0.01 && (
        <div className="mt-2 text-[10px] text-yellow-400 bg-yellow-500/10 rounded-md px-1.5 py-0.5 inline-block">
          Debe ${pend.toFixed(2)}
        </div>
      )}
    </Link>
  )
}

// ─── Columna del tablero ───────────────────────────────────────────────────────
function Columna({ etapaKey, resumen, pedidos }) {
  const et = ETAPAS[etapaKey]
  const [visibles, setVisibles] = useState(15)
  useEffect(() => { setVisibles(15) }, [pedidos.length])

  return (
    <div className="flex flex-col min-h-0">
      {/* Cabecera de columna */}
      <div className={`rounded-2xl border p-3 mb-3 ${et.soft}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{et.icon}</span>
          <div className="flex-1">
            <div className={`font-display font-bold text-sm ${et.text}`}>{et.label}</div>
            <div className="text-[11px] text-gray-500">{et.desc}</div>
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div>
            <div className="text-2xl font-black text-white leading-none">{resumen.pedidos}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">pedidos</div>
          </div>
          <div>
            <div className={`text-2xl font-black leading-none ${et.text}`}>{resumen.unidades}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">unidades</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-sm font-bold text-gray-300 leading-none">{resumen.prendas}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">prendas</div>
          </div>
        </div>
        {/* Desglose por subestado */}
        {resumen.desglose.length > 0 && (
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {resumen.desglose.map(d => (
              <span key={d.label} className="text-[10px] bg-gray-900/60 border border-gray-700/50 rounded-full px-2 py-0.5 text-gray-400">
                {d.label} <span className="font-bold text-gray-200">{d.count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Desglose por área — solo Producción: unidades pendientes por área */}
        {resumen.areas && resumen.areas.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-gray-700/40">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Carga por área</div>
            <div className="grid grid-cols-3 gap-1.5">
              {resumen.areas.map(a => (
                <div key={a.key} className="rounded-lg bg-gray-900/60 border border-gray-700/40 px-2 py-1.5 text-center">
                  <div className={`text-base font-black leading-none ${a.text}`}>{a.und}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} />{a.label}
                  </div>
                  <div className="text-[9px] text-gray-600">{a.prendas} prenda{a.prendas !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lista de pedidos */}
      <div className="space-y-2">
        {pedidos.length === 0 ? (
          <div className="card p-6 text-center text-gray-600 text-xs">
            <div className="text-2xl mb-1 opacity-50">{et.icon}</div>
            Sin pedidos en esta etapa
          </div>
        ) : (
          pedidos.slice(0, visibles).map(({ p, clasif }) => (
            <PedidoCard key={p.PEDIDO_ID} p={p} clasif={clasif} />
          ))
        )}
        {pedidos.length > visibles && (
          <button onClick={() => setVisibles(v => v + 15)}
            className="w-full py-2 rounded-xl border border-gray-700 text-gray-400 text-xs font-medium hover:bg-gray-800 hover:text-white transition-all">
            Ver {pedidos.length - visibles} más
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function TableroPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [incluirDespachados, setIncluirDespachados] = useState(false)
  const [tabMovil, setTabMovil] = useState('CORTE')

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    const u = JSON.parse(stored)
    setUser(u)
    loadPedidos()
  }, [])

  const loadPedidos = useCallback(async (intentos = 0) => {
    setLoading(true)
    try {
      const res = await fetch('/api/pedidos?rol=ADMIN&_t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()
      if (!data.pedidos?.length && intentos < 3) {
        setTimeout(() => loadPedidos(intentos + 1), 1500)
        return
      }
      setPedidos(data.pedidos || [])
    } finally { setLoading(false) }
  }, [])

  // Clasificar + filtrar
  const { columnas, totales } = useMemo(() => {
    const cols = { CORTE: [], PRODUCCION: [], DESPACHO: [] }

    const clasificados = pedidos
      .filter(p => {
        if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
        if (busqueda && !coincideBusqueda(p, busqueda)) return false
        return true
      })
      .map(p => ({ p, clasif: clasificarPedido(p) }))
      .filter(x => x.clasif)
      .filter(x => incluirDespachados || x.clasif.sub !== 'DESPACHADO')

    // Ordenar: urgentes primero, luego por fecha de pedido desc
    clasificados.sort((a, b) => {
      const da = diasRestantes(a.p), db = diasRestantes(b.p)
      const ua = da !== null && da <= 2 ? 0 : 1
      const ub = db !== null && db <= 2 ? 0 : 1
      if (ua !== ub) return ua - ub
      const fa = parseFecha(a.p.FECHA_PEDIDO) || new Date(0)
      const fb = parseFecha(b.p.FECHA_PEDIDO) || new Date(0)
      return fb - fa
    })

    clasificados.forEach(x => cols[x.clasif.etapa].push(x))

    // Resúmenes por columna
    const resumen = {}
    for (const key of ETAPA_ORDEN) {
      const lista = cols[key]
      let unidades = 0, prendas = 0
      const subCount = {}
      // Desglose de trabajo pendiente por área (solo Producción)
      const areaCount = { ESTAMPADO: { und: 0, prendas: 0 }, SUBLIMACION: { und: 0, prendas: 0 }, BORDADO: { und: 0, prendas: 0 } }
      lista.forEach(({ p, clasif }) => {
        const activos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
        // Unidades/prendas cuyo item cae físicamente en esta etapa
        activos.forEach(i => {
          const eItem = etapaItem(i)
          const cuenta = key === 'DESPACHO'
            ? true                         // en despacho contamos todo el pedido
            : eItem === key
          if (cuenta) {
            unidades += uds(i); prendas += 1
            // Para producción: cada área que aún no está LISTA suma su carga
            if (key === 'PRODUCCION') {
              const estados = estadosPorArea(i)
              Object.entries(estados).forEach(([a, e]) => {
                if (AREAS_BASE.includes(a) && e !== 'LISTO') { areaCount[a].und += uds(i); areaCount[a].prendas += 1 }
              })
            }
          }
        })
        subCount[clasif.sub] = (subCount[clasif.sub] || 0) + 1
      })

      const desgloseLabels = {
        EN_CORTE: '✂️ Por cortar', EN_PRODUCCION: '🔧 En proceso',
        LISTO: '📦 Listos', DESPACHADO: '✅ Enviados',
      }
      const desglose = Object.entries(subCount)
        .map(([k, count]) => ({ label: desgloseLabels[k] || k, count }))

      const areas = key === 'PRODUCCION'
        ? AREAS_BASE.map(a => ({ key: a, ...AREA_META[a], ...areaCount[a] })).filter(a => a.und > 0)
        : []

      resumen[key] = { pedidos: lista.length, unidades, prendas, desglose, areas }
    }

    // Totales globales
    const totActivos = clasificados.filter(x => x.clasif.sub !== 'DESPACHADO')
    const totUnidades = totActivos.reduce((s, { p }) => {
      const activos = (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO' && i.SUBESTADO !== 'ENTREGADO_TIENDA')
      return s + activos.reduce((ss, i) => ss + uds(i), 0)
    }, 0)
    const urgentes = totActivos.filter(({ p }) => { const d = diasRestantes(p); return d !== null && d <= 2 }).length

    return {
      columnas: { cols, resumen },
      totales: { pedidos: totActivos.length, unidades: totUnidades, urgentes },
    }
  }, [pedidos, busqueda, filtroTienda, incluirDespachados])

  const { cols, resumen } = columnas

  return (
    <div className="flex flex-col h-screen md:h-auto md:min-h-screen">
      {/* ── Cabecera fija ── */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">📊 Tablero de Producción</h1>
                <p className="text-xs text-gray-500">
                  {totales.pedidos} pedido(s) activos · {totales.unidades} unidades en proceso
                </p>
              </div>
            </div>
            <button onClick={() => loadPedidos()} disabled={loading}
              className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
              {loading ? <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🔄'}
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="Buscar por pedido, nombre, cédula o celular..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <select value={filtroTienda} onChange={e => setFiltroTienda(e.target.value)}
              className={`bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                ${filtroTienda !== 'TODAS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
              <option value="TODAS">🏬 Todas las tiendas</option>
              <option value="MANDARINA">🍊 Mandarina</option>
              <option value="INDSTORE">🏪 Indstore</option>
              <option value="YAW">🟣 YAW</option>
            </select>
            <button onClick={() => setIncluirDespachados(v => !v)}
              className={`text-sm px-3 py-2.5 min-h-[44px] rounded-xl border transition-all whitespace-nowrap
                ${incluirDespachados ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
              {incluirDespachados ? '✅ Con despachados' : '➕ Ver despachados'}
            </button>
          </div>

          {totales.urgentes > 0 && (
            <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-1.5">
              <span className="text-red-400 text-xs font-semibold">🚨 {totales.urgentes} pedido(s) urgente(s) — entrega en ≤2 días</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Pipeline resumen — barra superior con flechas (desktop) */}
              <div className="hidden md:flex items-stretch gap-2 mb-5">
                {ETAPA_ORDEN.map((key, idx) => {
                  const et = ETAPAS[key]
                  const r = resumen[key]
                  return (
                    <div key={key} className="flex items-stretch flex-1">
                      <div className={`flex-1 rounded-2xl border p-4 ${et.soft}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{et.icon}</span>
                          <span className={`font-display font-bold ${et.text}`}>{et.label}</span>
                        </div>
                        <div className="flex items-end gap-5">
                          <div>
                            <div className="text-3xl font-black text-white leading-none">{r.pedidos}</div>
                            <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-1">pedidos</div>
                          </div>
                          <div>
                            <div className={`text-3xl font-black leading-none ${et.text}`}>{r.unidades}</div>
                            <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-1">unidades</div>
                          </div>
                        </div>
                        {/* Carga por área — solo Producción */}
                        {r.areas && r.areas.length > 0 && (
                          <div className="flex gap-3 mt-3 pt-3 border-t border-gray-700/40">
                            {r.areas.map(a => (
                              <div key={a.key} className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                                <span className="text-xs text-gray-400">{a.label}</span>
                                <span className={`text-sm font-bold ${a.text}`}>{a.und}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {idx < ETAPA_ORDEN.length - 1 && (
                        <div className="flex items-center px-1 text-gray-700 text-2xl">→</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Selector de columna (móvil) */}
              <div className="md:hidden grid grid-cols-3 gap-2 mb-4">
                {ETAPA_ORDEN.map(key => {
                  const et = ETAPAS[key]
                  const r = resumen[key]
                  const activo = tabMovil === key
                  return (
                    <button key={key} onClick={() => setTabMovil(key)}
                      className={`flex flex-col items-center py-2.5 rounded-xl border-2 transition-all
                        ${activo ? et.soft : 'border-gray-800 bg-gray-900'}`}>
                      <span className="text-lg">{et.icon}</span>
                      <span className={`text-lg font-black ${activo ? et.text : 'text-gray-400'}`}>{r.pedidos}</span>
                      <span className="text-[10px] text-gray-500">{r.unidades} und</span>
                    </button>
                  )
                })}
              </div>

              {/* Tablero — 3 columnas desktop, 1 columna (tab activa) móvil */}
              <div className="hidden md:grid md:grid-cols-3 gap-4 items-start">
                {ETAPA_ORDEN.map(key => (
                  <Columna key={key} etapaKey={key} resumen={resumen[key]} pedidos={cols[key]} />
                ))}
              </div>
              <div className="md:hidden">
                <Columna key={tabMovil} etapaKey={tabMovil} resumen={resumen[tabMovil]} pedidos={cols[tabMovil]} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
