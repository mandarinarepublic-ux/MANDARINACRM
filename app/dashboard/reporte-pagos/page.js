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
const NOMBRE_ORIGEN = { CRM: 'CRM', INBOX_MANDI: 'Inbox Mandarina', INBOX_IND: 'Inbox IND', DLOCAL: 'dLocal (sin registro)', PAYPHONE: 'Payphone (sin registro)' }

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
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className={`text-xl font-bold tabular-nums ${tono}`}>{valor}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  )
}

function Desglose({ filas }) {
  if (!filas?.length) return <div className="text-xs text-gray-500 py-2">Sin links en este período.</div>
  return (
    <div>
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
  const [transaccion, setTransaccion] = useState('')
  const [trayendo, setTrayendo] = useState(false)
  const [msgTraer, setMsgTraer] = useState('')
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [vista, setVista] = useState('proveedor')
  // Depósitos de Payphone anotados a mano (19-nov-2026)
  const [formDeposito, setFormDeposito] = useState(false)
  const [depFecha, setDepFecha] = useState(() => ymdEcuador())
  const [depMonto, setDepMonto] = useState('')
  const [depNota, setDepNota] = useState('')
  const [guardandoDep, setGuardandoDep] = useState(false)
  const [msgDeposito, setMsgDeposito] = useState('')
  const [borrandoDep, setBorrandoDep] = useState(null)

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

  // Un pago de Payphone que no está (link de antes del 13-nov): se trae con el #
  // de transacción que se ve en el panel de Payphone.
  const traerPayphone = useCallback(async (e) => {
    e?.preventDefault()
    if (trayendo || !transaccion.trim()) return
    setTrayendo(true); setMsgTraer('')
    try {
      const r = await fetch('/api/reporte-pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'traer_payphone', transaccion }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo traer')
      const f = d.fila
      setMsgTraer(`✅ #${f.transaction_id}: ${money(f.valor)} · ${ESTADO[f.estado]?.txt || f.estado}${d.nuevos ? ' · agregado' : d.actualizados ? ' · actualizado' : ' · ya estaba'}`)
      setTransaccion('')
      await cargar()
    } catch (e) { setMsgTraer(`⚠️ ${e.message}`) } finally { setTrayendo(false) }
  }, [trayendo, transaccion, cargar])

  const guardarDeposito = useCallback(async (e) => {
    e?.preventDefault()
    if (guardandoDep) return
    setGuardandoDep(true); setMsgDeposito('')
    try {
      const r = await fetch('/api/reporte-pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'deposito_crear', fecha: depFecha, monto: depMonto, nota: depNota }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo guardar el depósito')
      setMsgDeposito(`✅ Depósito de ${money(d.deposito.monto)} guardado`)
      setFormDeposito(false); setDepMonto(''); setDepNota('')
      await cargar()
    } catch (e) { setMsgDeposito(`⚠️ ${e.message}`) } finally { setGuardandoDep(false) }
  }, [guardandoDep, depFecha, depMonto, depNota, cargar])

  const borrarDeposito = useCallback(async (id) => {
    setMsgDeposito('')
    try {
      const r = await fetch('/api/reporte-pagos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'deposito_borrar', id }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo borrar el depósito')
      setMsgDeposito('Depósito borrado')
      await cargar()
    } catch (e) { setMsgDeposito(`⚠️ ${e.message}`) } finally { setBorrandoDep(null) }
  }, [cargar])

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

  // Filtros puestos (distintos del valor por defecto): se ven SIEMPRE como chips,
  // aunque el panel esté cerrado. Un reporte filtrado se ve igual que uno completo.
  const nombreVendedor = (id) => id === 'SIN_VENDEDOR' ? 'Sin vendedor' : ((datos?.vendedores || []).find(v => String(v.id) === String(id))?.nombre || id)
  const chips = [
    por !== 'creado' && { clave: 'por', txt: 'Por fecha de pago', quitar: () => setPor('creado') },
    proveedor && { clave: 'proveedor', txt: NOMBRE_PROV[proveedor] || proveedor, quitar: () => setProveedor('') },
    tienda && { clave: 'tienda', txt: tienda === 'SIN_TIENDA' ? 'Sin tienda' : (NOMBRE_TIENDA[tienda] || tienda), quitar: () => setTienda('') },
    vendedor && { clave: 'vendedor', txt: nombreVendedor(vendedor), quitar: () => setVendedor('') },
    estado && { clave: 'estado', txt: (ESTADO[estado]?.txt || estado).replace(/^\S+\s/, ''), quitar: () => setEstado('') },
  ].filter(Boolean)
  const limpiarFiltros = () => { setPor('creado'); setProveedor(''); setTienda(''); setVendedor(''); setEstado('') }
  const fDia = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const rangoTxt = desde === hasta ? fDia(desde) : `${fDia(desde)} – ${fDia(hasta)}`
  const VISTAS = [{ k: 'proveedor', txt: 'Pasarela' }, { k: 'tienda', txt: 'Tienda' }, { k: 'vendedor', txt: 'Vendedor' }]

  return (
    <div className="max-w-5xl mx-auto pb-10">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">💰 Reporte de pagos</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {ultimaSync ? `Consultado a las pasarelas ${fmtFecha(ultimaSync.en)}. ` : sincronizando ? 'Consultando a las pasarelas… ' : ''}
            Se actualiza solo a las 8:20 y 20:20.
          </p>
        </div>
        <button onClick={sincronizar} disabled={sincronizando} className="btn-secondary text-xs px-3 py-2 shrink-0 disabled:opacity-50">
          {sincronizando ? '⏳ Consultando…' : '🔄 Actualizar'}
        </button>
      </div>

      {error && <div className="mt-3 text-sm text-red-400">⚠️ {error}</div>}
      {avisos.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
          {avisos.map(a => <div key={a}>⚠️ {a}</div>)}
        </div>
      )}

      {/* ── 1. Dinero en las pasarelas: TODA la historia, los filtros no lo tocan ── */}
      {datos?.tablero && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-gray-200">Dinero en las pasarelas</h2>
          <p className="text-xs text-gray-500 mb-2">Desde el primer cobro. Los filtros de abajo no cambian estas cifras.</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-sky-200">dLocal Go</span>
                <span className="text-xs text-gray-500">{datos.tablero.dlocal.pagos} cobros</span>
              </div>
              {datos.tablero.dlocal_conectado ? (
                <>
                  <div className="mt-2 text-3xl font-bold text-white tabular-nums">{money(datos.tablero.dlocal.disponible)}</div>
                  <div className="text-xs text-gray-400">disponible para retirar</div>
                  <div className="mt-3 pt-3 border-t border-sky-500/20 grid grid-cols-2 gap-2 text-xs">
                    <div><div className="text-gray-500">Por liberar (7 días)</div><div className="text-gray-200 tabular-nums">{money(datos.tablero.dlocal.por_liberar)}</div></div>
                    <div><div className="text-gray-500">Ya retirado al banco</div><div className="text-gray-200 tabular-nums">{money(datos.tablero.dlocal.retirado)}</div></div>
                  </div>
                  {datos.tablero.dlocal.retiros_en_curso > 0 && (
                    <div className="mt-2 text-xs text-sky-300">{money(datos.tablero.dlocal.retiros_en_curso)} en camino al banco</div>
                  )}
                </>
              ) : (
                <div className="mt-2 text-sm text-amber-300">Sin conectar: faltan las llaves de dLocal en el CRM.</div>
              )}
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-emerald-200">Payphone</span>
                <span className="text-xs text-gray-500">{datos.tablero.payphone.pagos} cobros</span>
              </div>
              <div className="mt-2 text-3xl font-bold text-white tabular-nums">{money(datos.tablero.payphone.saldo ?? datos.tablero.payphone.neto)}</div>
              <div className="text-xs text-gray-400">
                {(datos.tablero.payphone.depositos?.length || 0) > 0 ? 'queda en Payphone, por depositar' : 'neto cobrado; anota los depósitos para ver lo que queda'}
              </div>
              <div className="mt-3 pt-3 border-t border-emerald-500/20 grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-gray-500">Neto cobrado</div><div className="text-gray-200 tabular-nums">{money(datos.tablero.payphone.neto)}</div></div>
                <div><div className="text-gray-500">Depositado</div><div className="text-gray-200 tabular-nums">{money(datos.tablero.payphone.depositado || 0)}</div></div>
                <div><div className="text-gray-500">Hoy</div><div className="text-gray-200 tabular-nums">{money(datos.tablero.payphone.hoy)}</div></div>
              </div>

              {!formDeposito ? (
                <button onClick={() => { setFormDeposito(true); setMsgDeposito('') }}
                  className="mt-3 text-xs font-semibold text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 rounded-lg px-3 py-1.5">
                  + Anotar depósito
                </button>
              ) : (
                <form onSubmit={guardarDeposito} className="mt-3 rounded-xl border border-emerald-500/30 bg-gray-950/40 p-3 space-y-2">
                  <div className="text-xs text-gray-300">¿Cuánto depositó Payphone a tu banco?</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label">Fecha</label><input type="date" className="input" value={depFecha} max={ymdEcuador()} onChange={e => setDepFecha(e.target.value)} /></div>
                    <div><label className="label">Monto</label><input className="input" inputMode="decimal" placeholder="338,12" value={depMonto} onChange={e => setDepMonto(e.target.value)} /></div>
                  </div>
                  <div><label className="label">Nota (opcional)</label><input className="input" placeholder="Banco, número de comprobante…" value={depNota} onChange={e => setDepNota(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={guardandoDep} className="btn-primary text-xs px-3 py-2 disabled:opacity-50">{guardandoDep ? '⏳ Guardando…' : 'Guardar depósito'}</button>
                    <button type="button" onClick={() => setFormDeposito(false)} className="btn-secondary text-xs px-3 py-2">Cancelar</button>
                  </div>
                </form>
              )}
              {msgDeposito && <div className="mt-2 text-xs text-gray-300">{msgDeposito}</div>}

              {(datos.tablero.payphone.depositos?.length || 0) > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-400 select-none">Depósitos anotados ({datos.tablero.payphone.depositos.length})</summary>
                  <div className="mt-2 space-y-1 text-xs">
                    {datos.tablero.payphone.depositos.map(d => (
                      <div key={d.id} className="flex items-center justify-between gap-2 border-t border-emerald-500/10 pt-1 text-gray-300">
                        <span className="min-w-0 truncate">{fDia(d.fecha)} {d.nota ? <span className="text-gray-500">· {d.nota}</span> : null}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums">{money(d.monto)}</span>
                          {borrandoDep === d.id ? (
                            <>
                              <button onClick={() => borrarDeposito(d.id)} className="text-red-300 hover:text-red-200 font-semibold">Sí, borrar</button>
                              <button onClick={() => setBorrandoDep(null)} className="text-gray-500 hover:text-white">No</button>
                            </>
                          ) : (
                            <button onClick={() => setBorrandoDep(d.id)} title="Borrar este depósito" aria-label="Borrar este depósito" className="text-gray-500 hover:text-red-300">✕</button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div className="mt-2 text-[11px] text-gray-500">Payphone no informa sus depósitos: se anotan a mano. La comisión es estimada (5,75 %).</div>
            </div>
          </div>
        </section>
      )}

      {/* ── 2. Período y filtros: UNA fila; el resto se despliega ── */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Links del período</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-gray-700 overflow-hidden" role="group" aria-label="Período">
            {ps.map(p => (
              <button key={p.k} onClick={() => { setDesde(p.desde); setHasta(p.hasta) }} aria-pressed={presetActivo === p.k}
                className={`px-3 py-2 text-xs font-semibold border-r border-gray-700 last:border-r-0 ${presetActivo === p.k
                  ? 'bg-mandarina-500/20 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                {p.txt}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-300 tabular-nums">{rangoTxt}</span>
          <button onClick={() => setPanelAbierto(a => !a)} aria-expanded={panelAbierto}
            className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold ${chips.length
              ? 'border-mandarina-500 text-mandarina-300 bg-mandarina-500/10' : 'border-gray-700 text-gray-300 hover:text-white'}`}>
            ⚙ Filtros
            {chips.length > 0 && <span className="bg-mandarina-500 text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[11px]">{chips.length}</span>}
            <span className={`opacity-60 transition-transform ${panelAbierto ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {chips.map(c => (
              <button key={c.clave} onClick={c.quitar} title={`Quitar ${c.txt}`}
                className="flex items-center gap-1 text-xs bg-mandarina-500/10 border border-mandarina-500/40 text-mandarina-300 rounded-lg pl-2 pr-1.5 py-1 hover:bg-mandarina-500/20">
                {c.txt} <span className="opacity-70">×</span>
              </button>
            ))}
            <button onClick={limpiarFiltros} className="text-xs text-gray-500 hover:text-white px-1">Quitar todos</button>
          </div>
        )}

        {panelAbierto && (
          <div className="mt-2 rounded-xl border border-gray-800 bg-gray-900/60 p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><label className="label">Desde</label><input type="date" className="input" value={desde} max={hasta} onChange={e => e.target.value && setDesde(e.target.value)} /></div>
            <div><label className="label">Hasta</label><input type="date" className="input" value={hasta} min={desde} onChange={e => e.target.value && setHasta(e.target.value)} /></div>
            <div>
              <label className="label">Contar por fecha de</label>
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
        )}
      </section>

      {!datos ? (
        <div className="mt-4 text-sm text-gray-500">{cargando || sincronizando ? 'Cargando…' : ''}</div>
      ) : (
        <>
          {/* ── 3. Números del período ── */}
          <div className={`mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 ${cargando ? 'opacity-60' : ''}`}>
            <Tarjeta titulo="Links enviados" valor={t.links} sub={`${t.pagados} pagados (${t.tasa_pago} %)`} />
            <Tarjeta titulo="Cobrado" valor={money(t.cobrado)}
              sub={t.monto_pendiente > 0 ? `${money(t.monto_pendiente)} sin pagar aún` : `${t.pendientes} pendientes`} />
            <Tarjeta titulo="Comisión" valor={money(t.comision)} tono="text-red-300"
              sub={t.comision_estimada ? 'Payphone estimada' : 'real de la pasarela'} />
            <Tarjeta titulo="Neto" valor={money(t.neto)} tono="text-emerald-300" sub="lo que llega a la cuenta" />
          </div>
          {(t.expirados > 0 || t.rechazados > 0) && (
            <p className="mt-1.5 text-xs text-gray-500">En el período: {t.expirados} vencidos y {t.rechazados} rechazados.</p>
          )}

          {/* Desglose: una sola tabla, con pestañas */}
          <div className="mt-5 card p-3">
            <div className="flex items-center gap-1 mb-2" role="tablist">
              <span className="text-xs text-gray-500 mr-1">Ver por</span>
              {VISTAS.map(v => (
                <button key={v.k} role="tab" aria-selected={vista === v.k} onClick={() => setVista(v.k)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${vista === v.k ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {v.txt}
                </button>
              ))}
            </div>
            <Desglose filas={datos.resumen[vista]} />
          </div>

          {datos.tiendaWeb && datos.tiendaWeb.pagos > 0 && !proveedor.startsWith('D') && (
            <p className="mt-2 text-xs text-gray-400">
              Además, {datos.tiendaWeb.pagos} pagos con tarjeta dentro de la tienda web (Payphone, no son links): {money(datos.tiendaWeb.cobrado)} cobrado, {money(datos.tiendaWeb.neto)} neto.
            </p>
          )}

          {/* Detalle */}
          <div className="mt-6 flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-200">Detalle <span className="text-gray-500 font-normal">· {datos.filas.length} links</span></h2>
            {cargando && <span className="text-xs text-gray-500">⏳</span>}
          </div>
          {datos.filas.length === 0 ? (
            <div className="card p-4 text-sm text-gray-400">No hay links en este período con estos filtros. Prueba otro rango o quita filtros.</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left border-b border-gray-800">
                    <th className="py-2 px-3 font-medium">Enviado</th>
                    <th className="py-2 px-3 font-medium">Cliente</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">Tienda y vendedor</th>
                    <th className="py-2 px-3 font-medium hidden sm:table-cell">Pasarela</th>
                    <th className="py-2 px-3 font-medium text-right">Valor</th>
                    <th className="py-2 px-3 font-medium text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.filas.map(l => {
                    const est = ESTADO[l.estado] || ESTADO.PENDIENTE
                    return (
                      <tr key={l.id} className="border-t border-gray-800/70 text-gray-300 align-top">
                        <td className="py-2 px-3 whitespace-nowrap text-gray-400">{fmtFecha(l.creado_en)}</td>
                        <td className="py-2 px-3">
                          <div className="text-white whitespace-nowrap">{fmtCelular(l.celular)}</div>
                          {l.estado === 'PAGADO' && (
                            <div className="text-gray-500">Pagó {fmtFecha(l.pagado_en)}{l.tarjeta ? `, ${l.tarjeta}` : ''}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell">
                          <div>{NOMBRE_TIENDA[l.tienda] || 'Sin tienda'}</div>
                          <div className="text-gray-500">{l.vendedor || (['DLOCAL', 'PAYPHONE'].includes(l.origen) ? 'histórico' : 'sin vendedor')}, {NOMBRE_ORIGEN[l.origen] || l.origen}</div>
                        </td>
                        <td className="py-2 px-3 hidden sm:table-cell whitespace-nowrap">{NOMBRE_PROV[l.proveedor] || l.proveedor}</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap tabular-nums">
                          <div className="text-white font-semibold">{money(l.valor)}</div>
                          {l.estado === 'PAGADO' && l.neto != null && (
                            <div className="text-emerald-300">neto {money(l.neto)}{l.comision_estimada ? '*' : ''}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span className={`inline-block whitespace-nowrap font-semibold px-2 py-0.5 rounded-lg border ${est.cls}`}>{est.txt}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Herramientas: plegadas, se usan poco */}
          <div className="mt-6 space-y-2">
            {datos.retiros?.length > 0 && (
              <details className="card p-3">
                <summary className="cursor-pointer text-sm text-gray-300 select-none">
                  Retiros de dLocal al banco en el período <span className="text-gray-500">({datos.retiros.length}, {money(retirado)})</span>
                </summary>
                <div className="mt-2 space-y-1 text-xs">
                  {datos.retiros.map(r => (
                    <div key={r.id} className="flex justify-between gap-2 text-gray-300 border-t border-gray-800 pt-1">
                      <span>{r.fecha ? String(r.fecha).slice(0, 10) : ''}, {r.banco || 'banco'} <span className="text-gray-500">({r.estado})</span></span>
                      <span className="tabular-nums">{money(r.transferido)} <span className="text-gray-500">(comisión {money(r.comision)})</span></span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <details className="card p-3" open={!!msgTraer}>
              <summary className="cursor-pointer text-sm text-gray-300 select-none">¿Falta un pago de Payphone?</summary>
              <form onSubmit={traerPayphone} className="mt-2">
                <div className="text-xs text-gray-500 mb-2">
                  Los aprobados de los últimos 3 días entran solos. Para uno más viejo, copia su número de transacción del panel de Payphone.
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1" inputMode="numeric" placeholder="Número de transacción, ej. 93507187"
                    value={transaccion} onChange={e => setTransaccion(e.target.value)} />
                  <button type="submit" disabled={trayendo || !transaccion.trim()} className="btn-primary px-4 disabled:opacity-50">
                    {trayendo ? '⏳' : 'Traer pago'}
                  </button>
                </div>
                {msgTraer && <div className="text-xs mt-2 text-gray-300">{msgTraer}</div>}
              </form>
            </details>
          </div>

          <p className="text-xs text-gray-600 mt-4">
            * Payphone no informa su comisión por API: se calcula al 5,75 % (5 % + IVA, medido con el primer cobro real).
            Un link de Payphone sin pagar a las 48 h cuenta como vencido. dLocal da la comisión y el neto reales.
          </p>
        </>
      )}
    </div>
  )
}
