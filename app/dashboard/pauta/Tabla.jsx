'use client'
// Campaña → conjunto → anuncio, desplegable.
//
// Viene ordenado por gasto desde el servidor (lib/pauta/tablero.js), así que lo
// caro aparece primero: es donde hay plata que mover. Los anuncios sin gasto
// conocido quedan al final, ordenados por chats.
//
// El detalle del anuncio muestra el ARTE, que es el punto de todo esto: sirve
// para mirar la imagen y el texto que produjeron esas ventas, no solo su ID.
import { useState } from 'react'
import { dinero, numero, veces } from './formato'
import Pedidos from './Pedidos'

export default function Tabla({ campanas, ctx }) {
  if (!campanas?.length) {
    return (
      <div className="card p-8 text-center text-gray-600">
        <div className="text-3xl mb-2">📭</div>
        Sin anuncios con actividad en este rango.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {campanas.map((c) => <Campana key={c.campaignId} c={c} ctx={ctx} />)}
    </div>
  )
}

function Campana({ c, ctx }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAbierta(!abierta)}
              className="w-full flex items-center gap-2 p-3 hover:bg-gray-800/40 text-left">
        <span className="text-gray-600 text-xs w-3">{abierta ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{c.nombre}</div>
          <div className="text-[10px] text-gray-500">{c.conjuntos.length} conjunto(s)</div>
        </div>
        <Cifras x={c} />
      </button>

      {abierta && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {c.conjuntos.map((cj) => <Conjunto key={cj.adsetId} cj={cj} ctx={ctx} />)}
        </div>
      )}
    </div>
  )
}

function Conjunto({ cj, ctx }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      <button onClick={() => setAbierto(!abierto)}
              className="w-full flex items-center gap-2 p-2.5 pl-8 hover:bg-gray-800/30 text-left">
        <span className="text-gray-700 text-xs w-3">{abierto ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-300 truncate">{cj.nombre}</div>
          <div className="text-[10px] text-gray-600">{cj.artes.length} anuncio(s)</div>
        </div>
        <Cifras x={cj} chico />
      </button>

      {abierto && (
        <div className="pl-8 pb-2 space-y-1.5">
          {cj.artes.map((a) => <Anuncio key={a.adId} a={a} ctx={ctx} />)}
        </div>
      )}
    </div>
  )
}

function Anuncio({ a, ctx }) {
  const [verArte, setVerArte] = useState(false)
  const [verPedidos, setVerPedidos] = useState(false)
  // Un anuncio con gasto y sin una sola venta es la señal más accionable del
  // tablero: es plata quemada, y se marca para que salte a la vista.
  const quemando = a.gasto != null && a.gasto > 0 && a.pagados === 0

  return (
    <div className={`rounded-lg border p-2.5 ${quemando ? 'border-red-500/30 bg-red-500/5' : 'border-gray-800 bg-gray-900/40'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-white truncate">{a.nombre}</span>
            {a.estado && a.estado !== 'ACTIVE' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-500">{a.estado}</span>
            )}
            {quemando && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">sin ventas</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {numero(a.llegaron)} escribieron · {numero(a.conversaron)} conversaron ·{' '}
            {numero(a.pagados)} pagaron
            {a.costoPorConversacion != null && ` · ${dinero(a.costoPorConversacion)} por chat`}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-white font-semibold">{dinero(a.gasto)}</div>
          <div className="text-[10px] text-gray-500">
            {dinero(a.venta)} · <span className={a.roasCrm >= 1 ? 'text-green-400' : 'text-gray-500'}>{veces(a.roasCrm)}</span>
          </div>
        </div>
      </div>

      {/* El rastreo completo: de este anuncio a los pedidos que produjo. Solo
          aparece si hubo alguno — un botón que siempre abre vacío es ruido. */}
      {a.pedidos > 0 && (
        <>
          <button onClick={() => setVerPedidos(!verPedidos)}
                  className="mt-1.5 mr-3 text-[10px] text-green-400 hover:underline">
            {verPedidos ? 'ocultar los pedidos' : `ver los ${a.pedidos} pedido(s)`}
          </button>
          {verPedidos && <Pedidos {...ctx} anuncio={a.adId} />}
        </>
      )}

      {(a.arteUrl || a.arteTexto || a.arteTitular) && (
        <>
          <button onClick={() => setVerArte(!verArte)}
                  className="mt-1.5 text-[10px] text-mandarina-400 hover:underline">
            {verArte ? 'ocultar el arte' : 'ver el arte'}
          </button>
          {verArte && (
            <div className="mt-2 flex gap-2 items-start">
              {a.arteUrl && (
                a.arteTipo === 'video'
                  ? <video src={a.arteUrl} controls className="w-28 rounded-lg border border-gray-800" />
                  : <img src={a.arteUrl} alt="" className="w-28 rounded-lg border border-gray-800" />
              )}
              <div className="flex-1 min-w-0 text-[10px]">
                {a.arteTitular && <div className="text-white font-semibold">{a.arteTitular}</div>}
                {a.arteTexto && <div className="text-gray-400 mt-0.5 whitespace-pre-line">{a.arteTexto}</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Las cifras de la derecha, iguales en campaña y conjunto. */
function Cifras({ x, chico }) {
  const cls = chico ? 'text-[10px]' : 'text-xs'
  return (
    <div className="text-right flex-shrink-0">
      <div className={`${cls} text-white font-semibold`}>{dinero(x.gasto)}</div>
      <div className="text-[10px] text-gray-500">
        {numero(x.llegaron)} chats · {numero(x.pedidos)} pedidos
      </div>
    </div>
  )
}
