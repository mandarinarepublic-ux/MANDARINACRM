'use client'
// La lista de pedidos detrás de un número del tablero.
//
// Es el último eslabón del rastreo: gasto → creativo → chat → PEDIDO, con
// nombre, celular y cuánto tardó en comprar. Sin esto el tablero dice "este
// anuncio vendió 4" y no hay forma de ir a ver cuáles.
//
// El celular se muestra a propósito: es con lo que se busca la conversación en
// el inbox para ver de dónde salió el cliente.
import { useState, useEffect } from 'react'
import { dinero } from './formato'

export default function Pedidos({ tienda, desde, hasta, anuncio, origen, headers }) {
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    const qs = new URLSearchParams({ tienda, desde, hasta })
    if (anuncio) qs.set('anuncio', anuncio)
    if (origen) qs.set('origen', origen)

    fetch(`/api/pauta/pedidos?${qs}`, { headers, cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
        // `vivo` evita pintar la respuesta de un panel que ya se cerró.
        if (vivo) setPedidos(d.pedidos || [])
      })
      .catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
  }, [tienda, desde, hasta, anuncio, origen])

  if (error) return <div className="text-[10px] text-red-400 mt-2">⚠️ {error}</div>
  if (!pedidos) return <div className="text-[10px] text-gray-600 mt-2">cargando…</div>
  if (!pedidos.length) return <div className="text-[10px] text-gray-600 mt-2">Ningún pedido acá.</div>

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead className="text-gray-600">
          <tr className="text-left">
            <th className="py-1 pr-2">Pedido</th>
            <th className="py-1 pr-2">Fecha</th>
            <th className="py-1 pr-2">Cliente</th>
            <th className="py-1 pr-2">Celular</th>
            <th className="py-1 pr-2">Vendedor</th>
            <th className="py-1 pr-2 text-right">Monto</th>
            {anuncio && <th className="py-1 text-right">Tardó</th>}
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {pedidos.map((p) => (
            <tr key={p.pedidoId} className="border-t border-gray-800/60">
              <td className="py-1 pr-2">
                <a href={`/dashboard/pedido/${p.pedidoId}`}
                   className="font-mono text-mandarina-400 hover:underline">{p.pedidoId}</a>
              </td>
              <td className="py-1 pr-2 whitespace-nowrap">{p.fecha}</td>
              <td className="py-1 pr-2 max-w-[160px] truncate" title={p.cliente}>{p.cliente}</td>
              <td className="py-1 pr-2 font-mono whitespace-nowrap">{p.celular}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{p.vendedor}</td>
              <td className="py-1 pr-2 text-right whitespace-nowrap">
                {dinero(p.monto)}
                {p.estadoPago !== 'PAGADO' && (
                  <span className="ml-1 text-amber-500">({p.estadoPago})</span>
                )}
              </td>
              {anuncio && (
                <td className="py-1 text-right whitespace-nowrap text-gray-500">
                  {p.diasHastaCompra == null ? '—'
                    : p.diasHastaCompra < 1 ? 'mismo día'
                    : `${Math.round(p.diasHastaCompra)} d`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-gray-600 mt-1">
        {pedidos.length} pedido(s) · {dinero(pedidos.reduce((s, p) => s + p.monto, 0))}
      </div>
    </div>
  )
}
