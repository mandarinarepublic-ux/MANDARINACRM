'use client'
// Piezas compartidas por las vistas de la caja (responsable y admin).
import { aCentavos, textoDiferencia } from '@/lib/caja'

export const money = (n) => `$${(Number(n) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function llamar(url, metodo, cuerpo) {
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

export function estadoDiferencia(c, tolerancia) {
  // el arranque no tiene período anterior: nunca hay aviso de tolerancia
  if (c.tipo === 'ARRANQUE') return 'CUADRA'
  const dif = aCentavos(c.diferencia)
  if (dif === 0) return 'CUADRA'
  return Math.abs(dif) > aCentavos(tolerancia) ? 'FUERA' : 'DENTRO'
}

export const PASTILLA = {
  CUADRA: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DENTRO: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  FUERA: 'bg-red-500/10 text-red-300 border-red-500/30',
}

export function Alerta({ texto }) {
  if (!texto) return null
  return <div role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{texto}</div>
}

export function Fila({ k, v }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-0.5">
      <span className="text-gray-400">{k}</span>
      <span className="tabular-nums font-medium text-white">{v}</span>
    </div>
  )
}

/** El ticket de un cierre: abrió con, cobros, salidas, debería haber, contó, diferencia. */
export function Ticket({ c, caja, contoTxt = 'Contaste' }) {
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
            {c.salidas_lista?.length ? c.salidas_lista.map((s) => (
              <div key={s.id} className="flex justify-between gap-2 text-sm text-gray-300 pl-2">
                <span className="min-w-0 break-words">{s.motivo}</span><span className="tabular-nums shrink-0">-{money(s.monto)}</span>
              </div>
            )) : <div className="text-sm text-gray-500 pl-2">Ninguna</div>}
          </div>
          <Fila k="Debería haber" v={money(c.esperado)} />
        </>
      )}
      <Fila k={contoTxt} v={money(c.contado)} />
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
