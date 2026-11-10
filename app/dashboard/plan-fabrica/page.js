'use client'
// PLAN DE FÁBRICA (9-nov-2026): una sola ventana para el jefe de fábrica.
// CORTE · DISEÑO (por técnica) · CONFECCIÓN, y a la derecha QUÉ SE HACE HOY,
// que se arma arrastrando las cajitas (o con el botón "→ Hoy" en el celular).
//
// ☠️ SOLO GUÍA: mover una cajita NO cambia el pedido ni su estado. Se guarda la
// lista del día en crm.plan_fabrica y nada más. La regla vive en lib/planFabrica.js.
//
// ⚠️ ORDEN DE LOS HOOKS: los efectos van DESPUÉS de las funciones que nombran
// (tests/hooks-orden.test.js).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { armarTablero, moverEnPlan, COLUMNAS, META_COLUMNA, TECNICAS, META_TECNICA } from '@/lib/planFabrica'
import { diasHastaEntrega, hoyEcuador, isoMasDias, parseFechaCalendario } from '@/lib/parseFecha'

const TIENDA_EMOJI = { MANDARINA: '🍊', INDSTORE: '🏪', YAW: '🟣' }

const COLOR_SEMAFORO = {
  negro:    'bg-gray-950 text-red-300 border border-red-500/60',
  rojo:     'bg-red-600 text-white',
  naranja:  'bg-orange-500 text-white',
  amarillo: 'bg-yellow-400 text-gray-900',
  verde:    'bg-green-600 text-white',
  gris:     'bg-gray-700 text-gray-200',
}
const BORDE_SEMAFORO = {
  negro: 'border-l-red-500', rojo: 'border-l-red-500', naranja: 'border-l-orange-500',
  amarillo: 'border-l-yellow-400', verde: 'border-l-green-500', gris: 'border-l-gray-600',
}

function fechaLarga(iso) {
  const d = parseFechaCalendario(iso)
  return d ? d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }) : iso
}

