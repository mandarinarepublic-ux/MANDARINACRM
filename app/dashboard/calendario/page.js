'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { parseFecha } from '@/lib/parseFecha'
import { PdfConfeccionPagina, paginarItems } from '@/components/pedido/PdfPedido'
import { generarPdfDesdeIds } from '@/lib/generarPdf'

// Color por tienda para la orden de confección (mismo criterio que Producción).
const TIENDA_COLORS = { MANDARINA: '#FF6B00', INDSTORE: '#E91E8C', YAW: '#6C3FC5' }

// ─── Constantes ────────────────────────────────────────────────────────────────
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DOW_LARGO = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const DOW_CAB = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

const TIENDA_META = {
  MANDARINA: { emoji: '🍊', label: 'Mandarina' },
  INDSTORE:  { emoji: '🏪', label: 'Indstore' },
  YAW:       { emoji: '🟣', label: 'YAW' },
}

const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']
const AREA_META = {
  ESTAMPADO:   { label: 'Estampado',   icon: '🎨' },
  SUBLIMACION: { label: 'Sublimación', icon: '💙' },
  BORDADO:     { label: 'Bordado',     icon: '🧵' },
}

// Semáforo de estado en el calendario
const ESTADO_META = {
  red: { label: 'Atrasado',  dot: 'bg-red-500',    text: 'text-red-400',    chip: 'bg-red-500/10',    hex: '#ef4444' },
  amb: { label: 'Vence hoy', dot: 'bg-amber-500',  text: 'text-amber-400',  chip: 'bg-amber-500/10',  hex: '#f59e0b' },
  azu: { label: 'Pendiente', dot: 'bg-blue-500',   text: 'text-blue-400',   chip: 'bg-blue-500/10',   hex: '#3b82f6' },
  grn: { label: 'Entregado', dot: 'bg-green-500',  text: 'text-green-400',  chip: 'bg-green-500/10',  hex: '#22c55e' },
}
const ESTADO_ORDEN = ['red', 'amb', 'azu', 'grn']

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')
function dateISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function hoyISO() { return dateISO(new Date()) }

// Normaliza FECHA_ENTREGA_PROMETIDA a "YYYY-MM-DD" (soporta ISO, YYYY-MM-DD y "16Jun2026")
function fechaEntregaISO(p) {
  const v = p.FECHA_ENTREGA_PROMETIDA
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const f = parseFecha(s)
  return f && !isNaN(f) ? dateISO(f) : null
}

const ENTREGADO = p => ['DESPACHO', 'ENTREGADO', 'COMPLETADO'].includes(p.ESTADO_PEDIDO)
const uds = i => parseInt(i.CANTIDAD || 1) || 1
const itemsActivos = p => (p.items || []).filter(i => i.SUBESTADO !== 'ELIMINADO')
const prendasDe = p => itemsActivos(p).reduce((s, i) => s + uds(i), 0)

// Áreas base presentes en un pedido (a partir del AREA de cada prenda)
function areasDe(p) {
  const set = new Set()
  itemsActivos(p).forEach(i => {
    ;(i.AREA || '').split(/\s*\+\s*|\s*,\s*/).forEach(a => {
      const A = a.trim().toUpperCase()
      if (AREAS_BASE.includes(A)) set.add(A)
    })
  })
  return set
}

function estadoColor(p, hoy) {
  if (ENTREGADO(p)) return 'grn'
  const f = fechaEntregaISO(p)
  if (!f) return null
  if (f < hoy) return 'red'
  if (f === hoy) return 'amb'
  return 'azu'
}

function fmtLargo(dISO) {
  const [Y, M, D] = dISO.split('-').map(Number)
  const dow = DOW_LARGO[new Date(Y, M - 1, D).getDay()]
  return `${dow} ${D} de ${MESES[M - 1]} ${Y}`
}

