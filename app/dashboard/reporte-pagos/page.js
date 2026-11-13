'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

/**
 * REPORTE DE LINKS DE PAGO (solo ADMIN) — pedido de Rodrigo, 13-nov-2026.
 *
 * ¿Los links que se mandan (Payphone y dLocal Go) se están pagando? Arriba el
 * balance del rango (generado · cobrado · comisión · neto · % pagado), su
 * desglose por pasarela, tienda y vendedor, y abajo el detalle link por link.
 *
 * Al abrir (y con 🔄) se sincroniza: dLocal trae TODOS sus pagos del rango con
 * comisión y neto reales; a Payphone se le pregunta por los pendientes. La
 * comisión de Payphone es ESTIMADA (5,75 %): su API no la da.
 */

const NOMBRE_TIENDA = { MANDARINA: 'Mandarina', INDSTORE: 'IND STORE' }
const NOMBRE_PROV = { PAYPHONE: 'Payphone', DLOCAL: 'dLocal Go' }
const NOMBRE_ORIGEN = { CRM: 'CRM', INBOX_MANDI: 'Inbox Mandarina', INBOX_IND: 'Inbox IND', DLOCAL: 'dLocal (sin registro)' }

const ESTADO = {
  PAGADO:    { txt: '✅ Pagado',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  PENDIENTE: { txt: '⏳ Pendiente', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  RECHAZADO: { txt: '❌ Rechazado', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
  EXPIRADO:  { txt: '⌛ Vencido',   cls: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
}

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Fechas de calendario en Ecuador (UTC-5, sin horario de verano).
function ymdEcuador(ms = Date.now()) { return new Date(ms - 5 * 3600000).toISOString().slice(0, 10) }
function presets() {
  const hoy = ymdEcuador()
  const [y, m] = hoy.split('-').map(Number)
  const inicioMes = `${hoy.slice(0, 8)}01`
  const pm = m === 1 ? [y - 1, 12] : [y, m - 1]
  const inicioPasado = `${pm[0]}-${String(pm[1]).padStart(2, '0')}-01`
  const finPasado = ymdEcuador(Date.parse(`${inicioMes}T05:00:00Z`) - 86400000 + 5 * 3600000)
  return [
    { k: 'hoy', txt: 'Hoy', desde: hoy, hasta: hoy },
    { k: '7', txt: '7 días', desde: ymdEcuador(Date.now() - 6 * 86400000), hasta: hoy },
    { k: '30', txt: '30 días', desde: ymdEcuador(Date.now() - 29 * 86400000), hasta: hoy },
    { k: 'mes', txt: 'Este mes', desde: inicioMes, hasta: hoy },
    { k: 'pasado', txt: 'Mes pasado', desde: inicioPasado, hasta: finPasado },
  ]
}

function fmtFecha(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return '' }
}
function fmtCelular(c) {
  const d = String(c || '')
  if (!d) return 'sin celular'
  if (/^5939\d{8}$/.test(d)) { const l = '0' + d.slice(3); return `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` }
  return '+' + d
}

function Tarjeta({ titulo, valor, sub, tono = 'text-white' }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className={`text-lg font-bold ${tono}`}>{valor}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

function Desglose({ titulo, filas }) {
  if (!filas?.length) return null
  return (
    <div className="card p-3">
      <div className="text-sm font-semibold text-white mb-2">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="py-1 pr-2 font-medium">&nbsp;</th>
              <th className="py-1 px-2 font-medium text-right">Links</th>
              <th className="py-1 px-2 font-medium text-right">Pagados</th>
              <th className="py-1 px-2 font-medium text-right">Cobrado</th>
              <th className="py-1 px-2 font-medium text-right">Comisión</th>
              <th className="py-1 pl-2 font-medium text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.clave} className="border-t border-gray-800 text-gray-300">
                <td className="py-1.5 pr-2 text-white whitespace-nowrap">{f.nombre}</td>
                <td className="py-1.5 px-2 text-right">{f.links}</td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">{f.pagados} <span className="text-gray-500">({f.tasa_pago}%)</span></td>
                <td className="py-1.5 px-2 text-right">{money(f.cobrado)}</td>
                <td className="py-1.5 px-2 text-right text-red-300">{money(f.comision)}{f.comision_estimada ? '*' : ''}</td>
                <td className="py-1.5 pl-2 text-right text-emerald-300">{money(f.neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReportePagosPage() {
  const router = useRouter()
  const ps = useMemo(presets, [])
  const [desde, setDesde] = useState(ps[3].desde)
  const [hasta, setHasta] = useState(ps[3].hasta)
  const [por, setPor] = useState('creado')
  const [proveedor, setProveedor] = useState('')
  const [tienda, setTienda] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [estado, setEstado] = useState('')

  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState('')
  const [avisosSync, setAvisosSync] = useState([])
  const [ultimaSync, setUltimaSync] = useState(null)

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('mp_user') || 'null')
      if (!u) router.push('/')
      else if (u.rol !== 'ADMIN') router.push('/dashboard')
    } catch { router.push('/') }
  }, [router])

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    try {
      const q = new URLSearchParams({ desde, hasta, por, proveedor, tienda, vendedor, estado })
      const r = await fetch(`/api/reporte-pagos?${q}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo cargar el reporte')
      setDatos(d)
    } catch (e) { setError(e.message) } finally { setCargando(false) }
  }, [desde, hasta, por, proveedor, tienda, vendedor, estado])

  const sincronizar = useCallback(async () => {
    setSincronizando(true); setAvisosSync([])
    try {
      const r = await fetch('/api/reporte-pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde, hasta }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo sincronizar')
      setAvisosSync(d.avisos || [])
      setUltimaSync({ ...d, en: new Date().toISOString() })
    } catch (e) { setAvisosSync([e.message]) } finally { setSincronizando(false) }
    await cargar()
  }, [desde, hasta, cargar])

  // Al abrir: sincroniza una vez. Después, cambiar filtros solo relee la base.
  const [primera, setPrimera] = useState(true)
  useEffect(() => {
    if (primera) { setPrimera(false); sincronizar(); return }
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, por, proveedor, tienda, vendedor, estado])

  const t = datos?.resumen?.total
  const avisos = [...new Set([...(datos?.avisos || []), ...avisosSync])]
  const retirado = (datos?.retiros || []).filter(r => ['COMPLETED', 'DELIVERED'].includes(r.estado))
    .reduce((s, r) => s + (Number(r.transferido) || 0), 0)
  const presetActivo = ps.find(p => p.desde === desde && p.hasta === hasta)?.k

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-white">💰 Reporte de pagos</h1>
        <button onClick={sincronizar} disabled={sincronizando} className="btn-secondary text-xs px-3 py-2 shrink-0 disabled:opacity-50">
          {sincronizando ? '⏳ Consultando pasarelas…' : '🔄 Actualizar'}
        </button>
      </div>
      <p className="text-gray-500 text-sm mb-4">Links de Payphone y dLocal Go: cuáles se pagaron, y cuánto quedó después de comisiones.</p>

      {/* Filtros */}
      <div className="card p-3 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ps.map(p => (
            <button key={p.k} onClick={() => { setDesde(p.desde); setHasta(p.hasta) }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${presetActivo === p.k
                ? 'bg-mandarina-500/20 border-mandarina-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
              {p.txt}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><label className="label">Desde</label><input type="date" className="input" value={desde} max={hasta} onChange={e => e.target.value && setDesde(e.target.value)} /></div>
          <div><label className="label">Hasta</label><input type="date" className="input" value={hasta} min={desde} onChange={e => e.target.value && setHasta(e.target.value)} /></div>
          <div>
            <label className="label">Fecha de</label>
            <select className="input" value={por} onChange={e => setPor(e.target.value)}>
              <option value="creado">Envío del link</option>
              <option value="pagado">Pago</option>
            </select>
          </div>
          <div>
            <label className="label">Pasarela</label>
            <select className="input" value={proveedor} onChange={e => setProveedor(e.target.value)}>
              <option value="">Todas</option>
              <option value="PAYPHONE">Payphone</option>
              <option value="DLOCAL">dLocal Go</option>
            </select>
          </div>
          <div>
            <label className="label">Tienda</label>
            <select className="input" value={tienda} onChange={e => setTienda(e.target.value)}>
              <option value="">Todas</option>
              <option value="MANDARINA">Mandarina</option>
              <option value="INDSTORE">IND STORE</option>
              <option value="SIN_TIENDA">Sin tienda</option>
            </select>
          </div>
          <div>
            <label className="label">Vendedor</label>
            <select className="input" value={vendedor} onChange={e => setVendedor(e.target.value)}>
              <option value="">Todos</option>
              {(datos?.vendedores || []).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              <option value="SIN_VENDEDOR">Sin vendedor</option>
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="PAGADO">Pagados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EXPIRADO">Vencidos</option>
              <option value="RECHAZADO">Rechazados</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 mb-3">⚠️ {error}</div>}
      {avisos.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
          {avisos.map(a => <div key={a}>⚠️ {a}</div>)}
        </div>
      )}

      {!datos ? (
        <div className="text-sm text-gray-500">{cargando || sincronizando ? 'Cargando…' : ''}</div>
      ) : (
        <>
          {/* Balance */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            <Tarjeta titulo="Links enviados" valor={t.links} sub={`${money(t.generado)} en total`} />
            <Tarjeta titulo="Pagados" valor={`${t.pagados} · ${t.tasa_pago}%`} sub={`${t.pendientes} pendientes · ${t.expirados} vencidos · ${t.rechazados} rechazados`} tono="text-emerald-300" />
            <Tarjeta titulo="Cobrado" valor={money(t.cobrado)} sub={`${money(t.monto_pendiente)} todavía pendiente`} />
            <Tarjeta titulo="Comisión" valor={money(t.comision)} sub={t.comision_estimada ? '* Payphone estimado al 5,75 %' : 'real de la pasarela'} tono="text-red-300" />
            <Tarjeta titulo="Neto" valor={money(t.neto)} sub="lo que llega a la cuenta" tono="text-emerald-300" />
            {datos.retiros && (
              <Tarjeta titulo="Retirado de dLocal" valor={money(retirado)} sub={`${datos.retiros.length} retiros en el rango`} />
            )}
          </div>
          {ultimaSync && (
            <p className="text-[11px] text-gray-600 mb-4">
              Consultado {fmtFecha(ultimaSync.en)}
              {ultimaSync.dlocal ? ` · dLocal: ${ultimaSync.dlocal.leidos} pagos (${ultimaSync.dlocal.nuevos} nuevos, ${ultimaSync.dlocal.actualizados} cambiaron)` : ''}
              {` · Payphone: ${ultimaSync.payphone?.revisados ?? 0} revisados`}
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-3 mb-4">
            <Desglose titulo="Por pasarela" filas={datos.resumen.proveedor} />
            <Desglose titulo="Por tienda" filas={datos.resumen.tienda} />
          </div>
          <div className="mb-4"><Desglose titulo="Por vendedor" filas={datos.resumen.vendedor} /></div>

          {datos.tiendaWeb && datos.tiendaWeb.pagos > 0 && !proveedor.startsWith('D') && (
            <div className="card p-3 mb-4 text-xs text-gray-400">
              <span className="text-white font-semibold">Aparte: pagos con tarjeta dentro de la tienda web</span> (Payphone, no son links):
              {' '}{datos.tiendaWeb.pagos} pagos · {money(datos.tiendaWeb.cobrado)} cobrado · {money(datos.tiendaWeb.comision)}* comisión · {money(datos.tiendaWeb.neto)} neto
            </div>
          )}

          {datos.retiros?.length > 0 && (
            <div className="card p-3 mb-4">
              <div className="text-sm font-semibold text-white mb-2">Retiros de dLocal al banco</div>
              <div className="space-y-1 text-xs">
                {datos.retiros.map(r => (
                  <div key={r.id} className="flex justify-between gap-2 text-gray-300 border-t border-gray-800 pt-1">
                    <span>{r.fecha ? String(r.fecha).slice(0, 10) : ''} · {r.banco || 'banco'} · <span className="text-gray-500">{r.estado}</span></span>
                    <span>{money(r.transferido)} <span className="text-gray-500">(comisión {money(r.comision)})</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-semibold">Detalle · {datos.filas.length} links</h2>
            {cargando && <span className="text-xs text-gray-500">⏳</span>}
          </div>
          {datos.filas.length === 0 ? (
            <div className="text-sm text-gray-500">No hay links en este rango con estos filtros.</div>
          ) : (
            <div className="space-y-2">
              {datos.filas.map(l => {
                const est = ESTADO[l.estado] || ESTADO.PENDIENTE
                return (
                  <div key={l.id} className="card p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-white font-semibold">
                        {money(l.valor)} · {fmtCelular(l.celular)}
                        <span className="ml-2 text-xs font-normal text-gray-500">{NOMBRE_PROV[l.proveedor] || l.proveedor}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {fmtFecha(l.creado_en)} · {NOMBRE_TIENDA[l.tienda] || 'Sin tienda'} · {l.vendedor || (l.origen === 'DLOCAL' ? 'histórico' : 'sin vendedor')}
                        {' · '}{NOMBRE_ORIGEN[l.origen] || l.origen}
                      </div>
                      {l.estado === 'PAGADO' && (
                        <div className="text-xs text-gray-400">
                          Pagó {fmtFecha(l.pagado_en)}{l.pagador ? ` · ${l.pagador}` : ''}{l.tarjeta ? ` · ${l.tarjeta}` : ''}
                          {l.neto != null && <> · neto <span className="text-emerald-300">{money(l.neto)}</span>{l.comision_estimada ? '*' : ''}</>}
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg border ${est.cls}`}>{est.txt}</span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            * Payphone no informa su comisión por API: se calcula al 5,75 % (5 % + IVA, medido con el primer cobro real).
            Un link de Payphone sin pagar a las 48 h cuenta como vencido. dLocal da la comisión y el neto reales.
          </p>
        </>
      )}
    </div>
  )
}
