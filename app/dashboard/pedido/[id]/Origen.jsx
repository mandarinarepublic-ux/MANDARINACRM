'use client'
// El acordeón "Origen" de la ficha del pedido.
//
// Muestra de dónde vino esta venta y, si vino de un anuncio, EL ARTE: la imagen
// o el video con su titular y su texto. Es lo que convierte un `ad_id` en algo
// que un humano puede reconocer — "ah, la del combo de tres".
//
// Lee lo que se congeló al grabar el pedido, no el cruce de hoy: la ficha debe
// decir lo que se decidió entonces, que además es lo que se le reportó a Meta.
//
// Carga perezosa: no pide nada hasta que alguien lo abre. Es un dato de apoyo y
// no tiene por qué pesar en cada apertura de la ficha.
import { useState, useEffect } from 'react'

const ETIQUETAS = {
  por_chat:         { emoji: '💬',   titulo: 'Vino de un anuncio',        nota: 'escribió por WhatsApp desde la pauta y cerró ahí' },
  digital_a_fisico: { emoji: '📲🏬', titulo: 'De la pauta a la tienda',   nota: 'vio el anuncio, escribió y compró en el mostrador' },
  cliente_de_paso:  { emoji: '🚶',   titulo: 'Cliente de paso',           nota: 'compró en el mostrador, sin conversación previa' },
  mensaje_directo:  { emoji: '🗨️',   titulo: 'Mensaje directo',           nota: 'escribió por su cuenta, sin venir de un anuncio' },
  sin_rastro:       { emoji: '❓',   titulo: 'Sin rastro',                nota: 'su celular no aparece en ninguna conversación' },
}

export default function Origen({ pedidoId }) {
  const [abierto, setAbierto] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!abierto || data) return
    let vivo = true
    fetch(`/api/pedidos/origen?pedidoId=${encodeURIComponent(pedidoId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
        if (vivo) setData(d)
      })
      .catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
  }, [abierto, pedidoId, data])

  const e = data?.origen ? ETIQUETAS[data.origen] : null

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setAbierto((a) => !a)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-all">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">🎯 Origen</span>
          {/* Un adelanto en el encabezado: lo más común es querer solo esto. */}
          {e && <span className="text-xs text-gray-500">{e.emoji} {e.titulo}</span>}
        </div>
        <span className="text-gray-500">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="border-t border-gray-800 px-4 py-3">
          {error ? (
            <div className="text-xs text-red-400">⚠️ {error}</div>
          ) : !data ? (
            <div className="text-xs text-gray-600">cargando…</div>
          ) : !data.origen ? (
            // Los pedidos anteriores al 13-jul no tienen con qué: el webhook no
            // guardaba de qué anuncio venía cada chat.
            <div className="text-xs text-gray-600">
              Este pedido es anterior a que se guardara el origen de las conversaciones.
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-sm text-white">{e.emoji} {e.titulo}</div>
                <div className="text-xs text-gray-500 mt-0.5">{e.nota}</div>
              </div>

              {data.telefonoChat && (
                <div className="text-xs">
                  <span className="text-gray-600">Conversación: </span>
                  <span className="font-mono text-gray-300">{data.telefonoChat}</span>
                  {/* El chat puede estar a nombre de otra persona: quien pregunta
                      no siempre es quien queda en el pedido. */}
                </div>
              )}

              {data.anuncio && (
                <div className="rounded-lg bg-gray-800/40 p-3">
                  <div className="text-[10px] text-gray-500 mb-1">El anuncio que lo trajo</div>
                  <div className="text-xs text-white">{data.anuncio.nombre || `Anuncio ${data.anuncio.adId}`}</div>
                  {data.anuncio.campana && (
                    <div className="text-[10px] text-gray-500">
                      {data.anuncio.campana}
                      {data.anuncio.conjunto ? ` · ${data.anuncio.conjunto}` : ''}
                    </div>
                  )}

                  {(data.anuncio.arteUrl || data.anuncio.arteTitular || data.anuncio.arteTexto) && (
                    <div className="mt-2 flex gap-3 items-start">
                      {data.anuncio.arteUrl && (
                        data.anuncio.arteTipo === 'video'
                          ? <video src={data.anuncio.arteUrl} controls
                                   className="w-32 rounded-lg border border-gray-700 flex-shrink-0" />
                          : <img src={data.anuncio.arteUrl} alt=""
                                 className="w-32 rounded-lg border border-gray-700 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 text-[11px]">
                        {data.anuncio.arteTitular && (
                          <div className="text-white font-semibold">{data.anuncio.arteTitular}</div>
                        )}
                        {data.anuncio.arteTexto && (
                          <div className="text-gray-400 mt-1 whitespace-pre-line">{data.anuncio.arteTexto}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {!data.anuncio.nombre && (
                    <div className="text-[10px] text-gray-600 mt-1">
                      El detalle de este anuncio todavía no se ha traído de Meta.
                    </div>
                  )}
                </div>
              )}

              {data.tieneClid && (
                <div className="text-[10px] text-green-500">
                  ✓ Se le reportó a Meta con el anuncio exacto
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