// ─── Dropdown multi-selección ──────────────────────────────────────────────────
function MultiSelect({ icon, opciones, sel, onChange, resumen }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])
  function toggle(val) {
    const s = new Set(sel)
    s.has(val) ? s.delete(val) : s.add(val)
    onChange(s)
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="bg-gray-800 border border-gray-700 text-gray-300 rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer hover:border-gray-600 transition-all flex items-center gap-1.5 whitespace-nowrap">
        <span>{icon}</span><span>{resumen}</span><span className="opacity-60 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-40 min-w-[210px] bg-gray-900 border border-gray-700 rounded-xl p-1.5 shadow-2xl">
          {opciones.map(o => (
            <label key={o.value}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-200 cursor-pointer hover:bg-gray-800">
              <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)}
                className="w-4 h-4 accent-mandarina-500" />
              {o.dot && <span className={`w-2.5 h-2.5 rounded-sm ${o.dot}`} />}
              {o.icon && <span>{o.icon}</span>}
              {o.label}
            </label>
          ))}
          <div className="flex gap-1.5 pt-1.5 mt-1 border-t border-gray-800">
            <button type="button" onClick={() => onChange(new Set(opciones.map(o => o.value)))}
              className="flex-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg py-1.5">Todos</button>
            <button type="button" onClick={() => onChange(new Set())}
              className="flex-1 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg py-1.5">Ninguno</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default function CalendarioPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const hoy = useMemo(() => hoyISO(), [])

  const [cur, setCur] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [filtroTienda, setFiltroTienda] = useState('TODAS')
  const [estados, setEstados] = useState(() => new Set(['red', 'amb', 'azu', 'grn']))
  const [subareas, setSubareas] = useState(() => new Set(AREAS_BASE))
  const [selDia, setSelDia] = useState(null)
  const [pdfPedido, setPdfPedido] = useState(null)   // pedido montado off-screen para el PDF
  const [generandoPdf, setGenerandoPdf] = useState(null)

  // Genera la orden de producción (confección) de un pedido, sin salir del calendario.
  async function verPdfConfeccion(p) {
    if (generandoPdf) return
    setGenerandoPdf(p.PEDIDO_ID)
    setPdfPedido(p)
    // Esperar a que React pinte la zona oculta antes de capturarla.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150))))
    try {
      const ids = paginarItems(p.items).map((_, i) => `cal-pdf-${p.PEDIDO_ID}-${i}`)
      await generarPdfDesdeIds(ids, `${p.PEDIDO_ID}-confeccion.pdf`)
    } catch (e) {
      alert('No se pudo generar el PDF: ' + (e?.message || e))
    } finally {
      setGenerandoPdf(null)
      setPdfPedido(null)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
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

  // ¿el pedido pasa los filtros de tienda / estado / sub-área?
  const pasaFiltros = useCallback((p) => {
    if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
    const k = estadoColor(p, hoy)
    if (!k || !estados.has(k)) return false
    // Sub-área: con las 3 marcadas = sin filtro (muestra todo, incluido "sin diseño");
    // con una selección parcial, solo pedidos que tengan alguna de esas áreas.
    if (subareas.size < AREAS_BASE.length) {
      if (subareas.size === 0) return false
      const a = areasDe(p)
      let ok = false
      subareas.forEach(s => { if (a.has(s)) ok = true })
      if (!ok) return false
    }
    return true
  }, [filtroTienda, estados, subareas, hoy])

  // Pedidos con fecha de entrega, ya filtrados, agrupados por día
  const { porDia, statsMes } = useMemo(() => {
    const y = cur.getFullYear(), m = cur.getMonth()
    const porDia = {}
    const conteo = { total: 0, red: 0, amb: 0, grn: 0 }
    pedidos.forEach(p => {
      const f = fechaEntregaISO(p)
      if (!f || !pasaFiltros(p)) return
      ;(porDia[f] = porDia[f] || []).push(p)
      const [py, pm] = f.split('-').map(Number)
      if (py === y && pm === m + 1) {
        conteo.total++
        const k = estadoColor(p, hoy)
        if (k in conteo) conteo[k]++
      }
    })
    Object.values(porDia).forEach(arr => arr.sort((a, b) => (a.PEDIDO_ID || '').localeCompare(b.PEDIDO_ID || '')))
    return { porDia, statsMes: conteo }
  }, [pedidos, cur, pasaFiltros, hoy])

  // Celdas de la grilla (semana Lun→Dom)
  const celdas = useMemo(() => {
    const y = cur.getFullYear(), m = cur.getMonth()
    const start = (new Date(y, m, 1).getDay() + 6) % 7 // lunes = 0
    const diasMes = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < start; i++) cells.push({ out: true })
    for (let d = 1; d <= diasMes; d++) cells.push({ out: false, iso: dateISO(new Date(y, m, d)), d, dow: new Date(y, m, d).getDay() })
    while (cells.length % 7 !== 0 || cells.length < 35) cells.push({ out: true })
    return cells
  }, [cur])

  function irMes(delta) { setSelDia(null); setCur(c => new Date(c.getFullYear(), c.getMonth() + delta, 1)) }
  function irHoy() { const d = new Date(); setCur(new Date(d.getFullYear(), d.getMonth(), 1)); setSelDia(hoy) }

  const resumenEstados = estados.size === 0 ? 'Ningún estado'
    : estados.size === 4 ? 'Todos los estados'
    : estados.size === 1 ? ESTADO_META[[...estados][0]].label
    : `${estados.size} estados`
  const resumenAreas = subareas.size === 0 ? 'Ningún área'
    : subareas.size === AREAS_BASE.length ? 'Todas las áreas'
    : subareas.size === 1 ? AREA_META[[...subareas][0]].label
    : `${subareas.size} áreas`

  // ── Imprimir hoja de pendientes (orden de confección) ──
  function imprimirPendientes() {
    const pend = pedidos
      .filter(p => {
        const k = estadoColor(p, hoy)
        if (k === 'grn' || k === null) return false // solo pendientes con fecha
        if (filtroTienda !== 'TODAS' && p.TIENDA_ID !== filtroTienda) return false
        if (subareas.size < AREAS_BASE.length) {
          if (subareas.size === 0) return false
          const a = areasDe(p); let ok = false; subareas.forEach(s => { if (a.has(s)) ok = true }); if (!ok) return false
        }
        return true
      })
      .sort((a, b) => {
        const fa = fechaEntregaISO(a), fb = fechaEntregaISO(b)
        return fa < fb ? -1 : fa > fb ? 1 : (a.PEDIDO_ID || '').localeCompare(b.PEDIDO_ID || '')
      })

    const totPrendas = pend.reduce((s, p) => s + prendasDe(p), 0)
    const totAtras = pend.filter(p => estadoColor(p, hoy) === 'red').length

    const grupos = {}
    pend.forEach(p => { const f = fechaEntregaISO(p); (grupos[f] = grupos[f] || []).push(p) })

    const tiendaTxt = filtroTienda === 'TODAS' ? 'Todas las tiendas' : `${TIENDA_META[filtroTienda]?.emoji || ''} ${TIENDA_META[filtroTienda]?.label || filtroTienda}`
    const areaTxt = subareas.size < AREAS_BASE.length ? ` · Áreas: ${[...subareas].map(a => AREA_META[a].label).join(', ')}` : ''
    const STC = { red: '#c0392b', amb: '#b7791f', azu: '#2563c9' }
    const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

    let filas = ''
    Object.keys(grupos).sort().forEach(f => {
      const ls = grupos[f]
      const atrasado = f < hoy
      const subP = ls.reduce((s, p) => s + prendasDe(p), 0)
      filas += `<tr class="daygrp ${atrasado ? 'atras' : ''}"><td colspan="6">
        <div class="dayhdr"><span class="lbl">${esc(fmtLargo(f))}${atrasado ? ' — ATRASADO' : (f === hoy ? ' — HOY' : '')}</span><span>${ls.length} ped · ${subP} prendas</span></div></td></tr>`
      ls.forEach(p => {
        const k = estadoColor(p, hoy)
        const areas = [...areasDe(p)].map(a => `${AREA_META[a].icon} ${AREA_META[a].label}`).join(', ') || '—'
        filas += `<tr>
          <td class="chk"><span class="box"></span></td>
          <td class="pid">${esc(p.PEDIDO_ID)}</td>
          <td>${TIENDA_META[p.TIENDA_ID]?.emoji || ''} ${esc(p.TIENDA_ID)}</td>
          <td class="qty">×${prendasDe(p)}</td>
          <td class="area">${esc(areas)}</td>
          <td class="st" style="color:${STC[k]}">${ESTADO_META[k].label.toUpperCase()}</td>
        </tr>`
      })
    })
    if (!pend.length) filas = `<tr><td colspan="6" style="padding:24px;color:#777">No hay pedidos pendientes con los filtros actuales. 🎉</td></tr>`

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden de Confección — Pendientes</title>
    <style>
      *{box-sizing:border-box} body{font-family:'Inter',system-ui,Arial,sans-serif;color:#111;margin:22px;}
      .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #FF6B00;padding-bottom:8px;}
      h2{margin:0;font-size:20px} .sub{font-size:11px;color:#555;margin-top:3px}
      .brand{font-size:13px;font-weight:800;color:#FF6B00}
      .tot{display:flex;gap:24px;margin:12px 0 14px;font-size:12px} .tot b{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1px solid #ccc;padding:5px 8px}
      td{padding:6px 8px;border-bottom:1px solid #e8e8e8;vertical-align:middle}
      td.pid{font-weight:700} td.qty{font-weight:800;text-align:center;white-space:nowrap}
      td.st{font-weight:700;font-size:10.5px} td.area{font-size:11px;color:#333}
      td.chk{width:26px} .box{width:13px;height:13px;border:1.5px solid #444;border-radius:3px;display:inline-block}
      tr.daygrp td{background:#f3f3f3;padding:0;border:none}
      .dayhdr{font-size:12.5px;font-weight:800;border-left:4px solid #FF6B00;padding:5px 9px;display:flex;justify-content:space-between}
      tr.atras .dayhdr{border-left-color:#d33;color:#a11}
      tr.daygrp{break-inside:avoid}
      .foot{margin-top:16px;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:6px}
      @page{margin:14mm 12mm}
    </style></head><body>
      <div class="head"><div><h2>Orden de Confección — Pendientes</h2>
        <div class="sub">Generado el ${esc(fmtLargo(hoy))} · ${esc(tiendaTxt)}${esc(areaTxt)} · ordenado por fecha de entrega</div></div>
        <div class="brand">🍊 MANDARINA PRO</div></div>
      <div class="tot"><div><b>${pend.length}</b> pedidos pendientes</div><div><b>${totPrendas}</b> prendas por confeccionar</div><div style="color:#c0392b"><b>${totAtras}</b> atrasados</div></div>
      <table><thead><tr><th class="chk">✓</th><th>Pedido</th><th>Tienda</th><th style="text-align:center">Prendas</th><th>Área</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody></table>
      <div class="foot">Marca ✓ a medida que confeccionas. Refleja los pedidos con entrega comprometida aún no entregados.</div>
    </body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('Habilita las ventanas emergentes para imprimir la hoja de pendientes.'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 350)
  }

  const pedidosDia = selDia ? (porDia[selDia] || []) : []

  return (
    <div className="flex flex-col h-screen md:h-auto md:min-h-screen">
      {/* Cabecera */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-white p-1">←</button>
              <div>
                <h1 className="text-xl font-display font-bold text-white">📅 Calendario de Entregas</h1>
                <p className="text-xs text-gray-500">
                  {statsMes.total} entrega(s) este mes · por fecha comprometida
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
                <button onClick={() => irMes(-1)} className="w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all text-lg">‹</button>
                <span className="min-w-[140px] text-center text-sm font-semibold text-white capitalize">{MESES[cur.getMonth()]} {cur.getFullYear()}</span>
                <button onClick={() => irMes(1)} className="w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all text-lg">›</button>
              </div>
              <button onClick={irHoy} className="text-sm px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-700 text-mandarina-400 hover:bg-gray-800 transition-all">Hoy</button>
              <button onClick={loadPedidos} disabled={loading} className="btn-secondary text-xs px-3 py-2.5 min-h-[44px] flex items-center gap-1.5">
                {loading ? <span className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🔄'}
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filtroTienda} onChange={e => setFiltroTienda(e.target.value)}
              className={`bg-gray-800 border rounded-xl px-3 py-2.5 min-h-[44px] text-sm outline-none cursor-pointer transition-all
                ${filtroTienda !== 'TODAS' ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>
              <option value="TODAS">🏬 Todas las tiendas</option>
              <option value="MANDARINA">🍊 Mandarina</option>
              <option value="INDSTORE">🏪 Indstore</option>
              <option value="YAW">🟣 YAW</option>
            </select>

            <MultiSelect icon="🎯" resumen={resumenEstados} sel={estados} onChange={setEstados}
              opciones={ESTADO_ORDEN.map(k => ({ value: k, label: ESTADO_META[k].label, dot: ESTADO_META[k].dot }))} />

            <MultiSelect icon="🧩" resumen={resumenAreas} sel={subareas} onChange={setSubareas}
              opciones={AREAS_BASE.map(a => ({ value: a, label: AREA_META[a].label, icon: AREA_META[a].icon }))} />

            <button onClick={imprimirPendientes}
              className="text-sm px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-all flex items-center gap-1.5 whitespace-nowrap">
              🖨️ <span className="hidden sm:inline">Imprimir pendientes</span><span className="sm:hidden">PDF</span>
            </button>
          </div>

          {/* Resumen del mes */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { k: 'total', n: statsMes.total, l: 'Del mes', cls: 'text-white', bar: 'bg-mandarina-500' },
              { k: 'red', n: statsMes.red, l: 'Atrasados', cls: 'text-red-400', bar: 'bg-red-500' },
              { k: 'amb', n: statsMes.amb, l: 'Vencen hoy', cls: 'text-amber-400', bar: 'bg-amber-500' },
              { k: 'grn', n: statsMes.grn, l: 'Entregados', cls: 'text-green-400', bar: 'bg-green-500' },
            ].map(s => (
              <div key={s.k} className="card p-2.5 relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
                <div className={`text-2xl font-black leading-none ${s.cls}`}>{s.n}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-1.5 font-semibold">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-mandarina-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Leyenda */}
              <div className="flex gap-4 flex-wrap mb-3 text-xs text-gray-400">
                {ESTADO_ORDEN.map(k => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm ${ESTADO_META[k].dot}`} />{ESTADO_META[k].label}
                  </span>
                ))}
              </div>

              {/* Calendario */}
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                    {DOW_CAB.map((d, i) => (
                      <div key={d} className={`text-[11px] font-bold uppercase tracking-wider text-center py-1 ${i >= 5 ? 'text-mandarina-400' : 'text-gray-600'}`}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {celdas.map((c, idx) => {
                      if (c.out) return <div key={idx} className="min-h-[118px] rounded-xl border border-gray-800/40 bg-gray-900/30" />
                      const peds = porDia[c.iso] || []
                      const esHoy = c.iso === hoy
                      const esWE = c.dow === 0 || c.dow === 6
                      return (
                        <button key={idx} onClick={() => setSelDia(c.iso)}
                          className={`min-h-[118px] rounded-xl border p-1.5 text-left flex flex-col gap-1 transition-all
                            ${esHoy ? 'border-mandarina-500/50 ring-1 ring-mandarina-500/40' : 'border-gray-800'}
                            ${esWE ? 'bg-gray-900/70' : 'bg-gray-900'} hover:border-gray-600
                            ${selDia === c.iso ? 'ring-1 ring-mandarina-500' : ''}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${esHoy ? 'bg-mandarina-500 text-white min-w-[22px] h-[22px] px-1.5 rounded-md inline-flex items-center justify-center' : 'text-gray-400'}`}>{c.d}</span>
                            {peds.length > 0 && <span className="text-[10px] text-gray-600 font-semibold">{peds.length}</span>}
                          </div>
                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            {peds.slice(0, 3).map(p => {
                              const k = estadoColor(p, hoy)
                              return (
                                <span key={p.PEDIDO_ID}
                                  className={`text-[11px] rounded px-1.5 py-0.5 truncate ${ESTADO_META[k].chip}`}
                                  style={{ borderLeft: `3px solid ${ESTADO_META[k].hex}` }}>
                                  {TIENDA_META[p.TIENDA_ID]?.emoji} <span className="font-bold tabular-nums">{(p.PEDIDO_ID || '').split('-').pop()}</span> ×{prendasDe(p)}
                                </span>
                              )
                            })}
                            {peds.length > 3 && <span className="text-[10px] text-gray-500 font-semibold pl-0.5">+{peds.length - 3} más</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </div>

      {/* Modal del día — ventana emergente con TODOS los pedidos (aunque sean 30),
          con scroll propio. Antes era un panel debajo de la grilla: para un día de
          la primera semana había que scrollear todo el mes para verlo. */}
      {selDia && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelDia(null)}>
          <div className="card w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
              <div>
                <div className="text-sm font-bold text-white capitalize">{fmtLargo(selDia)}</div>
                <div className="text-xs text-gray-500">
                  {pedidosDia.length ? `${pedidosDia.length} pedido(s) para entregar` : 'Sin entregas'}
                </div>
              </div>
              <button onClick={() => setSelDia(null)} className="text-gray-500 hover:text-white text-2xl leading-none px-1">✕</button>
            </div>
            <div className="p-2 overflow-y-auto">
              {pedidosDia.length === 0 ? (
                <div className="p-8 text-center text-gray-600 text-sm">📭 No hay pedidos con entrega este día.</div>
              ) : pedidosDia.map(p => {
                const k = estadoColor(p, hoy)
                const prendas = prendasDe(p)
                const pend = parseFloat(p.MONTO_PENDIENTE || 0)
                return (
                  <div key={p.PEDIDO_ID}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl m-1 ${ESTADO_META[k].chip}`}
                    style={{ borderLeft: `3px solid ${ESTADO_META[k].hex}` }}>
                    <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="flex-1 min-w-0 hover:brightness-125 transition-all">
                      <div className="text-sm font-bold text-white">
                        {TIENDA_META[p.TIENDA_ID]?.emoji} {p.PEDIDO_ID} <span className="text-mandarina-400 font-black">×{prendas}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {prendas} prenda{prendas !== 1 ? 's' : ''} · ${parseFloat(p.MONTO_TOTAL || 0).toFixed(2)}
                        {pend > 0.01 ? ` · debe $${pend.toFixed(0)}` : ''}
                      </div>
                    </Link>
                    <span className={`badge text-[10px] ${ESTADO_META[k].chip} ${ESTADO_META[k].text} hidden sm:inline`}>{ESTADO_META[k].label}</span>
                    {/* PDF de la orden de producción, sin salir del calendario. */}
                    <button onClick={() => verPdfConfeccion(p)} disabled={!!generandoPdf}
                      title="Orden de producción (PDF)"
                      className="flex-shrink-0 text-xs font-bold px-2.5 py-2 rounded-lg bg-gray-800 border border-gray-700 text-mandarina-400 hover:bg-gray-700 disabled:opacity-50">
                      {generandoPdf === p.PEDIDO_ID ? '⏳' : '🖨️ PDF'}
                    </button>
                    <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="text-gray-600 text-lg flex-shrink-0 hover:text-white">›</Link>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Zona oculta: se monta solo el pedido cuyo PDF se está generando. */}
      {pdfPedido && (
        <div style={{ position:'fixed', top:'-9999px', left:'-9999px', width:'794px', backgroundColor:'white', fontFamily:"'Helvetica Neue',Arial,sans-serif" }}>
          {paginarItems(pdfPedido.items).map((pag, i, todas) => (
            <div key={i} id={`cal-pdf-${pdfPedido.PEDIDO_ID}-${i}`} style={{ width:'794px' }}>
              <PdfConfeccionPagina
                pedido={pdfPedido}
                items={pag.items}
                tiendaColor={TIENDA_COLORS[pdfPedido.TIENDA_ID] || '#FF6B00'}
                paginaActual={i + 1}
                totalPaginas={todas.length}
                offsetIdx={pag.offset}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
