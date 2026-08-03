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

// Cómo se llama y cómo se pinta cada indicador cuando es el elegido.
const NOMBRE = {
  gasto: 'gasto', impresiones: 'impresiones', clics: 'clics',
  llegaron: 'escribieron', respondieron: 'respondieron',
  conversaron: 'conversaron', pedidos: 'compraron', pagados: 'cobrados',
}

/** El embudo completo de un nivel (campaña, conjunto o anuncio). */
function Embudo({ x, metrica }) {
  const pasos = [
    ['impresiones', 'impres.'], ['clics', 'clics'], ['llegaron', 'escrib.'],
    ['respondieron', 'respond.'], ['conversaron', 'convers.'],
    ['pedidos', 'compraron'], ['pagados', 'cobrados'],
  ]
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {pasos.map(([id, etq]) => (
        <div key={id}
             className={`px-2 py-1 rounded text-center min-w-[58px]
                         ${metrica === id ? 'bg-mandarina-500/20 ring-1 ring-mandarina-500/50' : 'bg-gray-800/50'}`}>
          <div className={`text-[11px] font-semibold ${metrica === id ? 'text-mandarina-400' : 'text-gray-200'}`}>
            {numero(x[id] || 0)}
          </div>
          <div className="text-[8px] text-gray-500 leading-none">{etq}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * Ordena por el indicador elegido, de mayor a menor.
 *
 * Sin esto, tocar "impresiones" en el embudo dejaría la tabla ordenada por
 * gasto y habría que buscar a ojo dónde están las impresiones — que es
 * justamente la pregunta que se está haciendo.
 */
function ordenar(items, metrica) {
  return [...(items || [])].sort((a, b) =>
    (b[metrica] || 0) - (a[metrica] || 0) ||
    // Desempate por chats, que es el que hacía el servidor y este orden pisaba.
    // Sin él, los anuncios sin gasto conocido (todos empatados en 0) quedaban en
    // un orden arbitrario que cambiaba entre recargas.
    (b.llegaron || 0) - (a.llegaron || 0)
  )
}

export default function Tabla({ campanas, ctx, metrica = 'gasto' }) {
  if (!campanas?.length) {
    return (
      <div className="card p-8 text-center text-gray-600">
        <div className="text-3xl mb-2">📭</div>
        Sin anuncios con actividad en este rango.
      </div>
    )
  }
  // El total del indicador elegido, para poder decir "esta campaña se lleva el
  // 43%". Un número suelto no responde "¿de dónde sale?"; un porcentaje sí.
  const total = campanas.reduce((s, c) => s + (c[metrica] || 0), 0)

  return (
    <div className="space-y-2">
      {ordenar(campanas, metrica).map((c) => (
        <Campana key={c.campaignId} c={c} ctx={ctx} metrica={metrica} total={total} />
      ))}
    </div>
  )
}

/** El indicador elegido, con su peso sobre el total. */
function Destacado({ x, metrica, total }) {
  if (metrica === 'gasto') return null
  const v = x[metrica] || 0
  const pct = total > 0 ? Math.round((v / total) * 100) : 0
  return (
    <div className="text-right flex-shrink-0 min-w-[64px]">
      <div className="text-sm font-bold text-mandarina-400">{numero(v)}</div>
      <div className="text-[9px] text-gray-500">{pct}% · {NOMBRE[metrica]}</div>
    </div>
  )
}

function Campana({ c, ctx, metrica, total }) {
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
        <Destacado x={c} metrica={metrica} total={total} />
        <Cifras x={c} />
      </button>

      {abierta && (
        <div className="border-t border-gray-800">
          {/* El embudo COMPLETO de la campaña. Es lo que contesta "¿cómo se
              compone esto?" sin tener que sumar los conjuntos a mano. */}
          <div className="px-3 pt-2 pb-1">
            <div className="text-[10px] text-gray-500">Embudo de la campaña</div>
            <Embudo x={c} metrica={metrica} />
          </div>
          <div className="border-t border-gray-800 divide-y divide-gray-800/60">
            {ordenar(c.conjuntos, metrica).map((cj) => (
              <Conjunto key={cj.adsetId} cj={cj} ctx={ctx} metrica={metrica} total={total} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Conjunto({ cj, ctx, metrica, total }) {
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
        <Destacado x={cj} metrica={metrica} total={total} />
        <Cifras x={cj} chico />
      </button>

      {abierto && (
        <div className="pl-8 pb-2 space-y-1.5">
          <div className="pr-3">
            <div className="text-[10px] text-gray-600">Embudo del conjunto</div>
            <Embudo x={cj} metrica={metrica} />
          </div>
          {ordenar(cj.artes, metrica).map((a) => <Anuncio key={a.adId} a={a} ctx={ctx} metrica={metrica} total={total} />)}
        </div>
      )}
    </div>
  )
}

function Anuncio({ a, ctx, metrica, total }) {
  const [verArte, setVerArte] = useState(false)
  const [verPedidos, setVerPedidos] = useState(false)
  // Un anuncio con gasto y sin una sola venta es la señal más accionable del
  // tablero: es plata quemada, y se marca para que salte a la vista.
  //
  // VENTA = que exista el pedido, cobrado o no (regla del negocio, 2-ago-2026).
  // Antes esto miraba `pagados` y marcaba en rojo anuncios que SÍ habían vendido
  // pero cuyo pedido estaba en ABONO: en el período había 46 pedidos así por
  // $3.263, o sea que la señal más importante del tablero mentía.
  const quemando = a.gasto != null && a.gasto > 0 && a.pedidos === 0

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
            <b className="text-gray-400">{numero(a.pedidos)} compraron</b>
            {a.pagados < a.pedidos && (
              <span className="text-gray-600"> ({numero(a.pagados)} ya cobrados)</span>
            )}
            {a.costoPorConversacion != null && ` · ${dinero(a.costoPorConversacion)} por chat`}
          </div>
        </div>
        <Destacado x={a} metrica={metrica} total={total} />
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-white font-semibold">{dinero(a.gasto)}</div>
          <div className="text-[10px] text-gray-500">
            {dinero(a.venta)} · <span className={a.roasCrm >= 1 ? 'text-green-400' : 'text-gray-500'}>{veces(a.roasCrm)}</span>
          </div>
        </div>
      </div>

      {/* El embudo del anuncio: acá es donde se ve de verdad dónde se cae la
          gente. Un creativo con muchas impresiones y pocos chats es un problema
          de mensaje; con muchos chats y pocas ventas, de precio o de producto. */}
      <Embudo x={a} metrica={metrica} />

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
