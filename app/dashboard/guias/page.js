'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatFechaCorta } from '@/lib/parseFecha'

/**
 * 🚚 CONSULTAR GUÍAS — pedido de Rodrigo, 20-nov-2026.
 *
 * "¿Ya salió el pedido de este cliente? ¿Con qué guía?". Un solo buscador:
 * número de guía, nombre, celular, cédula, dirección/ciudad o número de pedido.
 * Solo consulta: las guías se registran en Despacho (o solas desde el inbox).
 * Cada uno ve lo mismo que en el Historial (el alcance lo pone el servidor).
 */

const ESTADO_CLS = {
  COMPLETADO: 'text-emerald-300', ENTREGADO: 'text-emerald-300', DESPACHO: 'text-purple-300',
  EN_FABRICA: 'text-amber-300', CANCELADO: 'text-red-300',
}

export default function GuiasPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)        // null = sin buscar todavía
  const [buscado, setBuscado] = useState('')  // lo que se buscó (no lo que hay en la caja ahora)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')
  const ultimaRef = useRef(0)

  useEffect(() => {
    if (!localStorage.getItem('mp_user')) router.push('/')
  }, [router])

  // Solo la ÚLTIMA búsqueda pinta: una lenta que llega después no pisa a la nueva.
  async function buscar() {
    const t = q.trim()
    if (t.length < 3) { setError('Escribe al menos 3 letras o números.'); return }
    const id = ++ultimaRef.current
    setBuscando(true); setError('')
    try {
      const r = await fetch(`/api/guias?q=${encodeURIComponent(t)}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (id !== ultimaRef.current) return
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      setRes(j.resultados || []); setBuscado(t)
    } catch (e) {
      if (id === ultimaRef.current) { setError(e.message); setRes(null) }
    } finally {
      if (id === ultimaRef.current) setBuscando(false)
    }
  }

  const conGuia = (res || []).filter((p) => p.guias.length).length

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white">🚚 Consultar guías</h1>
      <p className="text-sm text-gray-500 mt-1">
        Número de guía, nombre del cliente, celular, cédula, dirección o número de pedido.
        Muestra cada pedido con su guía, o si todavía no tiene.
      </p>

      <div className="flex gap-2 mt-4">
        <input className="input flex-1" value={q} autoFocus enterKeyHint="search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
          placeholder="Ej: 9036835780 · Ámbar Rosado · 0986979499 · MAN-AND-6314" />
        <button onClick={buscar} disabled={buscando} className="btn-primary px-4 disabled:opacity-60">
          {buscando ? '…' : '🔍 Buscar'}
        </button>
      </div>
      {error && <div className="mt-3 text-sm text-red-400">⚠️ {error}</div>}

      {res && (
        <div className="mt-5">
          <div className="text-xs text-gray-500 mb-2">
            {res.length
              ? <>Resultados para “{buscado}”: {res.length} pedido{res.length === 1 ? '' : 's'} · {conGuia} con guía</>
              : <>Nada para “{buscado}”. Prueba con otro dato: un apellido, el celular o el número de pedido.</>}
          </div>
          <div className="flex flex-col gap-3">
            {res.map((p) => (
              <div key={p.pedido_id} className={`card p-4 border-l-4 ${p.guias.length ? 'border-l-emerald-500' : 'border-l-gray-700'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link href={`/dashboard/pedido/${encodeURIComponent(p.pedido_id)}`} className="font-bold text-white hover:text-mandarina-400">
                    {p.pedido_id}
                  </Link>
                  <span className={`text-xs font-semibold ${ESTADO_CLS[p.estado] || 'text-gray-400'}`}>{p.estado}</span>
                  <span className="text-xs text-gray-500">· {formatFechaCorta(p.fecha_pedido)}{p.vendedor && ` · ${p.vendedor}`}</span>
                </div>
                <div className="text-sm text-gray-300 mt-1">
                  {p.cliente || '—'}
                  {p.celular && <span className="text-gray-500"> · 📱 {p.celular}</span>}
                  {p.ciudad && <span className="text-gray-500"> · 📍 {p.ciudad}</span>}
                </div>
                {p.razones?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.razones.map((r) => (
                      <span key={r} className="text-[11px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300">{r}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  {p.guias.length ? p.guias.map((g, i) => (
                    <div key={g.numero + i} className="flex items-center gap-3 bg-gray-900/60 rounded-lg px-3 py-2 mt-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-bold text-white">🚚 {g.numero || '(sin número)'}</div>
                        <div className="text-xs text-gray-400">
                          {g.transportista}{g.fecha && ` · ${formatFechaCorta(g.fecha)}`}{g.registrado_por && ` · por ${g.registrado_por}`}
                        </div>
                      </div>
                      {g.foto && (
                        <a href={g.foto} target="_blank" rel="noreferrer" className="text-xs text-mandarina-400 hover:underline shrink-0">ver foto</a>
                      )}
                    </div>
                  )) : (
                    <div className="text-xs text-gray-500">Todavía sin guía.</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
