'use client'
import { useCallback, useEffect, useState } from 'react'
import InputDinero from '@/components/InputDinero'
import { subirFoto } from '@/lib/subirImagen'
import { formatFechaCorta, fechaISOEcuador } from '@/lib/parseFecha'
import { aCentavos, textoDiferencia } from '@/lib/caja'

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Día de calendario de Ecuador, como "2026-11-22" (helper de lib/parseFecha.js).
const diaEc = fechaISOEcuador
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const diaMes = (iso) => { const d = diaEc(iso); return `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}` }

async function llamar(url, metodo, cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    cache: 'no-store',
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'No se pudo completar. Intenta de nuevo.'), { status: r.status })
  return d
}

function estadoDiferencia(c, tolerancia) {
  const dif = aCentavos(c.diferencia)
  if (dif === 0) return 'CUADRA'
  return Math.abs(dif) > aCentavos(tolerancia) ? 'FUERA' : 'DENTRO'
}

const PASTILLA = {
  CUADRA: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DENTRO: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  FUERA: 'bg-red-500/10 text-red-300 border-red-500/30',
}

function Alerta({ texto }) {
  if (!texto) return null
  return <div role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{texto}</div>
}

function Fila({ k, v }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-0.5">
      <span className="text-gray-400">{k}</span>
      <span className="tabular-nums font-medium text-white">{v}</span>
    </div>
  )
}