function Cajita({ t, enHoy, posicion, onHoy, onQuitar, onSubir, onBajar, onDragStartId, onDropAntes, puedeEditar }) {
  if (t.salio) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 text-xs text-gray-500 flex items-center justify-between gap-2">
        <span><span className="line-through font-mono">{t.id}</span> · ✅ ya salió</span>
        {puedeEditar && <button onClick={onQuitar} className="text-gray-500 hover:text-red-400 px-2">✕</button>}
      </div>
    )
  }
  const p = t.pedido
  return (
    <div
      draggable={puedeEditar}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); onDragStartId(t.id) }}
      onDragOver={enHoy ? (e) => e.preventDefault() : undefined}
      onDrop={enHoy ? (e) => { e.preventDefault(); e.stopPropagation(); onDropAntes(e.dataTransfer.getData('text/plain'), t.id) } : undefined}
      className={`rounded-xl border border-gray-800 border-l-4 ${BORDE_SEMAFORO[t.semaforo.color]} bg-gray-900 p-3 space-y-1.5 ${puedeEditar ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {enHoy && <span className="text-mandarina-400 font-bold text-sm">{posicion}.</span>}
            <Link href={`/dashboard/pedido/${p.PEDIDO_ID}`} className="font-mono text-sm text-white hover:text-mandarina-400 hover:underline">
              {TIENDA_EMOJI[p.TIENDA_ID] || ''} {p.PEDIDO_ID}
            </Link>
          </div>
          <div className="text-xs text-gray-400 truncate">{p.CLIENTE_NOMBRE || '—'}</div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap ${COLOR_SEMAFORO[t.semaforo.color]}`}>
          {t.semaforo.texto}
        </span>
      </div>
      <div className="text-[11px] text-gray-500">
        {t.resumen.total} prenda{t.resumen.total === 1 ? '' : 's'}
        {enHoy && <> · {META_COLUMNA[t.columna].emoji} {META_COLUMNA[t.columna].titulo}</>}
        {(enHoy || t.columna !== 'DISENO') && t.tecnica && <> · {META_TECNICA[t.tecnica]}</>}
      </div>
      {t.resumen.frases.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {t.resumen.frases.map((f) => (
            <span key={f} className="text-[11px] bg-gray-800 text-gray-300 rounded-md px-1.5 py-0.5">{f}</span>
          ))}
        </div>
      )}
      {puedeEditar && (
        <div className="flex justify-end gap-1 pt-0.5">
          {enHoy ? (
            <>
              <button onClick={onSubir} title="Subir" className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-2.5 py-1.5">↑</button>
              <button onClick={onBajar} title="Bajar" className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-2.5 py-1.5">↓</button>
              <button onClick={onQuitar} title="Sacar de hoy" className="text-xs bg-gray-800 hover:bg-red-500/20 text-gray-300 hover:text-red-300 rounded-lg px-2.5 py-1.5">✕ Sacar</button>
            </>
          ) : (
            <button onClick={onHoy} className="text-xs font-semibold text-mandarina-400 border border-mandarina-500/40 hover:bg-mandarina-500/10 rounded-lg px-2.5 py-1.5">→ Hoy</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlanFabricaPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [fecha, setFecha] = useState(() => hoyEcuador())
  const [datos, setDatos] = useState(null)
  const [plan, setPlan] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState('')
  const [arrastrando, setArrastrando] = useState(null)
  const [abiertas, setAbiertas] = useState({})

  const hoy = hoyEcuador()
  const rol = String(user?.rol || '').toUpperCase()
  const puedeEditar = !!user && rol !== 'VENDEDOR' && rol !== 'VENDEDOR_YAW'

  const cargar = useCallback(async (f) => {
    setCargando(true); setError('')
    try {
      const res = await fetch(`/api/plan-fabrica?fecha=${f}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setDatos(d)
      setPlan(d.plan || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  const guardar = useCallback(async (nuevo) => {
    const anterior = plan
    setPlan(nuevo); setGuardado('Guardando…')
    try {
      const res = await fetch('/api/plan-fabrica', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, pedidos: nuevo }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setGuardado('✓ Guardado')
      setTimeout(() => setGuardado(''), 1500)
    } catch (e) {
      setPlan(anterior)
      setGuardado(`⚠️ No se guardó: ${e.message}`)
    }
  }, [plan, fecha])

  useEffect(() => {
    const stored = localStorage.getItem('mp_user')
    if (!stored) { router.push('/'); return }
    try { setUser(JSON.parse(stored)) } catch { router.push('/') }
  }, [])

  useEffect(() => { cargar(fecha) }, [fecha, cargar])

  const tablero = useMemo(
    () => armarTablero(datos?.pedidos || [], plan, (f) => diasHastaEntrega(f)),
    [datos, plan],
  )

  const vivos = useMemo(() => new Set((datos?.pedidos || []).map((p) => p.PEDIDO_ID)), [datos])
  const pendientesAnterior = (datos?.anterior?.ids || []).filter((id) => vivos.has(id) && !plan.includes(id))

  function alHoy(id, antesDe = null) {
    if (!id || !puedeEditar) return
    guardar(moverEnPlan(plan, id, antesDe))
  }
  function quitar(id) { guardar(plan.filter((x) => x !== id)) }
  function mover(id, delta) {
    const i = plan.indexOf(id), j = i + delta
    if (i < 0 || j < 0 || j >= plan.length) return
    const n = [...plan]; [n[i], n[j]] = [n[j], n[i]]
    guardar(n)
  }
  const soltarEnColumna = (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (plan.includes(id)) quitar(id) }

  const tituloHoy = fecha === hoy ? 'QUÉ SE HACE HOY' : fecha === isoMasDias(hoy, 1) ? 'QUÉ SE HACE MAÑANA' : `QUÉ SE HACE EL ${fechaLarga(fecha).toUpperCase()}`
  const tarjetasHoy = tablero.hoy
  const unidadesHoy = tarjetasHoy.reduce((s, t) => s + (t.resumen?.total || 0), 0)

  const props = (t, enHoy, i) => ({
    t, enHoy, posicion: i + 1, puedeEditar,
    onHoy: () => alHoy(t.id),
    onQuitar: () => quitar(t.id),
    onSubir: () => mover(t.id, -1),
    onBajar: () => mover(t.id, 1),
    onDragStartId: setArrastrando,
    onDropAntes: (id, antes) => alHoy(id, antes),
  })

  return (
    <div className="p-4 max-w-[1600px] mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #hoja-plan, #hoja-plan * { visibility: visible !important; }
          #hoja-plan { position: absolute; left: 0; top: 0; width: 100%; display: block !important; background: #fff; color: #000; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>

      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">🏭 Plan de fábrica</h1>
          <p className="text-xs text-gray-500">Guía para el jefe de fábrica. Mover una cajita NO cambia el pedido.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFecha(hoy)} className={`text-sm px-3 py-2 rounded-xl border ${fecha === hoy ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>Hoy</button>
          <button onClick={() => setFecha(isoMasDias(hoy, 1))} className={`text-sm px-3 py-2 rounded-xl border ${fecha === isoMasDias(hoy, 1) ? 'border-mandarina-500 text-mandarina-400' : 'border-gray-700 text-gray-300'}`}>Mañana</button>
          <input type="date" className="input text-sm py-2 w-auto" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          <button onClick={() => cargar(fecha)} className="text-sm px-3 py-2 rounded-xl border border-gray-700 text-gray-300">↻</button>
          <button onClick={() => window.print()} className="btn-primary text-sm px-4 py-2">🖨️ IMPRIMIR</button>
        </div>
      </div>

      {error && <div className="card p-3 mb-3 text-red-400 text-sm">⚠️ {error}</div>}
      {datos && datos.completo === false && (
        <div className="card p-3 mb-3 text-yellow-400 text-sm">⚠️ No llegaron todos los pedidos. Recarga antes de armar el plan.</div>
      )}
      {cargando && !datos && <div className="text-gray-500 text-sm">Cargando…</div>}

      {datos && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
          {/* Las 3 columnas de estado */}
          {COLUMNAS.map((c) => {
            const lista = tablero.columnas[c]
            return (
              <section key={c} onDragOver={(e) => e.preventDefault()} onDrop={soltarEnColumna}
                className="card p-3 min-h-[200px] lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto">
                <header className="mb-2">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-white">{META_COLUMNA[c].emoji} {META_COLUMNA[c].titulo}</h2>
                    <span className="text-xs bg-gray-800 text-gray-300 rounded-full px-2 py-0.5">{lista.length}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{META_COLUMNA[c].ayuda}</p>
                </header>
                {c === 'DISENO' ? (
                  <div className="space-y-3">
                    {TECNICAS.filter((k) => tablero.disenoPorTecnica[k].length).map((k) => {
                      const grupo = tablero.disenoPorTecnica[k]
                      const cerrado = abiertas[k] === false
                      return (
                        <div key={k}>
                          <button onClick={() => setAbiertas((a) => ({ ...a, [k]: cerrado }))}
                            className="w-full flex items-center justify-between text-xs font-semibold text-gray-300 uppercase tracking-wide py-1">
                            <span>{cerrado ? '▶' : '▼'} {META_TECNICA[k]}</span>
                            <span className="text-gray-500">{grupo.length}</span>
                          </button>
                          {!cerrado && <div className="space-y-2">{grupo.map((t, i) => <Cajita key={t.id} {...props(t, false, i)} />)}</div>}
                        </div>
                      )
                    })}
                    {lista.length === 0 && <div className="text-xs text-gray-600">Nada aquí</div>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lista.map((t, i) => <Cajita key={t.id} {...props(t, false, i)} />)}
                    {lista.length === 0 && <div className="text-xs text-gray-600">Nada aquí</div>}
                  </div>
                )}
              </section>
            )
          })}

          {/* QUÉ SE HACE HOY */}
          <section onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); alHoy(e.dataTransfer.getData('text/plain')) }}
            className={`card p-3 min-h-[200px] border-2 order-first lg:order-none lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto ${arrastrando ? 'border-mandarina-500' : 'border-mandarina-500/40'}`}>
            <header className="mb-2">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-mandarina-400">📌 {tituloHoy}</h2>
                <span className="text-xs bg-mandarina-500/20 text-mandarina-300 rounded-full px-2 py-0.5">{tarjetasHoy.length}</span>
              </div>
              <p className="text-[11px] text-gray-500">
                {unidadesHoy} prendas · {puedeEditar ? 'Arrastra aquí o toca "→ Hoy". Arrastra encima de otra para ordenar.' : 'Solo lectura'}
              </p>
              {guardado && <p className="text-[11px] text-gray-400 mt-1">{guardado}</p>}
            </header>
            {puedeEditar && pendientesAnterior.length > 0 && (
              <button onClick={() => guardar([...plan, ...pendientesAnterior])}
                className="w-full mb-2 text-xs text-mandarina-300 border border-dashed border-mandarina-500/50 rounded-xl py-2 hover:bg-mandarina-500/10">
                ↩ Traer {pendientesAnterior.length} que quedaron del {fechaLarga(datos.anterior.fecha)}
              </button>
            )}
            <div className="space-y-2">
              {tarjetasHoy.map((t, i) => <Cajita key={t.id} {...props(t, true, i)} />)}
              {tarjetasHoy.length === 0 && (
                <div className="text-xs text-gray-600 border border-dashed border-gray-700 rounded-xl p-6 text-center">
                  Arrastra aquí los pedidos que deben salir
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* La hoja que sale al imprimir (no se ve en pantalla) */}
      <div id="hoja-plan" style={{ display: 'none' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{tituloHoy}</h1>
        <p style={{ margin: '2px 0 10px', fontSize: 12 }}>{fechaLarga(fecha)} · {tarjetasHoy.filter((t) => !t.salio).length} pedidos · {unidadesHoy} prendas</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['#', 'Pedido', 'Cliente', 'Prendas', 'Dónde está', 'Qué le pasa', 'Entrega', 'Hecho'].map((h) => (
                <th key={h} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', background: '#eee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tarjetasHoy.filter((t) => !t.salio).map((t, i) => (
              <tr key={t.id}>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', fontFamily: 'monospace' }}>{t.id}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{t.pedido.CLIENTE_NOMBRE}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{t.resumen.total}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{META_COLUMNA[t.columna].titulo} · {META_TECNICA[t.tecnica]}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{t.resumen.frases.join(' · ').replace(/[^\p{L}\p{N}\s/·.,-]/gu, '').trim()}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{t.semaforo.texto}</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', width: 40 }}>☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
