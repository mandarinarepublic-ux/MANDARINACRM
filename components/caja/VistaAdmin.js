'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import InputDinero from '@/components/InputDinero'
import { formatFechaCorta } from '@/lib/parseFecha'
import { aDolares, textoDiferencia, aCentavos, urlSegura } from '@/lib/caja'
import { money, llamar, Alerta, Ticket, PASTILLA, estadoDiferencia } from './comunes'

const TABS = [['confirmar', 'Por confirmar'], ['cierres', 'Cierres'], ['ajustes', 'Ajustes']]
const MOTIVO_AVISO = {
  BORRADO: 'se borró',
  YA_NO_EFECTIVO: 'ya no es un cobro en efectivo',
  MONTO: 'cambió de monto',
}
const CONFIRMACION = { PENDIENTE: '⏳ Pendiente', OK: '✓ Recibido', NO_CUADRA: '✗ No cuadra' }

const porFecha = (a, b) => new Date(a.fecha) - new Date(b.fecha)

/** Un renglón de «Por confirmar»: sobre, depósito o transferencia. */
function ItemConfirmar({ it, ocupado, actuar }) {
  const [pidiendoMonto, setPidiendoMonto] = useState(false)
  const [montoReal, setMontoReal] = useState('')
  const esTransf = it.clase === 'TRANSFERENCIA'
  const enviando = ocupado === it.clave

  const titulo = esTransf ? '🔁 Transferencia' : it.tipo === 'SOBRE' ? '💵 Sobre' : '🏦 Depósito'
  const foto = urlSegura(esTransf ? it.foto_comprobante_url : it.foto_url)
  const botones = esTransf
    ? [['✓ Llegó', { accion: 'verificar-transferencia', pagoId: it.pago_id, resultado: 'LLEGO' }, 'btn-primary'],
      ['✗ No llegó', { accion: 'verificar-transferencia', pagoId: it.pago_id, resultado: 'NO_LLEGO' }, 'btn-secondary']]
    : [[it.tipo === 'SOBRE' ? '✓ Recibido' : '✓ Llegó', { accion: 'confirmar-movimiento', movId: it.id, resultado: 'OK' }, 'btn-primary']]

  return (
    <li className="card p-3 space-y-2">
      <div className="flex justify-between gap-3 items-start">
        <div className="min-w-0 text-sm">
          <div className="text-white font-semibold">{titulo}</div>
          <div className="text-xs text-gray-500">
            {formatFechaCorta(it.fecha)}{it.creado_por_nombre ? ` · ${it.creado_por_nombre}` : ''}
          </div>
          {esTransf && (
            <div className="text-xs text-gray-400">
              Pedido <Link className="text-mandarina-400 underline" href={`/dashboard/pedido/${it.pedido_id}`}>{it.pedido_id}</Link>
            </div>
          )}
          {foto && <a className="text-xs text-mandarina-400 underline" href={foto} target="_blank" rel="noreferrer">Ver foto</a>}
        </div>
        <div className="tabular-nums text-white font-semibold shrink-0">{money(it.monto)}</div>
      </div>
      {pidiendoMonto ? (
        <div className="space-y-2">
          <label className="label" htmlFor={`real-${it.clave}`}>¿Cuánto había?</label>
          <InputDinero id={`real-${it.clave}`} className="input" placeholder="0,00" value={montoReal} onChange={(e) => setMontoReal(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={enviando || montoReal === ''}
              onClick={() => actuar(it.clave, { accion: 'confirmar-movimiento', movId: it.id, resultado: 'NO_CUADRA', montoReal })}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setPidiendoMonto(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {botones.map(([txt, cuerpo, cls]) => (
            <button key={txt} type="button" className={cls} disabled={enviando} onClick={() => actuar(it.clave, cuerpo)}>{txt}</button>
          ))}
          {!esTransf && <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setPidiendoMonto(true)}>✗ No cuadra</button>}
        </div>
      )}
    </li>
  )
}

function PorConfirmar({ datos, ocupado, actuar }) {
  const { porConfirmar: pc, noLlegaron, avisos } = datos
  const items = [
    ...pc.movimientos.map((m) => ({ ...m, clase: 'MOV', clave: `m${m.id}`, fecha: m.creado_en })),
    ...pc.transferencias.map((t) => ({ ...t, clase: 'TRANSFERENCIA', clave: `t${t.pago_id}` })),
  ].sort(porFecha)

  return (
    <div className="space-y-4">
      {items.length ? (
        <ul className="space-y-2">
          {items.map((it) => <ItemConfirmar key={it.clave} it={it} ocupado={ocupado} actuar={actuar} />)}
        </ul>
      ) : <div className="text-sm text-gray-400">No hay nada por confirmar.</div>}

      {noLlegaron.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-red-300 font-semibold">No llegaron</h2>
          <ul className="space-y-1.5">
            {noLlegaron.map((t) => (
              <li key={t.pago_id} className="flex justify-between gap-3 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                <span className="text-red-200">
                  Transferencia · Pedido <Link className="underline" href={`/dashboard/pedido/${t.pedido_id}`}>{t.pedido_id}</Link>
                  <span className="block text-xs text-red-300/70">{formatFechaCorta(t.fecha)}</span>
                </span>
                <span className="tabular-nums text-red-200 shrink-0">{money(t.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {avisos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-amber-300 font-semibold">Avisos</h2>
          <ul className="space-y-1.5">
            {avisos.map((a) => (
              <li key={a.pago_id} className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                Un cobro del cierre{a.fecha ? ` del ${formatFechaCorta(a.fecha)}` : ''}
                {a.pedido_id ? <> (pedido <Link className="underline" href={`/dashboard/pedido/${a.pedido_id}`}>{a.pedido_id}</Link>)</> : null}
                {' '}{MOTIVO_AVISO[a.motivo] || 'cambió'} después de firmarse. El cierre no se modificó.
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function FilaCierre({ c, caja, puedeReabrir, abierto, alternar, ocupado, actuar }) {
  const [confirmando, setConfirmando] = useState(false)
  const arranque = c.tipo === 'ARRANQUE'
  const estado = estadoDiferencia(c, caja.tolerancia)
  const salida = c.salida
  const celda = 'px-2 py-2 whitespace-nowrap tabular-nums text-right'
  return (
    <>
      <tr className="border-t border-gray-800 cursor-pointer hover:bg-gray-800/40" onClick={alternar}>
        <td className="px-2 py-2 whitespace-nowrap">
          <button type="button" className="text-left text-gray-200 underline decoration-dotted" aria-expanded={abierto}
            onClick={(e) => { e.stopPropagation(); alternar() }}>
            {formatFechaCorta(c.cerrado_en || c.contado_en)}{arranque ? ' · Arranque' : ''}
          </button>
        </td>
        <td className={celda}>{arranque ? '—' : money(c.apertura)}</td>
        <td className={celda}>{arranque ? '—' : money(c.cobros_efectivo)}</td>
        <td className={celda}>{arranque ? '—' : money(c.salidas)}</td>
        <td className={celda}>{arranque ? '—' : money(c.esperado)}</td>
        <td className={celda}>{money(c.contado)}</td>
        <td className={`${celda} ${c.fueraTolerancia ? 'text-red-300 font-semibold' : ''}`}>
          {arranque ? '—' : textoDiferencia(aCentavos(c.diferencia))}
        </td>
        <td className="px-2 py-2 min-w-[8rem] text-gray-300">{c.motivo || ''}</td>
        <td className="px-2 py-2 whitespace-nowrap text-gray-300">
          {salida ? `${salida.tipo === 'SOBRE' ? '💵 Sobre' : '🏦 Depósito'} ${money(salida.monto)}` : '—'}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-gray-300">
          {salida ? (
            <>
              {CONFIRMACION[salida.confirmacion] || '—'}
              {salida.confirmacion === 'NO_CUADRA' && salida.monto_confirmado != null ? ` (${money(salida.monto_confirmado)})` : ''}
            </>
          ) : '—'}
        </td>
      </tr>
      {abierto && (
        <tr className="border-t border-gray-800 bg-gray-900/40">
          <td colSpan={10} className="p-3">
            <div className="max-w-sm space-y-3">
              <Ticket c={c} caja={caja} contoTxt="Contó" />
              {c.motivo && <div className="text-sm text-gray-400">Motivo: {c.motivo}</div>}
              {c.firmado_por_nombre && <div className="text-xs text-gray-500">Firmó {c.firmado_por_nombre}</div>}
              {urlSegura(salida?.foto_url) && <a className="text-sm text-mandarina-400 underline" href={urlSegura(salida.foto_url)} target="_blank" rel="noreferrer">Ver papeleta</a>}
              {!puedeReabrir ? null : confirmando ? (
                <div className="space-y-2">
                  <div className="text-sm text-amber-300">El cierre vuelve a quedar sin firmar y la responsable tendrá que cerrar de nuevo. ¿Reabrir?</div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary" disabled={ocupado === `c${c.id}`}
                      onClick={() => actuar(`c${c.id}`, { accion: 'reabrir', cierreId: c.id })}>
                      {ocupado === `c${c.id}` ? 'Reabriendo…' : 'Sí, reabrir'}
                    </button>
                    <button type="button" className="btn-secondary" disabled={ocupado === `c${c.id}`} onClick={() => setConfirmando(false)}>No</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => setConfirmando(true)}>Reabrir</button>
              )}
              {estado === 'FUERA' && <div className="text-xs text-red-300">Este cierre pasó de la tolerancia.</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Cierres({ datos, ocupado, actuar }) {
  const { caja, cierres, abierto } = datos
  const [abiertoId, setAbiertoId] = useState(null)
  const th = 'px-2 py-2 text-left font-medium whitespace-nowrap'
  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-300 bg-gray-800/60 rounded-xl px-3 py-2">
        Desde el último cierre: cobros {money(aDolares(abierto.cobrosC))} · salidas {money(aDolares(abierto.salidasC))}
      </div>
      {cierres.length ? (
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className={th}>Fecha</th><th className={`${th} text-right`}>Abrió</th><th className={`${th} text-right`}>Cobros</th>
                <th className={`${th} text-right`}>Salidas</th><th className={`${th} text-right`}>Esperado</th><th className={`${th} text-right`}>Contó</th>
                <th className={`${th} text-right`}>Diferencia</th><th className={th}>Motivo</th><th className={th}>Salida</th><th className={th}>Confirmación</th>
              </tr>
            </thead>
            <tbody>
              {cierres.map((c, i) => (
                <FilaCierre key={c.id} c={c} caja={caja} puedeReabrir={i === 0} abierto={abiertoId === c.id}
                  alternar={() => setAbiertoId(abiertoId === c.id ? null : c.id)} ocupado={ocupado} actuar={actuar} />
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="text-sm text-gray-400">Todavía no hay cierres.</div>}
    </div>
  )
}

function Ajustes({ datos, ocupado, actuar }) {
  const { caja } = datos
  const [fondo, setFondo] = useState(String(caja.fondo_fijo ?? ''))
  const [tolerancia, setTolerancia] = useState(String(caja.tolerancia ?? ''))
  const [repAbierta, setRepAbierta] = useState(false)
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')

  async function reponer() {
    const ok = await actuar('reposicion', { accion: 'reposicion', cajaId: caja.id, monto, motivo })
    if (ok) { setMonto(''); setMotivo(''); setRepAbierta(false) }
  }
  return (
    <div className="space-y-4">
      <section className="card p-4 space-y-3">
        <h2 className="text-white font-semibold">Ajustes de la caja</h2>
        <div>
          <label className="label" htmlFor="aj-fondo">Fondo fijo</label>
          <InputDinero id="aj-fondo" className="input" value={fondo} onChange={(e) => setFondo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="aj-tol">Tolerancia</label>
          <InputDinero id="aj-tol" className="input" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
        </div>
        <button type="button" className="btn-primary w-full" disabled={ocupado === 'ajustes'}
          onClick={() => actuar('ajustes', { accion: 'ajustes', cajaId: caja.id, fondo_fijo: fondo, tolerancia })}>
          {ocupado === 'ajustes' ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </section>

      <section className="card p-4 space-y-3">
        {repAbierta ? (
          <>
            <h2 className="text-white font-semibold">Reposición de fondo</h2>
            <div>
              <label className="label" htmlFor="rep-monto">Monto</label>
              <InputDinero id="rep-monto" className="input" placeholder="0,00" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="rep-motivo">Motivo (opcional)</label>
              <input id="rep-motivo" className="input" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" disabled={ocupado === 'reposicion' || monto === ''} onClick={reponer}>
                {ocupado === 'reposicion' ? 'Guardando…' : 'Guardar reposición'}
              </button>
              <button type="button" className="btn-secondary" disabled={ocupado === 'reposicion'} onClick={() => setRepAbierta(false)}>Cancelar</button>
            </div>
          </>
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setRepAbierta(true)}>+ Reposición de fondo</button>
        )}
      </section>
    </div>
  )
}

export default function VistaAdmin() {
  const [datos, setDatos] = useState(null)
  const [cajaId, setCajaId] = useState(null)
  const [tab, setTab] = useState('confirmar')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)

  const cargar = useCallback(async (id) => {
    try {
      const d = await llamar(`/api/caja/admin${id ? `?cajaId=${id}` : ''}`, 'GET')
      setDatos(d)
      return true
    } catch (e) { setError(e.message); return false }
  }, [])
  useEffect(() => { cargar(cajaId) }, [cargar, cajaId])

  // Manda una acción y recarga todo. Devuelve true si salió bien.
  async function actuar(clave, cuerpo) {
    if (ocupado) return false
    setError(''); setOcupado(clave)
    try {
      await llamar('/api/caja/admin/accion', 'POST', cuerpo)
      return await cargar(cajaId)
    } catch (e) {
      setError(e.message)
      if (e.status === 409) await cargar(cajaId)
      return false
    } finally { setOcupado(null) }
  }

  if (!datos) return error ? <Alerta texto={error} /> : <div className="text-sm text-gray-500">Cargando…</div>
  if (!datos.caja) return <div className="card p-4 text-sm text-gray-300">Todavía no hay cajas configuradas</div>

  const { caja, cajas } = datos
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-white">Caja · {caja.nombre}</h1>
        {cajas.length > 1 && (
          <select aria-label="Caja" className="input w-auto" value={caja.id} onChange={(e) => setCajaId(Number(e.target.value))}>
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </div>

      <div role="tablist" className="flex gap-1 border-b border-gray-800">
        {TABS.map(([k, txt]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-mandarina-500 text-white' : 'border-transparent text-gray-400'}`}>
            {txt}
            {k === 'confirmar' && (datos.porConfirmar.movimientos.length + datos.porConfirmar.transferencias.length) > 0 && (
              <span className="ml-1.5 text-xs bg-mandarina-500 text-white rounded-full px-1.5 py-0.5">
                {datos.porConfirmar.movimientos.length + datos.porConfirmar.transferencias.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <Alerta texto={error} />

      {tab === 'confirmar' && <PorConfirmar datos={datos} ocupado={ocupado} actuar={actuar} />}
      {tab === 'cierres' && <Cierres datos={datos} ocupado={ocupado} actuar={actuar} />}
      {tab === 'ajustes' && <Ajustes key={caja.id} datos={datos} ocupado={ocupado} actuar={actuar} />}
    </div>
  )
}