/** El ticket de un cierre: abrió con, cobros, salidas, debería haber, contó, diferencia. */
function Ticket({ c, caja }) {
  const normal = c.tipo !== 'ARRANQUE'
  const estado = estadoDiferencia(c, caja.tolerancia)
  return (
    <div className="space-y-1">
      {normal && (
        <>
          <Fila k="Abrió con" v={money(c.apertura)} />
          <div className="py-1">
            <div className="text-xs text-gray-500 mb-0.5">Cobros en efectivo</div>
            {c.pagos?.length ? c.pagos.map((p) => (
              <div key={p.pago_id} className="flex justify-between text-sm text-gray-300 pl-2">
                <span>Pedido {p.pedido_id || '—'}</span><span className="tabular-nums">+{money(p.monto)}</span>
              </div>
            )) : <div className="text-sm text-gray-500 pl-2">Ninguno</div>}
          </div>
          <Fila k="Total cobros" v={`+${money(c.cobros_efectivo)}`} />
          <div className="py-1">
            <div className="text-xs text-gray-500 mb-0.5">Salidas</div>
            {c.salidas?.length ? c.salidas.map((s) => (
              <div key={s.id} className="flex justify-between gap-2 text-sm text-gray-300 pl-2">
                <span className="min-w-0 break-words">{s.motivo}</span><span className="tabular-nums shrink-0">-{money(s.monto)}</span>
              </div>
            )) : <div className="text-sm text-gray-500 pl-2">Ninguna</div>}
          </div>
          <Fila k="Debería haber" v={money(c.esperado)} />
        </>
      )}
      <Fila k="Contaste" v={money(c.contado)} />
      {normal && (
        <div className="pt-2">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${PASTILLA[estado]}`}>
            {textoDiferencia(aCentavos(c.diferencia))}
          </span>
        </div>
      )}
    </div>
  )
}

function Salidas({ salidas }) {
  if (!salidas?.length) return <div className="text-sm text-gray-500">Aún no anotas salidas hoy.</div>
  return (
    <ul className="space-y-1.5">
      {salidas.map((s) => (
        <li key={s.id} className="flex justify-between gap-3 text-sm bg-gray-800/60 rounded-xl px-3 py-2">
          <span className="min-w-0 break-words text-gray-200">
            {s.motivo}
            <span className="block text-xs text-gray-500">{formatFechaCorta(s.creado_en)}{s.foto_url ? ' · con foto' : ''}</span>
          </span>
          <span className="tabular-nums text-white shrink-0">-{money(s.monto)}</span>
        </li>
      ))}
    </ul>
  )
}

function FormSalida({ alGuardar }) {
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [foto, setFoto] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  if (!abierto) {
    return <button type="button" className="btn-secondary w-full" onClick={() => setAbierto(true)}>+ Anotar salida</button>
  }
  async function guardar() {
    setError(''); setOcupado(true)
    try {
      const fotoUrl = foto ? await subirFoto(foto, 'caja') : null
      await llamar('/api/caja/movimiento', 'POST', { monto, motivo, fotoUrl })
      setMonto(''); setMotivo(''); setFoto(null); setAbierto(false)
      await alGuardar()
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  return (
    <div className="space-y-3 bg-gray-800/40 border border-gray-700 rounded-2xl p-3">
      <div>
        <label className="label" htmlFor="sal-monto">Monto</label>
        <InputDinero id="sal-monto" className="input" placeholder="0,00" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="sal-motivo">¿En qué se gastó?</label>
        <input id="sal-motivo" className="input" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="sal-foto">Foto (opcional)</label>
        <input id="sal-foto" type="file" accept="image/*" className="text-sm text-gray-300 w-full"
          onChange={(e) => setFoto(e.target.files?.[0] || null)} />
      </div>
      <Alerta texto={error} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar salida'}</button>
        <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => { setAbierto(false); setError('') }}>Cancelar</button>
      </div>
    </div>
  )
}

/** Firma el conteo: motivo (si hace falta), excedente y destino. */
function Firma({ pendiente, caja, recargar }) {
  const arranque = pendiente.tipo === 'ARRANQUE'
  const excedenteC = Math.max(0, aCentavos(pendiente.contado) - aCentavos(caja.fondo_fijo))
  const excedente = excedenteC / 100
  const requiereMotivo = !arranque && estadoDiferencia(pendiente, caja.tolerancia) === 'FUERA'
  const [motivo, setMotivo] = useState('')
  const [monto, setMonto] = useState(excedente ? String(excedente) : '')
  const [destino, setDestino] = useState(arranque ? 'SOBRE' : '')
  const [foto, setFoto] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const montoC = aCentavos(monto)
  async function cerrar() {
    setError('')
    if (requiereMotivo && !motivo.trim()) return setError('Escribe qué pasó: la diferencia pasa de la tolerancia.')
    if (montoC > excedenteC) return setError(`Solo puedes sacar hasta ${money(excedente)}.`)
    if (montoC > 0 && !destino) return setError('Elige qué haces con el excedente: a sobre o depositado.')
    setOcupado(true)
    try {
      const cuerpo = { cierreId: pendiente.id, motivo: motivo.trim() || undefined }
      if (montoC > 0) {
        const fotoUrl = foto ? await subirFoto(foto, 'caja') : null
        cuerpo.salida = { tipo: destino, monto, fotoUrl }
      }
      await llamar('/api/caja/cierre', 'PATCH', cuerpo)
      await recargar()
    } catch (e) {
      setError(e.message)
      if (e.status === 409 || e.status === 404) await recargar()
    } finally { setOcupado(false) }
  }

  // Si el servidor manda la fecha de cada cobro, se avisa de los días sin cierre.
  const desde = (pendiente.pagos || []).map((p) => p.fecha).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0]
  const avisoDia = !arranque && desde && diaEc(desde) < diaEc(pendiente.contado_en)
  return (
    <div className="space-y-3">
      {avisoDia && (
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          Incluye cobros desde el {diaMes(desde)}: ese día no se cerró la caja
        </div>
      )}
      {!arranque && aCentavos(pendiente.apertura) < aCentavos(caja.fondo_fijo) && (
        <div className="text-sm text-red-300">Abrió con menos de {money(caja.fondo_fijo)}</div>
      )}
      {requiereMotivo && (
        <div>
          <label className="label" htmlFor="cierre-motivo">¿Qué pasó?</label>
          <textarea id="cierre-motivo" rows={2} maxLength={200} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
      )}
      <div className="text-white font-semibold">
        {arranque ? `Al sobre: ${money(excedente)}` : '¿Qué haces con el excedente?'}
      </div>
      {excedenteC > 0 ? (
        <div className="space-y-3">
          {!arranque && (
            <div className="grid grid-cols-2 gap-2">
              {[['SOBRE', '💵 A sobre'], ['DEPOSITO', '🏦 Depositado/transferido']].map(([k, txt]) => (
                <button key={k} type="button" aria-pressed={destino === k} onClick={() => setDestino(k)}
                  className={`rounded-xl border px-2 py-3 text-sm font-medium ${destino === k ? 'bg-mandarina-500 border-mandarina-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                  {txt}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="label" htmlFor="cierre-monto">Monto (máximo {money(excedente)})</label>
            <InputDinero id="cierre-monto" className="input" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
          {!arranque && destino === 'DEPOSITO' && (
            <div>
              <label className="label" htmlFor="cierre-foto">Foto de la papeleta (opcional ahora)</label>
              <input id="cierre-foto" type="file" accept="image/*" className="text-sm text-gray-300 w-full"
                onChange={(e) => setFoto(e.target.files?.[0] || null)} />
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-400">No hay excedente: lo contado no pasa del fondo fijo.</div>
      )}
      <Alerta texto={error} />
      <button type="button" className="btn-primary w-full" disabled={ocupado} onClick={cerrar}>
        {ocupado ? 'Cerrando…' : arranque ? 'Cerrar arranque' : 'Cerrar caja'}
      </button>
    </div>
  )
}

function Historial({ cierres, caja, recargar }) {
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(null)
  if (!cierres.length) return null

  async function subirPapeleta(movId, file) {
    if (!file) return
    setError(''); setOcupado(movId)
    try {
      const fotoUrl = await subirFoto(file, 'caja')
      await llamar(`/api/caja/movimiento/${movId}/foto`, 'POST', { fotoUrl })
      await recargar()
    } catch (e) { setError(e.message) } finally { setOcupado(null) }
  }
  return (
    <section className="space-y-2">
      <h2 className="text-white font-semibold">Cierres anteriores</h2>
      <Alerta texto={error} />
      {cierres.map((c) => {
        const estado = estadoDiferencia(c, caja.tolerancia)
        const sinFoto = c.salida?.tipo === 'DEPOSITO' && !c.salida.foto_url
        return (
          <div key={c.id} className="card">
            <button type="button" aria-expanded={abierto === c.id} onClick={() => setAbierto(abierto === c.id ? null : c.id)}
              className="w-full flex items-center justify-between gap-2 p-3 text-left rounded-2xl">
              <span className="text-sm text-gray-200">{formatFechaCorta(c.cerrado_en || c.contado_en)}{c.tipo === 'ARRANQUE' ? ' · Arranque' : ''}</span>
              {c.tipo !== 'ARRANQUE' && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${PASTILLA[estado]}`}>{textoDiferencia(aCentavos(c.diferencia))}</span>
              )}
            </button>
            {abierto === c.id && (
              <div className="px-3 pb-3 space-y-2">
                <Ticket c={c} caja={caja} />
                {c.motivo && <div className="text-sm text-gray-400">Motivo: {c.motivo}</div>}
                {c.salida && <div className="text-sm text-gray-300">{c.salida.tipo === 'SOBRE' ? '💵 Al sobre' : '🏦 Depositado'}: {money(c.salida.monto)}</div>}
              </div>
            )}
            {sinFoto && (
              <div className="px-3 pb-3">
                <label className={`btn-secondary inline-flex items-center cursor-pointer text-sm ${ocupado === c.salida.id ? 'opacity-50 pointer-events-none' : ''}`}>
                  {ocupado === c.salida.id ? 'Subiendo…' : '📷 Subir papeleta'}
                  <input type="file" accept="image/*" className="sr-only" disabled={ocupado === c.salida.id}
                    onChange={(e) => { subirPapeleta(c.salida.id, e.target.files?.[0]); e.target.value = '' }} />
                </label>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

export default function VistaResponsable() {
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [contado, setContado] = useState('')
  const [errorConteo, setErrorConteo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await llamar('/api/caja', 'GET'))
      setErrorCarga('')
    } catch (e) { setErrorCarga(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardarConteo() {
    setErrorConteo(''); setGuardando(true)
    try {
      await llamar('/api/caja/cierre', 'POST', { contado })
      setContado('')
      await cargar()
    } catch (e) {
      setErrorConteo(e.message)
      if (e.status === 409) await cargar()
    } finally { setGuardando(false) }
  }

  if (errorCarga && !datos) return <Alerta texto={errorCarga} />
  if (!datos) return <div className="text-sm text-gray-500">Cargando…</div>

  const { caja, necesitaArranque, pendienteCerrar: pend, salidasDelDia, cierres } = datos
  // El cierre en CONTADO también viene en `cierres`: no se pinta dos veces.
  const historial = cierres.filter((c) => !pend || c.id !== pend.id)

  const formConteo = (titulo, texto) => (
    <section className="card p-4 space-y-3">
      <h1 className="text-lg font-bold text-white">{titulo}</h1>
      {texto && <p className="text-sm text-gray-300">{texto}</p>}
      <div>
        <label className="label" htmlFor="conteo">¿Cuánto contaste en billetes y monedas?</label>
        <InputDinero id="conteo" className="input text-lg" placeholder="0,00" value={contado} onChange={(e) => setContado(e.target.value)} />
      </div>
      <Alerta texto={errorConteo} />
      <button type="button" className="btn-primary w-full" disabled={guardando || !contado} onClick={guardarConteo}>
        {guardando ? 'Guardando…' : 'Guardar conteo'}
      </button>
    </section>
  )

  return (
    <div className="space-y-4">
      {errorCarga && <Alerta texto={errorCarga} />}

      {pend ? (
        <section className="card p-4 space-y-3">
          <h1 className="text-lg font-bold text-white">{pend.tipo === 'ARRANQUE' ? 'Arranque de caja' : 'Cierre de hoy'}</h1>
          <div className="text-xs text-gray-500">Conteo guardado {formatFechaCorta(pend.contado_en)}</div>
          <Ticket c={pend} caja={caja} />
          <Firma key={pend.id} pendiente={pend} caja={caja} recargar={cargar} />
        </section>
      ) : necesitaArranque ? (
        formConteo('Arranque de caja', 'Cuenta todo el efectivo que hay en el cajón. Deja $20 de fondo y lo demás va a un sobre para Rodrigo.')
      ) : (
        <>
          {formConteo('Cierre de hoy')}
          <section className="card p-4 space-y-3">
            <h2 className="text-white font-semibold">Salidas de hoy</h2>
            <FormSalida alGuardar={cargar} />
            <Salidas salidas={salidasDelDia} />
          </section>
        </>
      )}

      <Historial cierres={historial} caja={caja} recargar={cargar} />
    </div>
  )
}
